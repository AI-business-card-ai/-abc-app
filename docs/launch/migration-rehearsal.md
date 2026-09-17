# Migration rehearsal — the five unapplied release migrations

**Status:** rehearsed locally on 2026-09-17 against the combined release candidate
`landing-cinematic-system` @ `bd7199281aa3936352c53e0b6d4cc98b9fd3b3ed`. **Nothing was
applied to any remote database.** Production and staging application are owner steps.

Reproduce with:

```bash
node scripts/rehearse-migrations.mjs
```

## Result: PASS (33/33 checks)

| Order | File | In-order apply | Re-run safe |
| --- | --- | --- | --- |
| 1 | `20260911120000_contact_delete_batch_history.sql` | ok | yes |
| 2 | `20260912120000_smart_scan_credit_ledger.sql` | ok | yes |
| 3 | `20260916120000_account_deletion.sql` | ok | yes |
| 4 | `20260917120000_native_connector_attempts.sql` | ok | yes |
| 5 | `20260918120000_card_media_no_public_listing.sql` | ok | yes |

## Method

- **Engine:** PGlite 0.5.8 — real PostgreSQL compiled to WASM, in memory. No Docker,
  `psql`, Postgres server or Supabase CLI exists on the rehearsal machine, and none was
  installed. This is the same engine the repository's migration suites already use.
- **Supabase stand-in:** roles `anon`, `authenticated`, `service_role` (bypass RLS);
  `auth.users` and `auth.uid()`; `storage.buckets`, `storage.objects` with RLS and
  Supabase's `storage.foldername`; the `supabase_realtime` publication; the `unaccent`
  extension; Supabase's default privileges on `public`.
- **Pre-release state:** `supabase/schema.sql` and all 56 historical migrations.
  `20260628160000_salesforce_data_model.sql` reads a column added by the later
  `20260630130000_apollo_contact_fields.sql`, so it fails in file order; it applies when
  retried after the rest, matching its known hand-applied history.
- **Representative data (synthetic, local only):** four owners — an active owner with a
  connected Gmail, three contacts, three encounters, a saved Multi-Card batch (one created
  contact, one linked second meeting, one unsaved card), a HubSpot connection and mapping,
  a CRM activity, a follow-up sequence, card links/events/views/showcase; a second owner
  with a Pipedrive connection; an empty owner; a legacy Starter subscriber. Storage:
  three `card-media` objects in two owners' folders and one legacy `avatars` object.
- Each migration was applied in its own transaction. Before and after, the rehearsal
  hashed every pre-existing row (pre-existing columns only) in every `public`, `auth` and
  `storage` table, and compared functions, triggers, grants and policies.

## What was proven

