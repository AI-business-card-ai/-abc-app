-- Smart Scan credit ledger, Stripe webhook idempotency, and Pro billing state.
--
-- ADDITIVE ONLY. Three new tables, five functions and one trigger function.
-- No existing table, column, row, constraint or policy is altered, dropped or
-- backfilled — `abc_profiles.plan`, `scans_used` and `stripe_customer_id` keep
-- serving production exactly as they do today. The application reads this
-- ledger only when SMART_SCAN_LEDGER=on, so applying this migration changes no
-- behaviour by itself.
--
-- Why a ledger rather than a balance column. A number on a profile can say how
-- many credits somebody has; it cannot say why, and a Smart Scan credit is money
-- somebody paid. Every grant and every spend is therefore a row: who, how many,
-- from what, against which purchase or card, and under which idempotency key. The
-- balance is the sum of those rows. Nothing expires, because nothing here has a
-- date that means "until".

-- ---------------------------------------------------------------
-- 1. The ledger
-- ---------------------------------------------------------------
create table if not exists public.scan_credit_ledger (
  id uuid primary key default gen_random_uuid(),

  -- The owner. Dies with the account: a deleted person's balance is not a debt
  -- anybody can collect, and keeping it would keep a record of them.
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Signed. A grant adds, a consumption subtracts one card.
  delta integer not null,

  -- What sort of movement this is.
  --   grant            credits bought or given
  --   consume          one accepted physical card
  --   reversal         an explicit correction of an earlier row (refunds later)
  --   opening_balance  the one-time bridge from the legacy plan counters; may be
  --                    zero, because "this owner had nothing left" is still the
  --                    fact that the bridge ran
  kind text not null
    check (kind in ('grant', 'consume', 'reversal', 'opening_balance')),

  -- Where it came from.
  source text not null
    check (source in ('stripe_checkout', 'legacy_bridge', 'single_scan', 'batch_item', 'manual')),

  -- The external or internal thing this row is about: a Checkout Session id, a
  -- batch item id, a scan digest. Never personal data.
  source_ref text,

  -- The catalogue product a grant was bought as, when there was one.
  product_key text,

  -- The guarantee that nothing happens twice. Namespaced by the application
  -- (`stripe:checkout:<session>`, `batch_item:<item>`, `single_scan:<digest>`,
  -- `legacy_opening:<user>`) and unique across the table, so a retried request,
  -- a duplicated webhook or a restarted server all land on the same row.
  idempotency_key text not null,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  constraint scan_credit_ledger_idempotency_key unique (idempotency_key),
  constraint scan_credit_ledger_sign check (
    (kind = 'grant' and delta > 0)
    or (kind = 'consume' and delta = -1)
    or (kind = 'reversal' and delta <> 0)
    or (kind = 'opening_balance' and delta >= 0)
  )
);

comment on table public.scan_credit_ledger is
  'Append-only Smart Scan credit movements. Balance = sum(delta). Rows are never updated.';

create index if not exists scan_credit_ledger_user_created_idx
  on public.scan_credit_ledger (user_id, created_at desc);

-- ---------------------------------------------------------------
-- Immutability
-- ---------------------------------------------------------------
-- Economic records are corrected by adding a row, never by editing one. The
-- privileges below already give no role UPDATE; this trigger makes the rule hold
-- for a connection that owns the table as well, so no maintenance script can
-- quietly rewrite what somebody paid for.
--
-- DELETE is withheld by privilege rather than by trigger, because account
-- deletion must still cascade through the foreign key above.
create or replace function public.scan_credit_ledger_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'scan_credit_ledger rows are immutable; add a reversal instead'
    using errcode = '42501';
end;
$$;

drop trigger if exists scan_credit_ledger_no_update on public.scan_credit_ledger;
create trigger scan_credit_ledger_no_update
  before update on public.scan_credit_ledger
  for each row execute function public.scan_credit_ledger_immutable();

-- ---------------------------------------------------------------
-- No negative balance, enforced by the database
-- ---------------------------------------------------------------
-- The consume function already refuses to spend what is not there. This makes
-- the same promise for every other way a negative row could arrive — a reversal,
-- a manual correction — so "balance is never below zero" is a property of the
-- table rather than of one caller being careful.
create or replace function public.scan_credit_ledger_non_negative()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.delta < 0
     and (select coalesce(sum(l.delta), 0) from public.scan_credit_ledger l where l.user_id = new.user_id) < 0
  then
    raise exception 'scan credit balance cannot go below zero'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

