-- Connecting Gmail or a CRM from inside the native app.
--
-- Every web connection proves two things at its callback before a token is
-- stored: a signed, single-use state cookie naming the account that started the
-- flow, and a live ABC session belonging to that same account. In the store
-- apps the provider's consent screen opens in the system browser, and the
-- callback lands there — in a browser that holds neither. So the app could not
-- connect anything, and lib/native/connect-gate.ts said so.
--
-- This table is what replaces the cookie for the app. One row per attempt:
--
--   1. start     The app, signed in inside its WebView, asks to connect. The
--                row binds the owner, the provider, the hash of a nonce the app
--                keeps, and the hash of the opaque state sent to the provider.
--   2. callback  The system browser returns with that state. The row is taken
--                from pending to exchanging in one statement, so a replayed
--                callback finds nothing; the code is exchanged; the result is
--                stored encrypted, with the hash of a one-time handoff value
--                that is passed back to the app on the device that consented.
--   3. claim     The app, still signed in, presents the nonce and the handoff.
--                Only the owner who started the attempt, holding both, can take
--                the result — once — and the encrypted result is wiped as it is
--                taken.
--
-- Why both the nonce and the handoff. The nonce stops an intercepted deep link
-- from being redeemed by anybody but the app that started the attempt. The
-- handoff stops the reverse: somebody starting an attempt on their own account
-- and persuading another person to consent to it would otherwise collect that
-- person's mailbox or CRM, because the callback no longer runs in the starter's
-- own browser. The handoff only ever reaches the device that consented.
--
-- Nothing secret is stored in the clear: the state, the nonce and the handoff
-- are stored as SHA-256 hashes; the PKCE verifier and the provider tokens are
-- AES-256-GCM ciphertext from lib/crm/encryption.ts, and both are cleared as
-- soon as they are no longer needed. Expired rows are deleted whenever a new
-- attempt starts.
--
-- ADDITIVE ONLY: one table, five functions, and remove_account_data redefined
-- to delete this table's rows with the rest of the account's credentials. No
-- existing table, column, row, constraint or policy is altered or dropped, and
-- the migration writes no row.

create table if not exists public.native_connector_attempts (
  id uuid primary key default gen_random_uuid(),

  -- The owner who started the attempt, from their verified session.
  user_id uuid not null references auth.users (id) on delete cascade,

  provider text not null
    check (provider in ('google-gmail', 'hubspot', 'salesforce', 'pipedrive')),

  -- SHA-256 of the state sent to the provider. Unique: one attempt per state.
  state_hash text not null,
  -- SHA-256 of the nonce the app keeps. The nonce itself never leaves the app
  -- until the claim, and is never stored.
  nonce_hash text not null,
  -- SHA-256 of the handoff value minted at a successful callback.
  handoff_hash text,

  -- Salesforce's PKCE verifier, encrypted; cleared once the callback has used it.
  pkce_verifier_encrypted text,

  -- A local path the app returns to (Gmail only); CRM connections always return
  -- to Integrations.
  return_to text,

  --   pending      started, waiting for the provider
  --   exchanging   the callback has taken it; the code is being exchanged
  --   authorized   tokens held encrypted, waiting for the app to claim them
  --   claimed      the app took them; nothing secret remains on the row
  --   failed       cancelled or refused; nothing secret remains on the row
  status text not null default 'pending'
    check (status in ('pending', 'exchanging', 'authorized', 'claimed', 'failed')),

  -- A short code for why it failed. Never a provider message.
  failure_code text,

  result_encrypted text,

  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  callback_at timestamptz,
  authorized_at timestamptz,
  claimed_at timestamptz,

  constraint native_connector_attempts_state_key unique (state_hash),
  -- Tokens exist on a row only while it waits to be claimed, and a row that
  -- waits to be claimed always has them and a handoff.
  constraint native_connector_attempts_result_only_when_authorized
    check (result_encrypted is null or status = 'authorized'),
  constraint native_connector_attempts_authorized_complete
    check (status <> 'authorized' or (result_encrypted is not null and handoff_hash is not null))
);

comment on table public.native_connector_attempts is
  'Native Gmail/CRM connection attempts: owner, provider, hashed state/nonce/handoff, encrypted PKCE verifier and tokens until claimed. Server only.';

create index if not exists native_connector_attempts_user_idx
  on public.native_connector_attempts (user_id);
create index if not exists native_connector_attempts_expires_idx
  on public.native_connector_attempts (expires_at);

