-- Deleting a whole ABC account.
--
-- Not a contact delete. This removes the owner: their public card, their
-- contacts and meetings, their scan sessions, their follow-ups, their CRM and
-- Gmail credentials, and finally their sign-in. The application runs it in
-- three steps (lib/account/delete.ts) and this migration provides the first:
--
--   1. remove_account_data   one transaction: refuse while a subscription still
--                            bills, write the deletion record, delete every
--                            owner-scoped row ABC keeps about the account
--   2. storage               the owner's uploaded images, through the Storage API
--   3. auth user             last, and the only irreversible step that cannot be
--                            retried by the owner — so nothing else may still be
--                            left to do when it runs
--
-- ADDITIVE ONLY. One new table, two new functions, and DELETE granted to the
-- service role on tables it already writes. No existing table, column, row,
-- constraint, trigger or policy is altered or dropped, and the migration itself
-- writes no row.

-- ---------------------------------------------------------------
-- 1. The deletion record
-- ---------------------------------------------------------------
-- One row per deleted account, and the only thing that outlives it.
--
-- Why anything survives at all. A Smart Scan credit and an ABC Pro period are
-- things somebody paid for. The ledger and the entitlement rows that describe
-- them die with the account, through their own foreign keys, exactly as
-- 20260912120000_smart_scan_credit_ledger designed ("a deleted person's balance
-- is not a debt anybody can collect"). What that leaves nobody able to answer is
-- the accounting question afterwards — a dispute, a chargeback, a refund request
-- — about what was bought and what was used. So before anything is deleted, the
-- economic facts are copied here, and nothing else is:
--
--   stripe_customer_id   the processor's own reference, which is where the
--                        payment records themselves live
--   credit_summary       totals only: granted, opening balance, consumed,
--                        reversed, and the balance the account still held
--   credit_purchases     each grant: source, its Checkout Session reference,
--                        product, amount, when — never a card, scan or person
--   pro_entitlements     product, status, Stripe references and periods
--
-- No name, email, phone, company, card, contact or note is stored. user_id is
-- kept without a foreign key: while deletion is under way it is how a retry
-- finds its own record, and afterwards it is the same pseudonymous id Stripe's
-- metadata already carries, so the record can be matched to a payment and to
-- nothing else.
--
-- How long this row is kept is a legal and commercial decision that has not
-- been made. Nothing here expires it, and nothing here pretends to know.
create table if not exists public.account_deletions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null,

  --   data_removed  step 1 committed; storage or the auth user may still be left
  --   completed     the auth user is gone
  status text not null default 'data_removed'
    check (status in ('data_removed', 'completed')),

  attempts integer not null default 1,

  -- A short code for the step that last failed. Never a message: messages can
  -- quote rows.
  last_error_code text,

  requested_at timestamptz not null default now(),
  data_removed_at timestamptz,
  completed_at timestamptz,

  stripe_customer_id text,
  credit_summary jsonb not null default '{}'::jsonb,
  credit_purchases jsonb not null default '[]'::jsonb,
  pro_entitlements jsonb not null default '[]'::jsonb,

  updated_at timestamptz not null default now(),

  constraint account_deletions_user_key unique (user_id)
);

comment on table public.account_deletions is
  'One row per deleted ABC account: deletion progress and the anonymised economic record (credits, purchases, Pro billing). No contact or profile data. Retention period not yet decided.';

