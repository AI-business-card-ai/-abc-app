/**
 * Local rehearsal of the unapplied Supabase migrations for the ABC release.
 *
 * Run with `node scripts/rehearse-migrations.mjs` from the repository root.
 *
 * PGlite (PostgreSQL in WASM), in memory. It never connects to Supabase or any
 * other database, reads no environment, and writes nothing outside memory.
 *
 * 1. Builds the pre-release state: a stand-in for the Supabase platform schemas
 *    the migrations reference (roles, auth.users, auth.uid(), storage buckets
 *    and objects, storage.foldername, the realtime publication, default
 *    privileges), supabase/schema.sql, and every historical migration. A file
 *    that fails in order is retried at the end, which is how production received
 *    the ones applied by hand out of order.
 * 2. Seeds representative synthetic data: owners, contacts, encounters, a saved
 *    Multi-Card batch, CRM connections and mappings, card data, a legacy
 *    subscriber, and card-media and avatars objects.
 * 3. Applies the five release migrations in order, each in its own transaction,
 *    and compares every pre-existing row, column, function, trigger, grant and
 *    policy before and after.
 * 4. Runs every new function on the upgraded schema.
 * 5. Rehearses the failure modes: a dangling encounter reference, and two
 *    out-of-order applications.
 *
 * What it cannot prove: that production matches the repository schema. Supabase
 * is emulated, not run. See docs/launch/migration-rehearsal.md.
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const { PGlite } = await import('@electric-sql/pglite')
const { unaccent } = await import('@electric-sql/pglite/contrib/unaccent')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const STANDIN = `
-- Supabase platform stand-in: only what the migrations reference. Local PGlite only.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  updated_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- Supabase ships this publication.
create publication supabase_realtime;
`

const NEW = [
  '20260911120000_contact_delete_batch_history.sql',
  '20260912120000_smart_scan_credit_ledger.sql',
  '20260916120000_account_deletion.sql',
  '20260917120000_native_connector_attempts.sql',
  '20260918120000_card_media_no_public_listing.sql',
]
const HISTORICAL = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).sort().filter((f) => f.endsWith('.sql') && !NEW.includes(f))

let passed = 0
const failures = []
const notes = []
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) passed++
  else failures.push(`${label}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`)
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
}
const note = (s) => {
  notes.push(s)
  console.log(`NOTE ${s}`)
}

async function applyFile(db, file) {
  await db.exec('begin')
  try {
    await db.exec(read(`supabase/migrations/${file}`))
    await db.exec('commit')
    return { ok: true }
  } catch (e) {
    await db.exec('rollback')
    return { ok: false, code: e.code, message: String(e.message).slice(0, 200) }
  }
}

/** The production-like state before the five: every historical migration, with out-of-order hand-applied files retried. */
async function preState() {
  const db = new PGlite({ extensions: { unaccent } })
  await db.exec(STANDIN)
  await db.exec(read('supabase/schema.sql').replace(/create extension[^;]+;/i, ''))
  await db.exec('alter table public.abc_profiles add column if not exists card_bio text')
  let deferred = []
  for (const f of HISTORICAL) {
    const r = await applyFile(db, f)
    if (!r.ok) deferred.push([f, r.message])
  }
  const retried = []
  for (const [f] of deferred) {
    const r = await applyFile(db, f)
    retried.push([f, r.ok ? 'applied on retry' : `still failing: ${r.message}`])
  }
  return { db, deferred, retried }
}