| Area | Proof |
| --- | --- |
| Order and dependencies | All five apply in order with no error. |
| No data loss | Every pre-existing row in every `public`, `auth` and `storage` table is unchanged. |
| Schema changes are additive | New tables: `scan_credit_ledger`, `stripe_webhook_events`, `billing_entitlements`, `account_deletions`, `native_connector_attempts`. The only new column on an existing table: `scan_batch_items.contact_deleted_at`. No pre-existing function removed or rewritten; no privilege on a pre-existing table revoked. |
| Policies | `card_media_public_read` removed; owner-folder `card_media_owner_select` added; `card_media_owner_update` gains `WITH CHECK`; own-row read policies on the ledger and entitlements. |
| RLS and grants | RLS on every new table. `anon` reads none of them. `authenticated` may only read `scan_credit_ledger` and `billing_entitlements` (own rows), never write. No new callable function is executable by `anon`/`authenticated`; all 16 new functions pin `search_path = ''`. The two ledger trigger functions keep Supabase's default `EXECUTE` but PostgreSQL refuses to call them outside a trigger (0A000). |
| Contact delete history | Pre-release state reproduces the defect (deleting a batch-created contact fails with 23502). After: the delete succeeds; the batch item keeps its history, `contact_deleted_at` set, contact and encounter pointers cleared; the batch remains. |
| Smart Scan ledger | Migrations create no balance and debit nothing (all owners at 0). Consuming at zero returns `insufficient`; a grant of 1 is consumed once; a second consume is `insufficient`; a retry with the same key is `already_consumed`; a raw negative row is rejected by the constraint trigger; ledger rows cannot be updated. Stripe event claims: `new`, then `duplicate`. |
| Multi-Card save on the new schema | `accept_scan_batch_item` saves an unsaved card; a charged save with no credit returns `insufficient` and writes nothing. |
| Account deletion | Existing owners have no deletion blocker unless a subscription still bills — the legacy subscriber is blocked with `active_subscription` until cancelled; a renewing Pro entitlement blocks too. `remove_account_data` removes exactly one owner's rows and records one `account_deletions` row; the other owner is untouched. Exactly one `remove_account_data` exists and it is the `20260917` version. |
| Native connectors | Create → begin callback → complete → claim runs end to end. Existing web `crm_connections` rows are unchanged and the web upsert still works. |
| Card media | Before: `anon` lists all three objects. After: `anon` lists nothing; an owner lists only their own folder; all objects intact; both buckets still `public = true`; `avatars` untouched. |

## Failure modes found — the order and pre-flight are mandatory

1. **Out-of-order application does not error.** Applying `20260917` before `20260916`
   succeeds, but `20260916` then replaces `remove_account_data` with its older body, so
   account deletion stops clearing native connector attempts (the auth-user cascade still
   removes them later). Applying `20260912` before `20260911` also succeeds, but saving a
   Multi-Card batch then fails at run time (`42703`, `v_item has no field
   contact_deleted_at`). **Apply strictly in the order above and run the post-checks.**
2. **A dangling encounter reference blocks `20260911`.** If any
   `scan_batch_items.created_encounter_id` points to an encounter that no longer exists,
   adding the foreign key fails with `23503`. The transaction rolls back completely; after
   clearing those pointers the migration applies. Production code before this release
   cannot create such rows (a failed contact delete rolls back its encounter cascade), but
   rows edited by hand could. Run pre-flight query P4.

## What this cannot prove

- That production's schema equals the repository's. Several historical migrations were
  applied by hand; drift is possible. Pre-flight P1–P3 and P6 check the parts these five
  migrations depend on.
- Supabase platform behaviour: Storage serving `/object/public/…` without RLS, PostgREST
  schema reload, the real `auth` schema. Verify on staging.
- Performance on production row counts (local data is small). The new indexes are
  created without `CONCURRENTLY`; on large tables that briefly locks writes.

---

## Owner SQL — pre-flight (read-only)

Run in the Supabase SQL editor of **staging first**, then production. Nothing here writes.

**P1 — Which of the five are already present**

```sql
select
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'scan_batch_items'
            and column_name = 'contact_deleted_at')                         as m1_contact_deleted_at,
  to_regclass('public.scan_credit_ledger') is not null                       as m2_ledger,
  to_regclass('public.account_deletions') is not null                        as m3_account_deletions,
  to_regclass('public.native_connector_attempts') is not null                as m4_native_attempts,
  exists (select 1 from pg_policies
          where schemaname = 'storage' and tablename = 'objects'
            and policyname = 'card_media_owner_select')                      as m5_card_media_owner_select;
```

Expected before the release: all `false`.

**P2 — Migration history, if the Supabase CLI was ever used**

```sql
select version, name from supabase_migrations.schema_migrations order by version desc limit 20;
```

If this table is missing or does not list the historical migrations, **do not use
`supabase db push`** — it would try to apply everything it does not see. Apply the five
files individually instead.

**P3 — Prerequisites exist**