-- ---------------------------------------------------------------
-- Start
-- ---------------------------------------------------------------
-- Deletes every expired attempt, whoever it belonged to, then records this one.
-- Expired rows are useless by definition, and an abandoned authorized attempt
-- still holds encrypted tokens, so they are not kept waiting for a sweep.
create or replace function public.create_native_connector_attempt(
  p_user_id uuid,
  p_provider text,
  p_state_hash text,
  p_nonce_hash text,
  p_pkce_verifier_encrypted text,
  p_return_to text,
  p_ttl_seconds integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user_id is null or p_state_hash is null or p_nonce_hash is null
     or p_ttl_seconds is null or p_ttl_seconds < 1 then
    raise exception 'create_native_connector_attempt: owner, state, nonce and ttl are required' using errcode = '22023';
  end if;

  delete from public.native_connector_attempts a where a.expires_at <= now();

  insert into public.native_connector_attempts
    (user_id, provider, state_hash, nonce_hash, pkce_verifier_encrypted, return_to, expires_at)
  values
    (p_user_id, p_provider, p_state_hash, p_nonce_hash, p_pkce_verifier_encrypted, p_return_to,
     now() + make_interval(secs => p_ttl_seconds))
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------
-- Callback: take the attempt
-- ---------------------------------------------------------------
-- One statement moves a live, pending attempt for this state and provider to
-- exchanging and hands back what the exchange needs. A second callback with the
-- same state — a replay, a double tap, a refreshed page — finds nothing.
create or replace function public.begin_native_connector_callback(
  p_state_hash text,
  p_provider text
)
returns table (attempt_id uuid, pkce_verifier_encrypted text)
language sql
security invoker
set search_path = ''
as $$
  update public.native_connector_attempts a
     set status = 'exchanging',
         callback_at = now()
   where a.state_hash = p_state_hash
     and a.provider = p_provider
     and a.status = 'pending'
     and a.expires_at > now()
  returning a.id, a.pkce_verifier_encrypted
$$;

-- ---------------------------------------------------------------
-- Callback: store the result, or the failure
-- ---------------------------------------------------------------
create or replace function public.complete_native_connector_callback(
  p_attempt_id uuid,
  p_result_encrypted text,
  p_handoff_hash text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if p_result_encrypted is null or p_handoff_hash is null then
    raise exception 'complete_native_connector_callback: result and handoff are required' using errcode = '22023';
  end if;

  update public.native_connector_attempts a
     set status = 'authorized',
         result_encrypted = p_result_encrypted,
         handoff_hash = p_handoff_hash,
         pkce_verifier_encrypted = null,
         authorized_at = now()
   where a.id = p_attempt_id
     and a.status = 'exchanging'
     and a.expires_at > now();

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

create or replace function public.fail_native_connector_attempt(
  p_attempt_id uuid,
  p_failure_code text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.native_connector_attempts a
     set status = 'failed',
         failure_code = left(p_failure_code, 60),
         result_encrypted = null,
         handoff_hash = null,
         pkce_verifier_encrypted = null
   where a.id = p_attempt_id
     and a.status in ('pending', 'exchanging', 'authorized')
$$;

-- ---------------------------------------------------------------
-- Claim
-- ---------------------------------------------------------------
-- Returns the encrypted result once, to the owner who started the attempt,
-- presenting the nonce behind its hash and the handoff from the callback, while
-- it is still live. The same statement marks it claimed and wipes the result,
-- so a second claim — a replay, a second tab, another account — gets nothing.
--
-- A wrong nonce or handoff does not burn the attempt: guessing either is not
-- feasible, and burning would let anybody who saw an attempt id cancel the
-- owner's connection.
create or replace function public.claim_native_connector_attempt(
  p_attempt_id uuid,
  p_user_id uuid,
  p_nonce_hash text,
  p_handoff_hash text
)
returns table (provider text, result_encrypted text, return_to text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_provider text;
  v_result text;
  v_return_to text;
begin
  select a.provider, a.result_encrypted, a.return_to
    into v_provider, v_result, v_return_to
    from public.native_connector_attempts a
   where a.id = p_attempt_id
     and a.user_id = p_user_id
     and a.nonce_hash = p_nonce_hash
     and a.handoff_hash = p_handoff_hash
     and a.status = 'authorized'
     and a.expires_at > now()
   for update;

  if not found then
    return;
  end if;

  update public.native_connector_attempts a
     set status = 'claimed',
         claimed_at = now(),
         result_encrypted = null,
         handoff_hash = null
   where a.id = p_attempt_id;

  return query select v_provider, v_result, v_return_to;
end;
$$;

-- ---------------------------------------------------------------
-- Account deletion removes attempts with the other credentials
-- ---------------------------------------------------------------
-- 20260916120000_account_deletion's remove_account_data, unchanged except for
-- one statement: an authorized attempt holds encrypted tokens, so it goes in the
-- same transaction as crm_connections rather than waiting for the auth user's
-- cascade.
create or replace function public.remove_account_data(p_user_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_customer text;
begin
  if p_user_id is null then
    raise exception 'remove_account_data: owner is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  if public.account_deletion_blocker(p_user_id) is not null then
    return 'active_subscription';
  end if;

  select nullif(btrim(coalesce(p.stripe_customer_id, '')), '') into v_customer
  from public.abc_profiles p
  where p.id = p_user_id;

  insert into public.account_deletions as d (
    user_id, status, data_removed_at, stripe_customer_id,
    credit_summary, credit_purchases, pro_entitlements
  )
  values (
    p_user_id,
    'data_removed',
    now(),
    v_customer,
    (
      select jsonb_build_object(
        'granted', coalesce(sum(l.delta) filter (where l.kind = 'grant'), 0),
        'opening_balance', coalesce(sum(l.delta) filter (where l.kind = 'opening_balance'), 0),
        'consumed', coalesce(-sum(l.delta) filter (where l.kind = 'consume'), 0),
        'reversed', coalesce(sum(l.delta) filter (where l.kind = 'reversal'), 0),
        'balance_at_deletion', coalesce(sum(l.delta), 0),
        'movements', count(*)
      )
      from public.scan_credit_ledger l
      where l.user_id = p_user_id
    ),
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'source', l.source,
            'source_ref', l.source_ref,
            'product_key', l.product_key,
            'credits', l.delta,
            'created_at', l.created_at
          )
          order by l.created_at, l.id
        ),
        '[]'::jsonb
      )
      from public.scan_credit_ledger l
      where l.user_id = p_user_id
        and l.kind = 'grant'
    ),
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'product_key', e.product_key,
            'status', e.status,
            'stripe_subscription_id', e.stripe_subscription_id,
            'stripe_checkout_session_id', e.stripe_checkout_session_id,
            'current_period_start', e.current_period_start,
            'current_period_end', e.current_period_end,
            'cancel_at_period_end', e.cancel_at_period_end
          )
          order by e.created_at, e.id
        ),
        '[]'::jsonb
      )
      from public.billing_entitlements e
      where e.user_id = p_user_id
    )
  )
  on conflict (user_id) do update set
    attempts = d.attempts + 1,
    status = case when d.status = 'completed' then 'completed' else 'data_removed' end,
    data_removed_at = now(),
    -- The profile is already gone on a retry; keep the reference taken first.
    stripe_customer_id = coalesce(excluded.stripe_customer_id, d.stripe_customer_id),
    credit_summary = excluded.credit_summary,
    credit_purchases = excluded.credit_purchases,
    pro_entitlements = excluded.pro_entitlements,
    updated_at = now();

  -- Credentials first in reading order; in effect all at once, one transaction.
  delete from public.crm_connections where user_id = p_user_id;
  delete from public.native_connector_attempts where user_id = p_user_id;
  delete from public.crm_object_mappings where user_id = p_user_id;

  -- Scan history, before the contacts it points at.
  delete from public.scan_batch_items where user_id = p_user_id;
  delete from public.scan_batches where user_id = p_user_id;

  -- Relationship data.
  delete from public.followup_sequences where user_id = p_user_id;
  delete from public.crm_activities where user_id = p_user_id;
  delete from public.crm_opportunities where user_id = p_user_id;
  delete from public.contact_encounters where user_id = p_user_id;
  delete from public.scanned_contacts where user_id = p_user_id;

  -- The public card and its analytics.
  delete from public.card_showcase_items where user_id = p_user_id;
  delete from public.card_links where user_id = p_user_id;
  delete from public.card_events where user_id = p_user_id;
  delete from public.card_views where user_id = p_user_id;

  -- The profile last: its row holds the card's slug and published flag, the
  -- Google credentials and every identity field.
  delete from public.abc_profiles where id = p_user_id;

  return 'removed';