// ─────────────── seed ───────────────
const U = {
  active: 'a1111111-1111-4111-8111-111111111111',
  other: 'b2222222-2222-4222-8222-222222222222',
  empty: 'c3333333-3333-4333-8333-333333333333',
  legacy: 'd4444444-4444-4444-8444-444444444444',
}
const ids = {}
async function seed(db) {
  for (const [k, id] of Object.entries(U)) await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${k}@example.test`])
  await db.query(`update public.abc_profiles set full_name = 'Active Owner', plan = 'free', google_connected = true, google_email = 'owner@example.test', google_refresh_token = 'rt-local', card_slug = 'active-owner', card_published = true where id = $1`, [U.active])
  await db.query(`update public.abc_profiles set plan = 'starter', stripe_customer_id = 'cus_local', stripe_subscription_id = 'sub_local_legacy' where id = $1`, [U.legacy])
  const contact = async (user, name) => (await db.query(`insert into public.scanned_contacts (user_id, name, email, company) values ($1, $2, $3, 'Acme') returning id`, [user, name, `${name.toLowerCase().replace(/\s/g, '.')}@acme.test`])).rows[0].id
  const encounter = async (user, c, ev) => (await db.query(`insert into public.contact_encounters (contact_id, user_id, event) values ($1, $2, $3) returning id`, [c, user, ev])).rows[0].id
  ids.c1 = await contact(U.active, 'Batch Created')
  ids.c2 = await contact(U.active, 'Single Scan')
  ids.c3 = await contact(U.active, 'Met Twice')
  ids.e1 = await encounter(U.active, ids.c1, 'Berlin Fair')
  ids.e2 = await encounter(U.active, ids.c3, 'Earlier Fair')
  ids.e3 = await encounter(U.active, ids.c3, 'Berlin Fair')
  ids.b1 = (await db.query(`insert into public.scan_batches (user_id, status, source_kind) values ($1, 'saved', 'single_photo') returning id`, [U.active])).rows[0].id
  const item = async (pos, cols) => {
    const keys = Object.keys(cols)
    return (await db.query(`insert into public.scan_batch_items (batch_id, user_id, position${keys.map((k) => ', ' + k).join('')}) values ($1, $2, $3${keys.map((_, i) => ', $' + (i + 4)).join('')}) returning id`, [ids.b1, U.active, pos, ...keys.map((k) => cols[k])])).rows[0].id
  }
  ids.i1 = await item(0, { created_contact_id: ids.c1, created_encounter_id: ids.e1, credit_consumed: true })
  ids.i2 = await item(1, { link_contact_id: ids.c3, created_contact_id: ids.c3, created_encounter_id: ids.e3, credit_consumed: true })
  ids.i3 = await item(2, { selected: true })
  await db.query(`insert into public.crm_connections (user_id, provider, access_token_encrypted) values ($1, 'hubspot', 'enc-local-hubspot')`, [U.active])
  await db.query(`insert into public.crm_object_mappings (user_id, provider, local_object_type, local_object_id, remote_object_type, remote_object_id) values ($1, 'hubspot', 'contact', $2, 'contact', 'hs-1')`, [U.active, ids.c1])
  await db.query(`insert into public.crm_activities (user_id, contact_id, activity_type) values ($1, $2, 'note')`, [U.active, ids.c2])
  await db.query(`insert into public.followup_sequences (user_id, contact_id, step, message_type, scheduled_at) values ($1, $2, 1, 'email', now())`, [U.active, ids.c2])
  await db.query(`insert into public.card_links (user_id, label, url) values ($1, 'Site', 'https://example.test')`, [U.active])
  await db.query(`insert into public.card_events (user_id) values ($1)`, [U.active])
  await db.query(`insert into public.card_views (user_id) values ($1)`, [U.active])
  await db.query(`insert into public.card_showcase_items (user_id, image_url) values ($1, 'https://local.test/storage/v1/object/public/card-media/a/showcase/x.jpg')`, [U.active])
  ids.oc = await contact(U.other, 'Other Person')
  await db.query(`insert into public.contact_encounters (contact_id, user_id, event) values ($1, $2, 'Other Fair')`, [ids.oc, U.other])
  await db.query(`insert into public.crm_connections (user_id, provider, access_token_encrypted) values ($1, 'pipedrive', 'enc-local-pipedrive')`, [U.other])
  await db.query(`insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing`)
  for (const [bucket, name] of [
    ['card-media', `${U.active}/photo-1.jpg`],
    ['card-media', `${U.active}/showcase/one.jpg`],
    ['card-media', `${U.other}/photo-1.jpg`],
    ['avatars', `${U.active}/avatar.png`],
  ]) await db.query('insert into storage.objects (bucket_id, name) values ($1, $2)', [bucket, name])
}

// ─────────────── introspection ───────────────
async function tablesAndColumns(db) {
  const r = await db.query(`select table_schema || '.' || table_name as t from information_schema.tables where table_schema in ('public','auth','storage') and table_type = 'BASE TABLE' order by 1`)
  const out = {}
  for (const { t } of r.rows) {
    const [s, n] = t.split('.')
    out[t] = (await db.query(`select column_name from information_schema.columns where table_schema = $1 and table_name = $2 order by ordinal_position`, [s, n])).rows.map((c) => c.column_name)
  }
  return out
}
async function dataSnapshot(db, shape) {
  const out = {}
  for (const [t, cols] of Object.entries(shape)) {
    const [s, n] = t.split('.')
    const row = cols.map((c) => `"${c}"`).join(', ')
    const r = await db.query(`select count(*)::int as n, md5(coalesce(string_agg(x, E'\\n' order by x), '')) as h from (select (row(${row}))::text as x from "${s}"."${n}") q`)
    out[t] = `${r.rows[0].n}:${r.rows[0].h}`
  }
  return out
}
const grantsOf = async (db) => (await db.query(`select grantee || ' ' || privilege_type || ' ' || table_schema || '.' || table_name as g from information_schema.role_table_grants where grantee in ('anon','authenticated','service_role') and table_schema in ('public','storage') order by 1`)).rows.map((r) => r.g)
const policiesOf = async (db) => (await db.query(`select schemaname || '.' || tablename || ' ' || policyname || ' ' || cmd || ' ' || roles::text || ' ' || coalesce(qual,'') || ' ' || coalesce(with_check,'') as p from pg_policies order by 1`)).rows.map((r) => r.p)
const functionsOf = async (db) => Object.fromEntries((await db.query(`select p.oid::regprocedure::text as f, md5(p.prosrc) as h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`)).rows.map((r) => [r.f, r.h]))
const triggersOf = async (db) => (await db.query(`select tgrelid::regclass::text || '.' || tgname as t from pg_trigger where not tgisinternal order by 1`)).rows.map((r) => r.t)
const diff = (a, b) => ({ removed: a.filter((x) => !b.includes(x)), added: b.filter((x) => !a.includes(x)) })

async function as(db, role, sub, fn) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`)
    if (sub) await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub])
    try {
      return await fn(tx)
    } catch (e) {
      return { error: e.code || 'error', message: String(e.message).slice(0, 160) }
    } finally {
      await tx.rollback()
    }
  })
}