```sql
select
  to_regclass('public.scan_batches')        as scan_batches,
  to_regclass('public.scan_batch_items')    as scan_batch_items,
  to_regclass('public.contact_encounters')  as contact_encounters,
  to_regclass('public.crm_object_mappings') as crm_object_mappings,
  to_regclass('public.card_showcase_items') as card_showcase_items;

select id, public from storage.buckets where id in ('card-media', 'avatars');
```

Expected: every table non-null; `card-media` present and `public = true`.

**P4 — Dangling encounter references (blocks migration 1)**

```sql
select count(*) as dangling
from public.scan_batch_items i
where i.created_encounter_id is not null
  and not exists (select 1 from public.contact_encounters e where e.id = i.created_encounter_id);
```

Expected: `0`. If not, the owner decides whether to clear those pointers (they point at
meetings that no longer exist):

```sql
update public.scan_batch_items i
set created_encounter_id = null
where i.created_encounter_id is not null
  and not exists (select 1 from public.contact_encounters e where e.id = i.created_encounter_id);
```

**P5 — Name collisions**

```sql
select conname from pg_constraint where conname = 'scan_batch_items_created_encounter_fkey';

select p.oid::regprocedure
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('scan_credit_balance', 'grant_scan_credits', 'consume_scan_credit',
    'claim_stripe_webhook_event', 'apply_billing_entitlement', 'accept_scan_batch_item',
    'account_deletion_blocker', 'remove_account_data', 'create_native_connector_attempt',
    'begin_native_connector_callback', 'complete_native_connector_callback',
    'fail_native_connector_attempt', 'claim_native_connector_attempt',
    'scan_batch_items_release_deleted_contact');
```

Expected before the release: no rows.

**P6 — Legacy plan constraint (blocker B1a)**

```sql
select pg_get_constraintdef(oid) from pg_constraint where conname = 'abc_profiles_plan_check';
```

If `growth` is missing, a legacy Growth subscription cannot be recorded.

**P7 — Current storage policies (includes the `avatars` audit)**

```sql
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
```

Record the output before and after migration 5.

## Owner SQL — apply

1. Take a backup / confirm point-in-time recovery is available (Supabase dashboard).
2. For each file, in order, paste the whole file between `begin;` and `commit;` and run it:
   `20260911…` → `20260912…` → `20260916…` → `20260917…` → `20260918…`.
3. Run the matching post-check before starting the next file.

## Owner SQL — post-checks

```sql
-- after 1 (20260911)
select
  exists (select 1 from information_schema.columns
          where table_name = 'scan_batch_items' and column_name = 'contact_deleted_at') as column_ok,
  exists (select 1 from pg_constraint where conname = 'scan_batch_items_created_encounter_fkey') as fk_ok,
  exists (select 1 from pg_trigger where tgname = 'scan_batch_items_release_deleted_contact') as trigger_ok;

-- after 2 (20260912)
select to_regclass('public.scan_credit_ledger'), to_regclass('public.stripe_webhook_events'),
       to_regclass('public.billing_entitlements'),
       (select count(*) from public.scan_credit_ledger) as ledger_rows;   -- expect 0 rows

-- after 3 (20260916)
select to_regclass('public.account_deletions'),
       (select count(*) from pg_proc where proname = 'remove_account_data') as remove_fns;  -- expect 1

-- after 4 (20260917) — must be true, or migration 3 was re-run after 4
select prosrc like '%native_connector_attempts%' as removes_native_attempts
from pg_proc where proname = 'remove_account_data';

-- after 5 (20260918)
select policyname, cmd, roles from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'card_media_%'
order by policyname;
-- expect exactly: card_media_owner_delete DELETE {authenticated}, card_media_owner_insert INSERT {authenticated},
--                 card_media_owner_select SELECT {authenticated}, card_media_owner_update UPDATE {authenticated}
```

**After 5, in a browser:** open an existing profile photo URL
(`…/storage/v1/object/public/card-media/<owner id>/…`) — expect the image. Then confirm a
public card with a photo still renders at `/d/<slug>`.