-- ---------------------------------------------------------------
-- 2. What stops a deletion
-- ---------------------------------------------------------------
-- A recurring subscription that will still bill.
--
-- ABC has no server-side cancellation: Pro subscriptions are managed in Stripe's
-- own portal, and nothing here may claim to have cancelled one. Deleting the
-- account underneath a live subscription would leave somebody paying for an
-- account that no longer exists, so the owner is asked to cancel first.
--
-- Blocks:
--   - a Pro subscription in any state that can still charge: active or trialing
--     that is not set to end, past_due, unpaid, incomplete, paused
--   - a legacy plan subscription, which the webhook clears from the profile when
--     Stripe reports it deleted
-- Does not block:
--   - canceled or expired subscriptions
--   - active or trialing subscriptions already set to cancel at period end —
--     they will not charge again
--   - an Event Pass, Smart Scan credits: one-time purchases, nothing recurs
--
-- Read from ABC's own copy of Stripe's state. A webhook that has not arrived yet
-- is a subscription that still blocks, which is the safe direction to be wrong.
create or replace function public.account_deletion_blocker(p_user_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when exists (
      select 1
      from public.billing_entitlements e
      where e.user_id = p_user_id
        and e.stripe_subscription_id is not null
        and e.status not in ('canceled', 'expired')
        and not (e.status in ('active', 'trialing') and e.cancel_at_period_end)
    )
    or exists (
      select 1
      from public.abc_profiles p
      where p.id = p_user_id
        and nullif(btrim(coalesce(p.stripe_subscription_id, '')), '') is not null
    )
    then 'active_subscription'
    else null
  end
$$;

-- ---------------------------------------------------------------
-- 3. Removing the account's data
-- ---------------------------------------------------------------
-- Returns:
--   active_subscription  nothing was written or deleted
--   removed              the record is written and every owner row below is gone
--
-- One transaction. Either the public card, the credentials and the private data
-- are all gone together, or none of it is — there is no moment at which the
-- card is still live but the contacts behind it have been deleted, or the other
-- way round. Retrying after a later step failed runs it again safely: there is
-- nothing left to delete, and the record is refreshed rather than duplicated.
--
-- Owner-scoped in every statement. The service role bypasses RLS, so the
-- `where user_id = p_user_id` is the only thing between this function and
-- another account; nothing here reads an id from anywhere but its argument.
--
-- What it deliberately does not delete:
--   scan_credit_ledger, billing_entitlements
--     The service role holds no DELETE on either, by design: an economic row is
--     removed only by the account's own foreign-key cascade. That cascade runs
--     when the auth user is deleted, after the summary above has been taken.
--   stripe_webhook_events
--     Keyed by Stripe's event id, with no owner and no payload. It is how a
--     duplicate delivery is recognised, and holds nothing about the person.
--   public_rate_limits
--     Salted hashes that expire with their window; no owner id is stored.
--   other owners' contacts
--     scanned_contacts.linked_abc_user_id may name this account on somebody
--     else's contact. That contact is theirs — the meeting happened — and
--     20260820120000_scan_provenance_abc_identity declined a foreign key for
--     exactly this reason. It is not touched.
--
-- Order matters in one place: batch items go before contacts, so the release
-- trigger from 20260911120000_contact_delete_batch_history has nothing to
-- rewrite in rows that are about to be deleted anyway.
--
-- The advisory lock is the one the ledger functions take, so a purchase being
-- granted or a card being paid for at this moment waits, and the summary sees
-- it. A second deletion request for the same account waits too.
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
-- 4. Row-level security and privileges
-- ---------------------------------------------------------------
-- Server only. REVOKE first, because this project's default privileges hand new
-- tables and functions to anon and authenticated.
alter table public.account_deletions enable row level security;

revoke all on table public.account_deletions from public;
revoke all on table public.account_deletions from anon, authenticated;
revoke all on table public.account_deletions from service_role;

-- The server writes progress and reads it back. No DELETE: whether and when this
-- record is removed is the retention decision above, not something a route does.
grant select, insert, update on table public.account_deletions to service_role;

-- CREATE FUNCTION grants EXECUTE to PUBLIC, and PostgREST publishes whatever a
-- role can execute. Without these lines a signed-in browser could call
-- remove_account_data with any id it liked.
revoke all on function public.account_deletion_blocker(uuid) from public;
revoke all on function public.account_deletion_blocker(uuid) from anon, authenticated;
revoke all on function public.remove_account_data(uuid) from public;
revoke all on function public.remove_account_data(uuid) from anon, authenticated;

grant execute on function public.account_deletion_blocker(uuid) to service_role;
grant execute on function public.remove_account_data(uuid) to service_role;

-- remove_account_data is SECURITY INVOKER, like every other service-role
-- function here, so the service role must hold DELETE on what it removes. Most
-- of these it already holds, explicitly or through default privileges; stating
-- it keeps the function from depending on which. Nothing is granted to anon or
-- authenticated, and nothing on the ledger, the entitlements or the webhook
-- events, whose rows the server must never delete directly.
grant delete on table
  public.abc_profiles,
  public.scanned_contacts,
  public.contact_encounters,
  public.followup_sequences,
  public.crm_activities,
  public.crm_opportunities,
  public.crm_connections,
  public.crm_object_mappings,
  public.scan_batches,
  public.scan_batch_items,
  public.card_links,
  public.card_events,
  public.card_views,
  public.card_showcase_items
to service_role;

notify pgrst, 'reload schema';