// ═══════════════ 1. the in-order upgrade ═══════════════
console.log('\n== building pre-migration state')
const t0 = Date.now()
const { db, deferred, retried } = await preState()
note(`historical migrations: ${HISTORICAL.length}; applied in file order except ${deferred.map((d) => d[0]).join(', ') || 'none'}`)
for (const [f, r] of retried) note(`${f}: ${r}`)
check('P0 every historical migration is present in the pre-state (out-of-order hand-applied ones on retry)', retried.filter(([, r]) => r !== 'applied on retry'), [])

await seed(db)

const bugBefore = await as(db, 'service_role', null, (tx) => tx.query('delete from public.scanned_contacts where id = $1', [ids.c1]).then(() => 'deleted'))
check('P1 pre-state reproduces the contact-delete defect the first migration fixes (23502 on a batch-created contact)', bugBefore.error, '23502')
const anonListBefore = await as(db, 'anon', null, (tx) => tx.query(`select count(*)::int as n from storage.objects where bucket_id = 'card-media'`).then((r) => r.rows[0].n))
check('P2 pre-state lets anon list every card-media object', anonListBefore, 3)

const shape = await tablesAndColumns(db)
const before = {
  data: await dataSnapshot(db, shape),
  grants: await grantsOf(db),
  policies: await policiesOf(db),
  functions: await functionsOf(db),
  triggers: await triggersOf(db),
}

console.log('\n== applying the five migrations in order')
const applied = []
for (const f of NEW) {
  const s = Date.now()
  const r = await applyFile(db, f)
  applied.push([f, r.ok ? 'ok' : `FAILED ${r.code} ${r.message}`, `${Date.now() - s}ms`])
  console.log('  ', f, r.ok ? 'ok' : r.message, `${Date.now() - s}ms`)
}
check('M1 the five migrations apply in order, each in its own transaction', applied.map((a) => a[1]), NEW.map(() => 'ok'))