drop trigger if exists scan_credit_ledger_non_negative on public.scan_credit_ledger;
create constraint trigger scan_credit_ledger_non_negative
  after insert on public.scan_credit_ledger
  for each row execute function public.scan_credit_ledger_non_negative();

-- ---------------------------------------------------------------
-- Balance
-- ---------------------------------------------------------------
create or replace function public.scan_credit_balance(p_user_id uuid)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(l.delta), 0)::integer
  from public.scan_credit_ledger l
  where l.user_id = p_user_id
$$;

-- ---------------------------------------------------------------
-- Grant
-- ---------------------------------------------------------------
-- Idempotent by key. A second call with the same key writes nothing and says so,
-- which is what makes a duplicated webhook harmless.
--
-- The per-owner advisory lock serialises this with consumption, so a grant and a
-- spend arriving together cannot interleave between reading and writing.
create or replace function public.grant_scan_credits(
  p_user_id uuid,
  p_amount integer,
  p_kind text,
  p_source text,
  p_source_ref text,
  p_product_key text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns table (granted boolean, balance integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rows integer;
  v_owner uuid;
begin
  if p_user_id is null or p_idempotency_key is null or length(p_idempotency_key) = 0 then
    raise exception 'grant_scan_credits: owner and idempotency key are required' using errcode = '22023';
  end if;
  if p_kind not in ('grant', 'opening_balance') then
    raise exception 'grant_scan_credits: kind must be grant or opening_balance' using errcode = '22023';
  end if;
  -- Never a silent zero grant for a purchase. Only the legacy bridge may record
  -- zero, because "nothing was left" is still the fact it exists to record.
  if p_amount is null or (p_kind = 'grant' and p_amount < 1) or (p_kind = 'opening_balance' and p_amount < 0) then
    raise exception 'grant_scan_credits: invalid amount' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  insert into public.scan_credit_ledger
    (user_id, delta, kind, source, source_ref, product_key, idempotency_key, metadata)
  values
    (p_user_id, p_amount, p_kind, p_source, p_source_ref, p_product_key, p_idempotency_key,
     coalesce(p_metadata, '{}'::jsonb))
  on conflict (idempotency_key) do nothing;

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    -- The key exists. It must be this owner's, or something upstream is wrong.
    select l.user_id into v_owner from public.scan_credit_ledger l where l.idempotency_key = p_idempotency_key;
    if v_owner is distinct from p_user_id then
      raise exception 'grant_scan_credits: idempotency key belongs to another owner' using errcode = '23505';
    end if;
  end if;

  return query select v_rows > 0, public.scan_credit_balance(p_user_id);
end;
$$;

-- ---------------------------------------------------------------
-- Consume one accepted card
-- ---------------------------------------------------------------
-- Returns one of:
--   consumed          a credit was spent now
--   already_consumed  this key was spent before; nothing changes
--   insufficient      no credit to spend; nothing changes
--
-- The key is the card's own identity — a batch item, a scan — so a retry, a
-- repeated save, or a request replayed after a restart finds the earlier row and
-- charges nothing.
create or replace function public.consume_scan_credit(
  p_user_id uuid,
  p_source text,
  p_source_ref text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns table (outcome text, balance integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_kind text;
  v_balance integer;
begin
  if p_user_id is null or p_idempotency_key is null or length(p_idempotency_key) = 0 then
    raise exception 'consume_scan_credit: owner and idempotency key are required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select l.user_id, l.kind into v_owner, v_kind
  from public.scan_credit_ledger l
  where l.idempotency_key = p_idempotency_key;

  if found then
    if v_owner is distinct from p_user_id or v_kind <> 'consume' then
      raise exception 'consume_scan_credit: idempotency key already used for something else' using errcode = '23505';
    end if;
    return query select 'already_consumed'::text, public.scan_credit_balance(p_user_id);
    return;
  end if;

  v_balance := public.scan_credit_balance(p_user_id);
  if v_balance < 1 then
    return query select 'insufficient'::text, v_balance;
    return;
  end if;

  insert into public.scan_credit_ledger
    (user_id, delta, kind, source, source_ref, idempotency_key, metadata)
  values
    (p_user_id, -1, 'consume', p_source, p_source_ref, p_idempotency_key, coalesce(p_metadata, '{}'::jsonb));

  return query select 'consumed'::text, v_balance - 1;
end;
$$;

-- ---------------------------------------------------------------
-- 2. Stripe webhook events
-- ---------------------------------------------------------------
-- A record of every event received, keyed by Stripe's own id. Economic
-- idempotency does not rest on this table — a grant is keyed by its Checkout
-- Session in the ledger — but this is how a duplicate delivery is recognised
-- before any work, and how a failed one is found and retried.
create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  livemode boolean not null default false,
  status text not null default 'processing'
    check (status in ('processing', 'processed', 'ignored', 'failed')),
  attempts integer not null default 1,
  -- A short code for the failure, never a message: messages can quote payloads.
  error_code text,
  stripe_created_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

comment on table public.stripe_webhook_events is
  'Stripe webhook deliveries by event id, for duplicate detection and retry. No payloads stored.';

-- Claim an event for processing. Returns:
--   new        first delivery
--   retry      seen before but never finished (failed, or interrupted) — process again
--   duplicate  already processed or deliberately ignored — do nothing
--
-- Reprocessing an unfinished event is safe because every economic effect is
-- itself idempotent; the alternative, trusting a row stuck at "processing"
-- after a crash, would lose a purchase.
create or replace function public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_stripe_created_at timestamptz
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rows integer;
begin
  insert into public.stripe_webhook_events (event_id, event_type, livemode, stripe_created_at)
  values (p_event_id, p_event_type, coalesce(p_livemode, false), p_stripe_created_at)
  on conflict (event_id) do nothing;

  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    return 'new';
  end if;

  update public.stripe_webhook_events
     set attempts = attempts + 1,
         status = 'processing',
         error_code = null
   where event_id = p_event_id
     and status not in ('processed', 'ignored');

  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    return 'retry';
  end if;

  return 'duplicate';
end;
$$;

-- ---------------------------------------------------------------
-- 3. Pro billing state (preparation only — nothing gates on it yet)
-- ---------------------------------------------------------------
create table if not exists public.billing_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  product_key text not null
    check (product_key in ('pro_event', 'pro_monthly', 'pro_annual')),

  status text not null
    check (status in ('active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused', 'canceled', 'expired')),

  source text not null default 'stripe' check (source in ('stripe')),

  -- A subscription for monthly and annual; a Checkout Session for an Event Pass,
  -- which is a one-time purchase with a period of its own.
  stripe_subscription_id text,
  stripe_checkout_session_id text,

  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,

  -- When Stripe created the event that last changed this row. An older event
  -- delivered late is compared against it and discarded, so out-of-order
  -- webhooks cannot resurrect a cancelled subscription.
  last_stripe_event_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint billing_entitlements_reference check (
    stripe_subscription_id is not null or stripe_checkout_session_id is not null
  )
);

create unique index if not exists billing_entitlements_subscription_key
  on public.billing_entitlements (stripe_subscription_id)
  where stripe_subscription_id is not null;

create unique index if not exists billing_entitlements_checkout_key
  on public.billing_entitlements (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists billing_entitlements_user_idx
  on public.billing_entitlements (user_id);

-- Apply a Stripe-sourced state, idempotently and in order. Returns 'applied' or
-- 'stale' (an older event, or a reference that belongs to another owner).
create or replace function public.apply_billing_entitlement(
  p_user_id uuid,
  p_product_key text,
  p_status text,
  p_stripe_subscription_id text,
  p_stripe_checkout_session_id text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_event_at timestamptz
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if p_stripe_subscription_id is not null then
    insert into public.billing_entitlements as e
      (user_id, product_key, status, stripe_subscription_id, stripe_checkout_session_id,
       current_period_start, current_period_end, cancel_at_period_end, last_stripe_event_at)
    values
      (p_user_id, p_product_key, p_status, p_stripe_subscription_id, p_stripe_checkout_session_id,
       p_current_period_start, p_current_period_end, coalesce(p_cancel_at_period_end, false), p_event_at)
    on conflict (stripe_subscription_id) where stripe_subscription_id is not null
    do update set
      status = excluded.status,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end,
      last_stripe_event_at = excluded.last_stripe_event_at,
      updated_at = now()
    where e.user_id = excluded.user_id
      and (e.last_stripe_event_at is null or e.last_stripe_event_at <= excluded.last_stripe_event_at);
  elsif p_stripe_checkout_session_id is not null then
    insert into public.billing_entitlements as e
      (user_id, product_key, status, stripe_checkout_session_id,
       current_period_start, current_period_end, cancel_at_period_end, last_stripe_event_at)
    values
      (p_user_id, p_product_key, p_status, p_stripe_checkout_session_id,
       p_current_period_start, p_current_period_end, coalesce(p_cancel_at_period_end, false), p_event_at)
    on conflict (stripe_checkout_session_id) where stripe_checkout_session_id is not null
    do update set
      status = excluded.status,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      last_stripe_event_at = excluded.last_stripe_event_at,
      updated_at = now()
    where e.user_id = excluded.user_id
      and (e.last_stripe_event_at is null or e.last_stripe_event_at <= excluded.last_stripe_event_at);
  else
    raise exception 'apply_billing_entitlement: a subscription or checkout reference is required' using errcode = '22023';
  end if;

  get diagnostics v_rows = row_count;
  return case when v_rows > 0 then 'applied' else 'stale' end;
end;
$$;

-- ---------------------------------------------------------------
-- Row-level security and privileges
-- ---------------------------------------------------------------
-- Same shape as every recent table here: REVOKE first, because this project's
-- default privileges hand new tables to anon and authenticated; then grant back
-- only what is needed.
--
-- Owners may READ their own credit history and Pro state. Nobody but the server
-- writes anything: authenticated holds no INSERT, UPDATE or DELETE on any of
-- these tables and no EXECUTE on any function, so credits cannot be minted,
-- spent, edited or erased from a browser.
alter table public.scan_credit_ledger enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.billing_entitlements enable row level security;

drop policy if exists "scan_credit_ledger_select_own" on public.scan_credit_ledger;
create policy "scan_credit_ledger_select_own" on public.scan_credit_ledger
  for select
  using (auth.uid() = user_id);

drop policy if exists "billing_entitlements_select_own" on public.billing_entitlements;
create policy "billing_entitlements_select_own" on public.billing_entitlements
  for select
  using (auth.uid() = user_id);

-- stripe_webhook_events: no policy at all. Server only.

revoke all on table public.scan_credit_ledger from public;
revoke all on table public.scan_credit_ledger from anon, authenticated;
revoke all on table public.stripe_webhook_events from public;
revoke all on table public.stripe_webhook_events from anon, authenticated;
revoke all on table public.billing_entitlements from public;
revoke all on table public.billing_entitlements from anon, authenticated;

grant select on table public.scan_credit_ledger to authenticated;
grant select on table public.billing_entitlements to authenticated;

-- The server: it inserts ledger rows (through the functions) but never updates
-- or deletes them.
grant select, insert on table public.scan_credit_ledger to service_role;
grant select, insert, update on table public.stripe_webhook_events to service_role;
grant select, insert, update on table public.billing_entitlements to service_role;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, and PostgREST publishes
-- every function a role can execute. Revoking from anon and authenticated alone
-- would leave both holding it through PUBLIC.
revoke all on function public.scan_credit_balance(uuid) from public;
revoke all on function public.scan_credit_balance(uuid) from anon, authenticated;
revoke all on function public.grant_scan_credits(uuid, integer, text, text, text, text, text, jsonb) from public;
revoke all on function public.grant_scan_credits(uuid, integer, text, text, text, text, text, jsonb) from anon, authenticated;
revoke all on function public.consume_scan_credit(uuid, text, text, text, jsonb) from public;
revoke all on function public.consume_scan_credit(uuid, text, text, text, jsonb) from anon, authenticated;
revoke all on function public.claim_stripe_webhook_event(text, text, boolean, timestamptz) from public;
revoke all on function public.claim_stripe_webhook_event(text, text, boolean, timestamptz) from anon, authenticated;
revoke all on function public.apply_billing_entitlement(uuid, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz) from public;
revoke all on function public.apply_billing_entitlement(uuid, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz) from anon, authenticated;
revoke all on function public.scan_credit_ledger_immutable() from public;
revoke all on function public.scan_credit_ledger_non_negative() from public;

grant execute on function public.scan_credit_balance(uuid) to service_role;
grant execute on function public.grant_scan_credits(uuid, integer, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.consume_scan_credit(uuid, text, text, text, jsonb) to service_role;
grant execute on function public.claim_stripe_webhook_event(text, text, boolean, timestamptz) to service_role;
grant execute on function public.apply_billing_entitlement(uuid, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz) to service_role;

notify pgrst, 'reload schema';