end;
$$;

-- ---------------------------------------------------------------
-- Row-level security and privileges
-- ---------------------------------------------------------------
-- Server only, like crm_connections. REVOKE first: this project's default
-- privileges hand new tables and functions to anon and authenticated.
alter table public.native_connector_attempts enable row level security;

revoke all on table public.native_connector_attempts from public;
revoke all on table public.native_connector_attempts from anon, authenticated;

grant select, insert, update, delete on table public.native_connector_attempts to service_role;

revoke all on function public.create_native_connector_attempt(uuid, text, text, text, text, text, integer) from public;
revoke all on function public.create_native_connector_attempt(uuid, text, text, text, text, text, integer) from anon, authenticated;
revoke all on function public.begin_native_connector_callback(text, text) from public;
revoke all on function public.begin_native_connector_callback(text, text) from anon, authenticated;
revoke all on function public.complete_native_connector_callback(uuid, text, text) from public;
revoke all on function public.complete_native_connector_callback(uuid, text, text) from anon, authenticated;
revoke all on function public.fail_native_connector_attempt(uuid, text) from public;
revoke all on function public.fail_native_connector_attempt(uuid, text) from anon, authenticated;
revoke all on function public.claim_native_connector_attempt(uuid, uuid, text, text) from public;
revoke all on function public.claim_native_connector_attempt(uuid, uuid, text, text) from anon, authenticated;
revoke all on function public.remove_account_data(uuid) from public;
revoke all on function public.remove_account_data(uuid) from anon, authenticated;

grant execute on function public.create_native_connector_attempt(uuid, text, text, text, text, text, integer) to service_role;
grant execute on function public.begin_native_connector_callback(text, text) to service_role;
grant execute on function public.complete_native_connector_callback(uuid, text, text) to service_role;
grant execute on function public.fail_native_connector_attempt(uuid, text) to service_role;
grant execute on function public.claim_native_connector_attempt(uuid, uuid, text, text) to service_role;
grant execute on function public.remove_account_data(uuid) to service_role;

notify pgrst, 'reload schema';