const after = {
  data: await dataSnapshot(db, shape),
  grants: await grantsOf(db),
  policies: await policiesOf(db),
  functions: await functionsOf(db),
  triggers: await triggersOf(db),
}
check(
  'M2 no pre-existing row in any public, auth or storage table was deleted or changed (pre-existing columns compared)',
  Object.keys(before.data).filter((t) => before.data[t] !== after.data[t]),
  []
)
const newTables = Object.keys(await tablesAndColumns(db)).filter((t) => !shape[t])
check('M3 new tables', newTables.sort(), ['public.account_deletions', 'public.billing_entitlements', 'public.native_connector_attempts', 'public.scan_credit_ledger', 'public.stripe_webhook_events'])
const addedColumns = []
for (const [t, cols] of Object.entries(await tablesAndColumns(db))) if (shape[t]) for (const c of cols) if (!shape[t].includes(c)) addedColumns.push(`${t}.${c}`)
check('M4 the only column added to an existing table', addedColumns, ['public.scan_batch_items.contact_deleted_at'])
const fnDiff = diff(Object.keys(before.functions), Object.keys(after.functions))
const changedExisting = Object.keys(before.functions).filter((f) => after.functions[f] && after.functions[f] !== before.functions[f])
check('M5 no pre-existing function was removed or rewritten', [fnDiff.removed, changedExisting], [[], []])
note(`functions added: ${fnDiff.added.join('; ')}`)
check('M6 triggers added', diff(before.triggers, after.triggers), { removed: [], added: ['scan_credit_ledger.scan_credit_ledger_no_update', 'scan_credit_ledger.scan_credit_ledger_non_negative', 'scanned_contacts.scan_batch_items_release_deleted_contact'] })
const grantDiff = diff(before.grants, after.grants)
check('M7 privileges on pre-existing tables: nothing revoked', grantDiff.removed, [])
note(`privileges added: ${grantDiff.added.filter((g) => !/account_deletions|billing_entitlements|native_connector_attempts|scan_credit_ledger|stripe_webhook_events/.test(g)).join('; ') || 'none on pre-existing tables'}`)
const policyDiff = diff(before.policies, after.policies)
check(
  'M8 policy changes: card-media anon read replaced by owner policies; own-row read on ledger and entitlements',
  [policyDiff.removed.map((p) => p.split(' ').slice(0, 3).join(' ')), policyDiff.added.map((p) => p.split(' ').slice(0, 3).join(' ')).sort()],
  [
    ['storage.objects card_media_owner_update UPDATE', 'storage.objects card_media_public_read SELECT'],
    ['public.billing_entitlements billing_entitlements_select_own SELECT', 'public.scan_credit_ledger scan_credit_ledger_select_own SELECT', 'storage.objects card_media_owner_select SELECT', 'storage.objects card_media_owner_update UPDATE'].sort(),
  ]
)
const rls = (await db.query(`select relname, relrowsecurity from pg_class where relname = any($1) order by relname`, [['account_deletions', 'billing_entitlements', 'native_connector_attempts', 'scan_credit_ledger', 'stripe_webhook_events']])).rows.map((r) => [r.relname, r.relrowsecurity])
check('M9 RLS is enabled on every new table', rls.every(([, on]) => on), true)
const newTablePriv = (await db.query(`select c.relname, has_table_privilege('anon', c.oid, 'select') as anon_s, has_table_privilege('authenticated', c.oid, 'select') as auth_s, has_table_privilege('authenticated', c.oid, 'insert') as auth_i from pg_class c where c.relname = any($1) order by relname`, [['account_deletions', 'billing_entitlements', 'native_connector_attempts', 'scan_credit_ledger', 'stripe_webhook_events']])).rows.map((r) => [r.relname, r.anon_s, r.auth_s, r.auth_i])
check('M10 anon reads no new table; signed-in users may only read ledger and entitlements (own rows by RLS), never write', newTablePriv, [
  ['account_deletions', false, false, false],
  ['billing_entitlements', false, true, false],
  ['native_connector_attempts', false, false, false],
  ['scan_credit_ledger', false, true, false],
  ['stripe_webhook_events', false, false, false],
])
const fnPriv = (await db.query(`select p.oid::regprocedure::text as f, has_function_privilege('anon', p.oid, 'execute') as a, has_function_privilege('authenticated', p.oid, 'execute') as u, has_function_privilege('service_role', p.oid, 'execute') as s, coalesce(array_to_string(p.proconfig, ','), '') as cfg, p.prosecdef as definer from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.oid::regprocedure::text = any($1) order by 1`, [fnDiff.added])).rows
const triggerFns = (await db.query(`select p.oid::regprocedure::text as f from pg_proc p where p.prorettype = 'trigger'::regtype and p.oid::regprocedure::text = any($1)`, [fnDiff.added])).rows.map((r) => r.f)
check('M11a no new callable function is executable by anon or authenticated', fnPriv.filter((r) => (r.a || r.u) && !triggerFns.includes(r.f)).map((r) => r.f), [])
check('M11b every new function pins search_path to empty', fnPriv.filter((r) => !/search_path=""|search_path=''/.test(r.cfg)).map((r) => r.f), [])
const directTrigger = await as(db, 'anon', null, (tx) => tx.query('select public.scan_credit_ledger_immutable()').then(() => 'ran'))
check('M11c trigger functions keep default EXECUTE but cannot be called directly (0A000)', [fnPriv.filter((r) => (r.a || r.u) && triggerFns.includes(r.f)).map((r) => r.f), directTrigger.error], [['scan_credit_ledger_immutable()', 'scan_credit_ledger_non_negative()'], '0A000'])
check('M12 service_role can execute every callable new function', fnPriv.filter((r) => !r.s && !/immutable|non_negative|release_deleted/.test(r.f)).map((r) => r.f), [])

// ─────────────── functions run on the upgraded schema ───────────────
const svc = (fn) => as(db, 'service_role', null, fn)
const one = async (tx, sql, params = []) => (await tx.query(sql, params)).rows[0]

check('F1 no balance is created or debited by the migrations: every existing owner starts at 0', await svc(async (tx) => Promise.all(Object.values(U).map(async (u) => (await one(tx, 'select public.scan_credit_balance($1) as b', [u])).b))), [0, 0, 0, 0])
check(
  'F2 consuming with no credit is refused and never goes negative; a grant is spent once; retries never double-charge',
  await svc(async (tx) => {
    const r = []
    r.push(await one(tx, `select * from public.consume_scan_credit($1, 'single_scan', 'r0', 'k0')`, [U.active]))
    r.push(await one(tx, `select * from public.grant_scan_credits($1, 1, 'grant', 'manual', 'rehearsal', null, 'g1')`, [U.active]))
    r.push(await one(tx, `select * from public.consume_scan_credit($1, 'single_scan', 'r1', 'k1')`, [U.active]))
    r.push(await one(tx, `select * from public.consume_scan_credit($1, 'single_scan', 'r2', 'k2')`, [U.active]))
    r.push(await one(tx, `select * from public.consume_scan_credit($1, 'single_scan', 'r1', 'k1')`, [U.active]))
    return r.map((x) => Object.values(x))
  }),
  [['insufficient', 0], [true, 1], ['consumed', 0], ['insufficient', 0], ['already_consumed', 0]]
)
check(
  'F3 a raw negative ledger row is rejected by the non-negative constraint trigger',
  (await svc(async (tx) => {
    await tx.exec('set constraints all immediate')
    await tx.query(`insert into public.scan_credit_ledger (user_id, delta, kind, source, source_ref, idempotency_key) values ($1, -1, 'consume', 'single_scan', 'raw', 'raw-1')`, [U.other])
    return 'inserted'
  })).error !== undefined,
  true
)
check(
  'F4 ledger rows are immutable',
  await svc(async (tx) => {
    await tx.query(`select * from public.grant_scan_credits($1, 2, 'grant', 'manual', 'rehearsal', null, 'g-imm')`, [U.other])
    const u = await tx.query(`update public.scan_credit_ledger set delta = 99 where idempotency_key = 'g-imm'`).then(() => 'updated', (e) => e.code || 'error')
    return u === 'updated' ? 'updated' : 'refused'
  }),
  'refused'
)
check(
  'F5 stripe webhook claims are idempotent',
  await svc(async (tx) => [
    (await one(tx, `select public.claim_stripe_webhook_event('evt_local_1', 'checkout.session.completed', false, now()) as r`)).r,
    (await one(tx, `update public.stripe_webhook_events set status = 'processed' where event_id = 'evt_local_1' returning status`)).status,
    (await one(tx, `select public.claim_stripe_webhook_event('evt_local_1', 'checkout.session.completed', false, now()) as r`)).r,
  ]),
  ['new', 'processed', 'duplicate']
)
check(
  'F6 existing users stay valid before deletion: no blocker unless a subscription still bills (legacy profile subscription included)',
  await svc(async (tx) => Promise.all([U.active, U.other, U.empty, U.legacy].map(async (u) => (await one(tx, 'select public.account_deletion_blocker($1) as b', [u])).b))),
  [null, null, null, 'active_subscription']
)
check(
  'F7 an entitlement write compiles and a renewing Pro subscription blocks deletion',
  await svc(async (tx) => [
    typeof (await one(tx, `select public.apply_billing_entitlement($1, 'pro_monthly', 'active', 'sub_local_pro', null, now(), now() + interval '30 days', false, now()) as r`, [U.active])).r,
    (await one(tx, 'select public.account_deletion_blocker($1) as b', [U.active])).b,
  ]),
  ['string', 'active_subscription']
)
check(
  'F8 saving an unsaved Multi-Card item works on the upgraded schema, and a charged save with no credit writes nothing',
  await svc(async (tx) => {
    const broke = await one(tx, `select outcome, charged from public.accept_scan_batch_item($1, $2, true, '{"name":"New Person"}'::jsonb, '{"event":"Berlin Fair"}'::jsonb)`, [U.active, ids.i3])
    const untouched = await one(tx, 'select created_contact_id from public.scan_batch_items where id = $1', [ids.i3])
    const free = await one(tx, `select outcome, charged from public.accept_scan_batch_item($1, $2, false, '{"name":"New Person"}'::jsonb, '{"event":"Berlin Fair"}'::jsonb)`, [U.active, ids.i3])
    const saved = await one(tx, 'select created_contact_id is not null as saved from public.scan_batch_items where id = $1', [ids.i3])
    return [broke.outcome, untouched.created_contact_id, free.outcome, saved.saved]
  }),
  ['insufficient', null, 'saved', true]
)
check(
  'F9 contact delete now succeeds and keeps the batch history',
  await svc(async (tx) => {
    await tx.query('delete from public.scanned_contacts where id = $1', [ids.c1])
    const i = await one(tx, 'select created_contact_id, created_encounter_id, contact_deleted_at is not null as marked from public.scan_batch_items where id = $1', [ids.i1])
    const b = await one(tx, 'select count(*)::int as n from public.scan_batches where id = $1', [ids.b1])
    return [i.created_contact_id, i.created_encounter_id, i.marked, b.n]
  }),
  [null, null, true, 1]
)
const ownedCounts = async (tx, u) => {
  const r = {}
  for (const t of ['abc_profiles', 'scanned_contacts', 'contact_encounters', 'scan_batches', 'scan_batch_items', 'crm_connections', 'crm_object_mappings', 'crm_activities', 'followup_sequences', 'card_links', 'card_events', 'card_views', 'card_showcase_items']) {
    const col = t === 'abc_profiles' ? 'id' : 'user_id'
    r[t] = (await one(tx, `select count(*)::int as n from public.${t} where ${col} = $1`, [u])).n
  }
  return r
}
check(
  'F10 account data removal compiles, removes only that owner, and records a deletion row',
  await svc(async (tx) => {
    const otherBefore = await ownedCounts(tx, U.other)
    const result = (await one(tx, 'select public.remove_account_data($1) as r', [U.active])).r
    const mine = await ownedCounts(tx, U.active)
    const otherAfter = await ownedCounts(tx, U.other)
    const rec = (await one(tx, 'select count(*)::int as n from public.account_deletions')).n
    return [typeof result, Object.values(mine).every((n) => n === 0), JSON.stringify(otherBefore) === JSON.stringify(otherAfter), rec]
  }),
  ['string', true, true, 1]
)
const removeDef = (await db.query(`select prosrc from pg_proc where proname = 'remove_account_data'`)).rows
check('F11 exactly one remove_account_data exists, and it is the 20260917 version that clears native attempts', [removeDef.length, /native_connector_attempts/.test(removeDef[0]?.prosrc ?? '')], [1, true])
check(
  'F12 native connector attempt lifecycle compiles and runs; existing web connections are untouched and still upsertable',
  await svc(async (tx) => {
    const id = (await one(tx, `select public.create_native_connector_attempt($1, 'hubspot', 'state-h', 'nonce-h', 'pkce-enc', null, 600) as id`, [U.active])).id
    const begun = await one(tx, `select * from public.begin_native_connector_callback('state-h', 'hubspot')`)
    const done = (await one(tx, `select public.complete_native_connector_callback($1, 'result-enc', 'handoff-h') as ok`, [id])).ok
    const claim = await one(tx, `select * from public.claim_native_connector_attempt($1, $2, 'nonce-h', 'handoff-h')`, [id, U.active])
    const web = await one(tx, `insert into public.crm_connections (user_id, provider, access_token_encrypted) values ($1, 'hubspot', 'enc-refreshed') on conflict (user_id, provider) do update set access_token_encrypted = excluded.access_token_encrypted returning provider`, [U.active])
    return [begun.attempt_id === id, done, claim.provider, claim.result_encrypted, web.provider]
  }),
  [true, true, 'hubspot', 'result-enc', 'hubspot']
)
const anonAfter = await as(db, 'anon', null, (tx) => tx.query(`select count(*)::int as n from storage.objects`).then((r) => r.rows[0].n))
const ownerAfter = await as(db, 'authenticated', U.active, (tx) => tx.query(`select name from storage.objects where bucket_id = 'card-media' order by name`).then((r) => r.rows.map((x) => x.name)))
const bucketAfter = (await db.query(`select id, public from storage.buckets order by id`)).rows.map((r) => [r.id, r.public])
check(
  'F13 card media: anon listing gone, owners list their own folder, objects intact, buckets stay public (Supabase serves public object URLs without RLS: confirm on staging), avatars untouched',
  [anonAfter, ownerAfter, bucketAfter, before.data['storage.objects'] === after.data['storage.objects']],
  [0, [`${U.active}/photo-1.jpg`, `${U.active}/showcase/one.jpg`], [['avatars', true], ['card-media', true]], true]
)

console.log('\n== re-applying each migration once more (accidental re-run)')
for (const f of NEW) {
  const r = await applyFile(db, f)
  note(`re-run ${f}: ${r.ok ? 're-runnable' : `fails (${r.code}) ${r.message}`}`)
}

// ═══════════════ 2. failure modes ═══════════════
console.log('\n== dangling encounter reference')
{
  const { db: d } = await preState()
  await seed(d)
  await d.query('delete from public.contact_encounters where id = $1', [ids.e1])
  const dangling = (await d.query(`select count(*)::int as n from public.scan_batch_items i where i.created_encounter_id is not null and not exists (select 1 from public.contact_encounters e where e.id = i.created_encounter_id)`)).rows[0].n
  const r = await applyFile(d, NEW[0])
  const col = (await d.query(`select count(*)::int as n from information_schema.columns where table_name = 'scan_batch_items' and column_name = 'contact_deleted_at'`)).rows[0].n
  await d.query(`update public.scan_batch_items i set created_encounter_id = null where i.created_encounter_id is not null and not exists (select 1 from public.contact_encounters e where e.id = i.created_encounter_id)`)
  const r2 = await applyFile(d, NEW[0])
  check('X1 a dangling created_encounter_id makes 20260911 fail atomically (23503, nothing half-applied); the pre-flight cleanup lets it apply', [dangling, r.ok, r.code, col, r2.ok], [1, false, '23503', 0, true])
  await d.close()
}

console.log('\n== out-of-order application')
{
  const { db: d } = await preState()
  await seed(d)
  const order = [NEW[0], NEW[1], NEW[3], NEW[2], NEW[4]]
  const results = []
  for (const f of order) results.push((await applyFile(d, f)).ok)
  const src = (await d.query(`select prosrc from pg_proc where proname = 'remove_account_data'`)).rows[0]?.prosrc ?? ''
  check('X2 applying 20260917 before 20260916 does NOT error, but silently leaves the older remove_account_data (no native attempt cleanup)', [results, /native_connector_attempts/.test(src)], [[true, true, true, true, true], false])
  await d.close()
}
{
  const { db: d } = await preState()
  await seed(d)
  const r12 = await applyFile(d, NEW[1])
  const run = await as(d, 'service_role', null, (tx) => tx.query(`select outcome from public.accept_scan_batch_item($1, $2, false, '{"name":"X"}'::jsonb, '{"event":"Y"}'::jsonb)`, [U.active, ids.i3]).then((r) => r.rows[0].outcome))
  check('X3 applying 20260912 before 20260911 also does not error, but Multi-Card save then fails at run time', [r12.ok, typeof run === 'object' && run.error !== undefined], [true, true])
  note(`X3 run-time error: ${JSON.stringify(run)}`)
  await d.close()
}

console.log(`\nRehearsal finished in ${Math.round((Date.now() - t0) / 1000)}s: ${passed}/${passed + failures.length} PASS`)
for (const a of applied) console.log('APPLIED', a.join(' | '))
if (failures.length) {
  for (const f of failures) console.log('  FAIL ' + f)
  process.exit(1)
}
