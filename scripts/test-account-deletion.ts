/**
 * Account deletion regression suite.
 *
 * Run with `npm run test:account-deletion` from the repository root.
 *
 * Deleting a whole ABC account, end to end, in PGlite over every migration in
 * the repository — with Supabase's default privileges emulated, so the revokes
 * in those migrations bind exactly as they do in production — and with Storage
 * and the Auth admin API replaced by fakes that record the order they are
 * called in. It never connects to Supabase, Stripe, Google or any CRM: network
 * access is replaced by a function that fails, and counted.
 */
import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

import {
  ACCOUNT_STORAGE_BUCKETS,
  deleteAccountForOwner,
  readAccountDeletionBlocker,
} from '@/lib/account/delete'
import {
  ACCOUNT_DELETION_ERROR_CODES,
  ACCOUNT_DELETION_PHRASE,
  accountDeletionMessage,
  isAccountDeletionConfirmed,
} from '@/lib/account/deletion-confirmation'
import { loadPublishedCardBySlug } from '@/lib/card/public-data'
import { ABC_WEB_ORIGINS } from '@/lib/native/config'
import { NATIVE_DOWNLOAD_PATHS, classifyNavigation } from '@/lib/native/navigation'

delete process.env.NEXT_PUBLIC_SUPABASE_URL
delete process.env.SUPABASE_SERVICE_ROLE_KEY

const ROOT = process.cwd()
let passed = 0
const failures: string[] = []

function check(label: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    passed++
    return
  }
  failures.push(`${label}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`)
}

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const flat = (text: string) => text.replace(/\s+/g, ' ').trim()

const MIGRATIONS_DIR = 'supabase/migrations'
const DELETION_MIGRATION = 'supabase/migrations/20260916120000_account_deletion.sql'
const LEDGER_MIGRATION = 'supabase/migrations/20260912120000_smart_scan_credit_ledger.sql'

/*
  Migrations that cannot run in PGlite, each for a reason that has nothing to do
  with account deletion: no Realtime publication, no unaccent extension, no
  storage.objects table, and two historical files that were applied to
  production by hand, out of order, before the columns they read existed. The
  set is pinned below, so a new migration that fails here is noticed rather than
  skipped.
*/
const ENVIRONMENT_ONLY = [
  '20260624160000_enrichment_status.sql',
  '20260628160000_salesforce_data_model.sql',
  '20260708160000_scan_status.sql',
  '20260722160000_profile_username.sql',
  '20260723160000_clean_legacy_usernames.sql',
  '20260810200000_enrichment_status_realtime.sql',
  '20260816120000_card_media_bucket_and_policies.sql',
  // storage.objects again; its policies are exercised against a storage stub by test:final-release-cleanup.
  '20260918120000_card_media_no_public_listing.sql',
]

const OWNER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const RETRY = '33333333-3333-4333-8333-333333333333'
const AUTHFAIL = '44444444-4444-4444-8444-444444444444'
const SUBSCRIBER = '55555555-5555-4555-8555-555555555555'
const FREE = '66666666-6666-4666-8666-666666666666'

/** Every table ABC keeps that is keyed to an owner. Pinned against the schema below. */
const OWNER_TABLES = [
  'billing_entitlements',
  'card_events',
  'card_links',
  'card_showcase_items',
  'card_views',
  'contact_encounters',
  'crm_activities',
  'crm_connections',
  'crm_object_mappings',
  'crm_opportunities',
  'followup_sequences',
  'native_connector_attempts',
  'scan_batch_items',
  'scan_batches',
  'scan_credit_ledger',
  'scanned_contacts',
]

// ─────────────────────────── DATABASE ───────────────────────────

async function freshDatabase(): Promise<{ db: PGlite; skipped: string[] }> {
  const db = new PGlite()
  await db.exec(`
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
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;

    -- Supabase's own default privileges: every new table and function in public
    -- is handed to all three API roles. The migrations revoke from there.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `)

  // schema.sql as written, minus the extension PGlite does not ship.
  await db.exec(read('supabase/schema.sql').replace(/create extension[^;]+;/i, ''))
  // A column production gained by hand, which the credential containment grant names.
  await db.exec('alter table public.abc_profiles add column if not exists card_bio text')

  const skipped: string[] = []
  for (const file of fs.readdirSync(path.join(ROOT, MIGRATIONS_DIR)).sort()) {
    try {
      await db.exec(read(`${MIGRATIONS_DIR}/${file}`))
    } catch {
      skipped.push(file)
    }
  }
  return { db, skipped }
}

type Role = 'service_role' | 'authenticated' | 'anon'

/** One statement under a role, in its own transaction so nothing else interleaves. */
async function asRole<T = Record<string, unknown>>(db: PGlite, role: Role | null, sql: string, params: unknown[] = [], sub?: string) {
  return db.transaction(async (tx) => {
    if (sub) await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [sub])
    if (role) await tx.exec(`set local role ${role}`)
    return tx.query<T>(sql, params)
  })
}

// ─────────────────────────── FAKES ───────────────────────────

type Harness = {
  events: string[]
  storage: FakeStorage
  authFailures: number
}

class FakeStorage {
  objects = new Map<string, Set<string>>()
  failListing = new Set<string>()
  failRemoval = new Set<string>()
  largestRemoval = 0

  constructor(private events: string[], buckets: readonly string[]) {
    for (const bucket of buckets) this.objects.set(bucket, new Set())
  }

  put(bucket: string, objectPath: string) {
    this.objects.get(bucket)?.add(objectPath)
  }

  paths(bucket: string, prefix = ''): string[] {
    return [...(this.objects.get(bucket) ?? [])].filter((p) => p.startsWith(prefix)).sort()
  }

  from(bucket: string) {
    return {
      list: async (prefix: string, options: { limit: number; offset: number }) => {
        this.events.push(`storage.list:${bucket}`)
        const store = this.objects.get(bucket)
        if (!store) return { data: null, error: { statusCode: '404', message: 'Bucket not found' } }
        if (this.failListing.has(bucket)) {
          return { data: null, error: { statusCode: '500', message: `storage backend failed reading /data/${bucket}/${prefix}` } }
        }
        const base = `${prefix.replace(/\/+$/, '')}/`
        const children = new Map<string, boolean>()
        for (const objectPath of store) {
          if (!objectPath.startsWith(base)) continue
          const [head, ...rest] = objectPath.slice(base.length).split('/')
          if (rest.length > 0) children.set(head, true)
          else if (!children.has(head)) children.set(head, false)
        }
        const entries = [...children.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, folder]) => ({ name, id: folder ? null : `object-${name}` }))
        return { data: entries.slice(options.offset, options.offset + options.limit), error: null }
      },
      remove: async (paths: string[]) => {
        this.events.push(`storage.remove:${bucket}`)
        if (this.failRemoval.has(bucket)) {
          return { data: null, error: { statusCode: '500', message: `could not unlink ${paths[0]}` } }
        }
        this.largestRemoval = Math.max(this.largestRemoval, paths.length)
        for (const objectPath of paths) this.objects.get(bucket)?.delete(objectPath)
        return { data: paths.map((name) => ({ name })), error: null }
      },
    }
  }
}

const SCALAR_FUNCTIONS = new Set(['remove_account_data', 'account_deletion_blocker', 'scan_credit_balance'])

/** Enough of the Supabase client for the deletion and public-card paths, over PGlite. */
function supabaseOver(db: PGlite, harness: Harness, role: Role | null): SupabaseClient {
  const isJson = (value: unknown) => value !== null && typeof value === 'object' && !(value instanceof Date)
  const param = (value: unknown) => (isJson(value) ? JSON.stringify(value) : value)
  const failure = (err: unknown) => ({
    data: null,
    error: { code: (err as { code?: string }).code ?? 'unknown', message: String(err) },
  })

  async function rpc(name: string, params: Record<string, unknown>) {
    harness.events.push(`rpc:${name}`)
    const keys = Object.keys(params)
    const args = keys.map((key, i) => `${key} => $${i + 1}${isJson(params[key]) ? '::jsonb' : ''}`).join(', ')
    const values = keys.map((key) => param(params[key]))
    try {
      if (SCALAR_FUNCTIONS.has(name)) {
        const result = await asRole<{ result: unknown }>(db, role, `select public.${name}(${args}) as result`, values)
        return { data: result.rows[0]?.result ?? null, error: null }
      }
      return { data: (await asRole(db, role, `select * from public.${name}(${args})`, values)).rows, error: null }
    } catch (err) {
      return failure(err)
    }
  }

  function from(table: string) {
    const filters: { sql: string; value?: unknown }[] = []
    let action: 'select' | 'update' | 'delete' = 'select'
    let payload: Record<string, unknown> = {}
    let columns = '*'
    let orderBy = ''
    let single = false

    const builder = {
      select(cols = '*') {
        columns = cols
        return builder
      },
      update(values: Record<string, unknown>) {
        action = 'update'
        payload = values
        return builder
      },
      delete() {
        action = 'delete'
        return builder
      },
      eq(column: string, value: unknown) {
        filters.push({ sql: `${column} = $?`, value })
        return builder
      },
      gte(column: string, value: unknown) {
        filters.push({ sql: `${column} >= $?`, value })
        return builder
      },
      order(column: string, opts?: { ascending?: boolean }) {
        orderBy = ` order by ${column} ${opts?.ascending === false ? 'desc' : 'asc'}`
        return builder
      },
      maybeSingle() {
        single = true
        return builder
      },
      then(resolve: (value: unknown) => void, reject: (err: unknown) => void) {
        run().then(resolve, reject)
      },
    }

    async function run() {
      const values: unknown[] = []
      const bind = (value: unknown) => {
        values.push(param(value))
        return `$${values.length}`
      }
      const where = () =>
        filters.length ? ' where ' + filters.map((f) => (f.sql.includes('$?') ? f.sql.replace('$?', bind(f.value)) : f.sql)).join(' and ') : ''
      try {
        if (action === 'update') {
          const sets = Object.keys(payload).map((key) => `${key} = ${bind(payload[key])}`)
          await asRole(db, role, `update public.${table} set ${sets.join(', ')}${where()}`, values)
          return { data: null, error: null }
        }
        if (action === 'delete') {
          await asRole(db, role, `delete from public.${table}${where()}`, values)
          return { data: null, error: null }
        }
        const rows = (await asRole(db, role, `select ${columns} from public.${table}${where()}${orderBy}`, values)).rows
        return { data: single ? rows[0] ?? null : rows, error: null }
      } catch (err) {
        return failure(err)
      }
    }

    return builder
  }

  const auth = {
    admin: {
      async deleteUser(id: string) {
        harness.events.push('auth.deleteUser')
        if (harness.authFailures > 0) {
          harness.authFailures--
          return { data: { user: null }, error: { code: 'unexpected_failure', status: 500, message: `Database error deleting user ${id}` } }
        }
        // GoTrue deletes the row as its own admin role; the cascades run as table owners.
        const result = await asRole(db, null, 'delete from auth.users where id = $1', [id])
        if (!result.affectedRows) {
          return { data: { user: null }, error: { code: 'user_not_found', status: 404, message: 'User not found' } }
        }
        return { data: { user: {} }, error: null }
      },
    },
  }

  return { rpc, from, storage: harness.storage, auth } as unknown as SupabaseClient
}

// ─────────────────────────── SEEDING ───────────────────────────

const rowsOf = async <T = Record<string, unknown>>(db: PGlite, sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows
const count = async (db: PGlite, sql: string, params: unknown[] = []) =>
  Number((await db.query<{ n: number }>(sql, params)).rows[0].n)

const FUTURE = '2099-01-01'

async function seedAccount(db: PGlite, storage: FakeStorage, owner: string, tag: string) {
  const email = `${tag}@example.com`
  // The signup trigger from schema.sql creates the profile row, as in production.
  await db.query('insert into auth.users (id, email) values ($1, $2)', [owner, email])
  await db.query(
    `update public.abc_profiles set
       full_name = $2, company = $3, phone = $4, user_name = $5, card_slug = $6, card_published = true,
       google_connected = true, google_email = $7, google_refresh_token = $8, google_access_token = $9,
       stripe_customer_id = $10, onboarding_completed = true
     where id = $1`,
    [owner, `Person ${tag}`, `Company ${tag}`, `+420 600 ${tag.length}00 000`, `user${tag}`, `${tag}-card`, email, `g-refresh-secret-${tag}`, `g-access-secret-${tag}`, `cus_Test${tag}`]
  )

  await db.query("insert into public.card_links (user_id, label, url) values ($1, 'Site', 'https://example.com')", [owner])
  await db.query('insert into public.card_events (user_id, name, event_name, date_from, date_to) values ($1, $2, $2, $3, $3)', [owner, `Fair ${tag}`, FUTURE])
  await db.query("insert into public.card_views (user_id, source) values ($1, 'qr')", [owner])
  await db.query("insert into public.card_showcase_items (user_id, image_url) values ($1, 'https://x.supabase.co/storage/v1/object/public/card-media/showcase.jpg')", [owner])

  const contact = (await rowsOf<{ id: string }>(db, "insert into public.scanned_contacts (user_id, name, email, source) values ($1, $2, $3, 'business_card') returning id", [owner, `Met ${tag}`, `met-${tag}@partner.example`]))[0].id
  const second = (await rowsOf<{ id: string }>(db, "insert into public.scanned_contacts (user_id, name, source) values ($1, $2, 'manual') returning id", [owner, `Typed ${tag}`]))[0].id
  const encounter = (await rowsOf<{ id: string }>(db, "insert into public.contact_encounters (contact_id, user_id, event, discussed) values ($1, $2, 'MEDICA 2026', 'Pricing') returning id", [contact, owner]))[0].id
  await db.query("insert into public.followup_sequences (contact_id, user_id, step, message_type, scheduled_at) values ($1, $2, 1, 'email', now())", [contact, owner])
  await db.query("insert into public.crm_activities (contact_id, user_id, activity_type) values ($1, $2, 'scanned'), (null, $2, 'note')", [contact, owner])
  await db.query('insert into public.crm_opportunities (contact_id, user_id) values ($1, $2)', [second, owner])

  for (const provider of ['hubspot', 'salesforce', 'pipedrive']) {
    await db.query(
      "insert into public.crm_connections (user_id, provider, access_token_encrypted, refresh_token_encrypted) values ($1, $2, $3, $4)",
      [owner, provider, `v1:iv:tag:${provider}-access-${tag}`, `v1:iv:tag:${provider}-refresh-${tag}`]
    )
  }
  await db.query(
    "insert into public.crm_object_mappings (user_id, provider, local_object_type, local_object_id, remote_object_type, remote_object_id) values ($1, 'hubspot', 'contact', $2, 'contact', $3)",
    [owner, contact, `hs-${tag}`]
  )

  const batch = (await rowsOf<{ id: string }>(db, "insert into public.scan_batches (user_id, shared_event, status) values ($1, 'MEDICA 2026', 'saved') returning id", [owner]))[0].id
  await db.query(
    "insert into public.scan_batch_items (batch_id, user_id, position, first_name, created_contact_id, created_encounter_id, credit_consumed) values ($1, $2, 0, 'Met', $3, $4, true), ($1, $2, 1, 'Dropped', null, null, false)",
    [batch, owner, contact, encounter]
  )

  // Ten credits bought, two carried from the legacy counter, three spent.
  await db.query("select * from public.grant_scan_credits($1, 10, 'grant', 'stripe_checkout', $2, 'scan_pack_8', $3, '{}'::jsonb)", [owner, `cs_test_${tag}`, `stripe:checkout:cs_test_${tag}`])
  await db.query("select * from public.grant_scan_credits($1, 2, 'opening_balance', 'legacy_bridge', null, null, $2, '{}'::jsonb)", [owner, `legacy_opening:${owner}`])
  for (const n of [1, 2, 3]) {
    await db.query("select * from public.consume_scan_credit($1, 'single_scan', $2, $3, '{}'::jsonb)", [owner, `digest-${tag}-${n}`, `single_scan:digest-${tag}-${n}`])
  }
  // An Event Pass that has run out: economic history, not a blocker.
  await db.query(
    "insert into public.billing_entitlements (user_id, product_key, status, stripe_checkout_session_id, current_period_start, current_period_end) values ($1, 'pro_event', 'expired', $2, '2026-01-01', '2026-01-05')",
    [owner, `cs_pass_${tag}`]
  )

  storage.put('card-media', `${owner}/photo-1.jpg`)
  storage.put('card-media', `${owner}/cover-1.jpg`)
  storage.put('card-media', `${owner}/showcase/a.jpg`)
  storage.put('avatars', `${owner}/avatar.png`)

  // A native Gmail connection waiting to be claimed: encrypted tokens on the row.
  await db.query(
    "insert into public.native_connector_attempts (user_id, provider, state_hash, nonce_hash, handoff_hash, status, result_encrypted, expires_at) values ($1, 'google-gmail', $2, 'nonce-hash', 'handoff-hash', 'authorized', 'v1:iv:tag:native-result', now() + interval '10 minutes')",
    [owner, `state-hash-${tag}`]
  )

  return { email, contact, second, encounter, batch }
}

/** Everything that belongs to one owner, for before/after comparison. */
async function snapshot(db: PGlite, storage: FakeStorage, owner: string) {
  const out: Record<string, unknown> = {
    auth: await rowsOf(db, 'select * from auth.users where id = $1', [owner]),
    abc_profiles: await rowsOf(db, 'select * from public.abc_profiles where id = $1', [owner]),
  }
  for (const table of OWNER_TABLES) {
    out[table] = await rowsOf(db, `select * from public.${table} where user_id = $1 order by id`, [owner])
  }
  out.storage = ACCOUNT_STORAGE_BUCKETS.map((bucket) => storage.paths(bucket, `${owner}/`))
  return out
}

async function ownedRowCounts(db: PGlite, owner: string) {
  const counts: Record<string, number> = {
    abc_profiles: await count(db, 'select count(*)::int as n from public.abc_profiles where id = $1', [owner]),
  }
  for (const table of OWNER_TABLES) {
    counts[table] = await count(db, `select count(*)::int as n from public.${table} where user_id = $1`, [owner])
  }
  return counts
}

const zeroCounts = () => Object.fromEntries([['abc_profiles', 0], ...OWNER_TABLES.map((t) => [t, 0])])

async function captured<T>(fn: () => Promise<T>): Promise<{ value: T; logs: string[]; fetchCalls: number }> {
  const logs: string[] = []
  const originalError = console.error
  const originalWarn = console.warn
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  console.error = (...args: unknown[]) => logs.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
  console.warn = console.error
  globalThis.fetch = (async () => {
    fetchCalls++
    throw new Error('network unavailable in this suite')
  }) as typeof fetch
  try {
    return { value: await fn(), logs, fetchCalls }
  } finally {
    console.error = originalError
    console.warn = originalWarn
    globalThis.fetch = originalFetch
  }
}

// ─────────────────────────── RUN ───────────────────────────

async function run() {
  const { db, skipped } = await freshDatabase()
  check('D0 every migration applies in PGlite except the pinned environment-only set, and the deletion migration applies', skipped, ENVIRONMENT_ONLY)

  const harness: Harness = { events: [], storage: new FakeStorage([], ACCOUNT_STORAGE_BUCKETS), authFailures: 0 }
  harness.storage = new FakeStorage(harness.events, ACCOUNT_STORAGE_BUCKETS)
  const storage = harness.storage
  const service = supabaseOver(db, harness, 'service_role')
  const publicReader = supabaseOver(db, harness, null)

  // ═══════════════════ THE OWNER GRAPH ═══════════════════

  const ownerTables = await rowsOf<{ table_name: string }>(
    db,
    "select distinct table_name from information_schema.columns where table_schema = 'public' and column_name in ('user_id', 'owner_id') order by table_name"
  )
  check(
    'G1 every public table keyed to an owner is one the deletion accounts for (a new one fails here until it is)',
    ownerTables.map((r) => r.table_name),
    [...OWNER_TABLES, 'account_deletions'].sort()
  )

  const owner = await seedAccount(db, storage, OWNER, 'owner')
  const other = await seedAccount(db, storage, OTHER, 'other')
  // Somebody else's contact names the owner's ABC account: that record is theirs.
  const linked = (await rowsOf<{ id: string }>(db, "insert into public.scanned_contacts (user_id, name, linked_abc_user_id, linked_abc_card_slug, source) values ($1, 'Person owner', $2, 'owner-card', 'abc_card') returning id", [OTHER, OWNER]))[0].id
  // Shared and look-alike objects that must survive.
  storage.put('card-media', 'system/brand.png')
  storage.put('card-media', `${OWNER}0/not-the-owner.jpg`)
  // Stripe deliveries and rate-limit counters carry no owner.
  await db.query("insert into public.stripe_webhook_events (event_id, event_type, status) values ('evt_test_1', 'checkout.session.completed', 'processed'), ('evt_test_2', 'customer.subscription.deleted', 'processed')")
  await db.query("select public.consume_public_rate_limit('hashed-bucket', 3600, 5)")

  check('P0 setup: the owner has a live public card', (await loadPublishedCardBySlug(publicReader, 'owner-card'))?.slug, 'owner-card')

  const otherBefore = await snapshot(db, storage, OTHER)
  const linkedBefore = await rowsOf(db, 'select * from public.scanned_contacts where id = $1', [linked])
  const webhooksBefore = await rowsOf(db, 'select * from public.stripe_webhook_events order by event_id')
  const rateLimitsBefore = await rowsOf(db, 'select bucket, hits from public.public_rate_limits order by bucket')
  const ownerCountsBefore = await ownedRowCounts(db, OWNER)

  check(
    'S0 setup: the owner holds rows in every owner table',
    Object.values(ownerCountsBefore).every((n) => n > 0),
    true
  )

  harness.events.length = 0
  const first = await captured(() => deleteAccountForOwner(service, OWNER))

  check('A1 an owner deletes their own account', first.value, { ok: true })

  // Ordering.
  const events = [...harness.events]
  const authAt = events.indexOf('auth.deleteUser')
  const firstStorageAt = events.findIndex((e) => e.startsWith('storage.'))
  const lastRemovalBeforeAuth = events.slice(0, authAt).map((e, i) => (e.startsWith('storage.remove') ? i : -1)).filter((i) => i >= 0).pop() ?? -1
  check(
    'O1 data first, then storage, then the auth user last — each exactly once',
    [events[0], firstStorageAt > 0, lastRemovalBeforeAuth > 0 && lastRemovalBeforeAuth < authAt, events.filter((e) => e === 'auth.deleteUser').length, events.filter((e) => e === 'rpc:remove_account_data').length],
    ['rpc:remove_account_data', true, true, 1, 1]
  )

  // What is gone.
  check('A2 contacts, meetings, batches and items, follow-ups, activities, opportunities, sequences, CRM mappings, card rows, ledger and entitlements: nothing of the owner is left', await ownedRowCounts(db, OWNER), zeroCounts())
  check('A3 the auth user is gone', await count(db, 'select count(*)::int as n from auth.users where id = $1', [OWNER]), 0)
  check('P1 the public card no longer loads', await loadPublishedCardBySlug(publicReader, 'owner-card'), null)
  check(
    'P2 no profile answers to the old slug, username or id (/d, /u, /card, OG, QR and vCard all read these)',
    [
      await count(db, "select count(*)::int as n from public.abc_profiles where card_slug = 'owner-card'"),
      await count(db, "select count(*)::int as n from public.abc_profiles where user_name = 'userowner'"),
      await count(db, 'select count(*)::int as n from public.abc_profiles where id = $1', [OWNER]),
    ],
    [0, 0, 0]
  )
  const everything = JSON.stringify(await rowsOf(db, "select to_jsonb(t) as r from (select * from public.account_deletions) t"))
  check('T1 the Gmail tokens are gone and were not copied anywhere', /g-(refresh|access)-secret-owner/.test(everything) || (await count(db, "select count(*)::int as n from public.abc_profiles where google_refresh_token like '%-owner'")) > 0, false)
  check(
    'T2 HubSpot, Salesforce and Pipedrive credentials are gone, one provider at a time',
    await Promise.all(['hubspot', 'salesforce', 'pipedrive'].map((p) => count(db, 'select count(*)::int as n from public.crm_connections where user_id = $1 and provider = $2', [OWNER, p]))),
    [0, 0, 0]
  )
  check('T3 no provider was called: no request left this process, so a provider outage cannot hold deletion up', first.fetchCalls, 0)
  check(
    'F1 storage: the owner’s images are gone from both buckets, including folders',
    ACCOUNT_STORAGE_BUCKETS.map((bucket) => storage.paths(bucket, `${OWNER}/`)),
    [[], []]
  )
  check('F2 shared assets and a look-alike folder are untouched', [storage.paths('card-media', 'system/'), storage.paths('card-media', `${OWNER}0/`)], [['system/brand.png'], [`${OWNER}0/not-the-owner.jpg`]])

  // What is kept, and what it holds.
  const record = (await rowsOf<Record<string, unknown>>(db, 'select * from public.account_deletions where user_id = $1', [OWNER]))[0]
  check(
    'L1 the deletion record is complete, with no error and one attempt',
    [record?.status, record?.attempts, record?.last_error_code, record?.completed_at !== null, record?.data_removed_at !== null],
    ['completed', 1, null, true, true]
  )
  check(
    'L2 the ledger is summarised before it cascades: bought, bridged, spent, and the balance the account still held',
    record?.credit_summary,
    { granted: 10, consumed: 3, reversed: 0, movements: 5, opening_balance: 2, balance_at_deletion: 9 }
  )
  check(
    'L3 each purchase is kept as its processor reference, product and amount — not the scans it paid for',
    (record?.credit_purchases as Record<string, unknown>[]).map((p) => [p.source, p.source_ref, p.product_key, p.credits]),
    [['stripe_checkout', 'cs_test_owner', 'scan_pack_8', 10]]
  )
  check(
    'B1 Pro billing is kept as product, status and Stripe references, then the entitlement rows go with the account',
    [(record?.pro_entitlements as Record<string, unknown>[]).map((e) => [e.product_key, e.status, e.stripe_checkout_session_id]), record?.stripe_customer_id, await count(db, 'select count(*)::int as n from public.billing_entitlements where user_id = $1', [OWNER])],
    [[['pro_event', 'expired', 'cs_pass_owner']], 'cus_Testowner', 0]
  )
  check(
    'L4 the record carries no personal data: no name, email, phone, company, slug, username, contact, token or scan digest',
    /Person owner|owner@example\.com|\+420|Company owner|owner-card|userowner|Met owner|Typed owner|partner\.example|secret|v1:iv|digest-owner/.test(everything),
    false
  )
  check('L5 no refund and no reversal: nothing was granted, reversed or charged during deletion', [await count(db, "select count(*)::int as n from public.scan_credit_ledger where kind = 'reversal'"), (record?.credit_summary as { reversed: number }).reversed], [0, 0])
  check('W1 Stripe webhook history is kept exactly as it was: it names no owner', await rowsOf(db, 'select * from public.stripe_webhook_events order by event_id'), webhooksBefore)
  check('W2 rate-limit counters are untouched: hashed, ownerless', await rowsOf(db, 'select bucket, hits from public.public_rate_limits order by bucket'), rateLimitsBefore)

  // Isolation.
  check('I1 another account is entirely unchanged: profile, card, contacts, credentials, ledger, storage', await snapshot(db, storage, OTHER), otherBefore)
  check('I2 another owner’s contact that names the deleted account keeps it, link and all', await rowsOf(db, 'select * from public.scanned_contacts where id = $1', [linked]), linkedBefore)
  check('I3 and the other public card still loads', (await loadPublishedCardBySlug(publicReader, 'other-card'))?.slug, 'other-card')
  void other
  void owner

  // Logs.
  check('X1 nothing logged during a successful deletion', first.logs, [])

  // ═══════════════════ RETRIES ═══════════════════

  await seedAccount(db, storage, RETRY, 'retry')
  for (let i = 0; i < 130; i++) storage.put('card-media', `${RETRY}/showcase/${String(i).padStart(3, '0')}.jpg`)
  storage.failRemoval.add('card-media')
  harness.events.length = 0
  const retryFirst = await captured(() => deleteAccountForOwner(service, RETRY))
  const retryRecord = async () => (await rowsOf<Record<string, unknown>>(db, 'select status, attempts, last_error_code, credit_summary from public.account_deletions where user_id = $1', [RETRY]))[0]
  check('R1 a storage failure stops before the auth user, and says which step', [retryFirst.value, harness.events.includes('auth.deleteUser')], [{ ok: false, code: 'deletion_incomplete', stage: 'storage' }, false])
  check(
    'R2 by then the data step has committed: card, credentials (including a native connection awaiting claim) and contacts are gone, the sign-in and the economic rows remain',
    [
      await loadPublishedCardBySlug(publicReader, 'retry-card'),
      await count(db, 'select count(*)::int as n from public.abc_profiles where id = $1', [RETRY]),
      await count(db, 'select count(*)::int as n from public.crm_connections where user_id = $1', [RETRY]),
      await count(db, 'select count(*)::int as n from public.native_connector_attempts where user_id = $1', [RETRY]),
      await count(db, 'select count(*)::int as n from public.scanned_contacts where user_id = $1', [RETRY]),
      await count(db, 'select count(*)::int as n from auth.users where id = $1', [RETRY]),
      await count(db, 'select count(*)::int as n from public.scan_credit_ledger where user_id = $1', [RETRY]),
    ],
    [null, 0, 0, 0, 0, 1, 5]
  )
  const retryAfterFailure = await retryRecord()
  check('R3 the record says where it stopped, as a code', [retryAfterFailure?.status, retryAfterFailure?.attempts, retryAfterFailure?.last_error_code], ['data_removed', 1, 'storage_failed'])
  check('R4 the storage failure is logged as a bucket name, never the storage message or the path', retryFirst.logs.some((l) => /unlink|\/data\/|showcase|retry/.test(l)) || retryFirst.logs.length === 0, false)

  storage.failRemoval.delete('card-media')
  harness.events.length = 0
  const retrySecond = await captured(() => deleteAccountForOwner(service, RETRY))
  const retryDone = await retryRecord()
  check('R5 the same request again finishes the job', [retrySecond.value, await count(db, 'select count(*)::int as n from auth.users where id = $1', [RETRY])], [{ ok: true }, 0])
  check('R6 one record, two attempts, completed, error cleared, and the summary taken on the retry still matches', [retryDone?.status, retryDone?.attempts, retryDone?.last_error_code, retryDone?.credit_summary], ['completed', 2, null, retryAfterFailure?.credit_summary])
  check('F3 more than a page of objects is listed and removed, in removals of at most a page', [storage.paths('card-media', `${RETRY}/`), storage.largestRemoval <= 100, storage.largestRemoval > 0], [[], true, true])
  check('R7 the retry left nothing of the account behind', await ownedRowCounts(db, RETRY), zeroCounts())

  await seedAccount(db, storage, AUTHFAIL, 'authfail')
  harness.authFailures = 1
  const authFirst = await captured(() => deleteAccountForOwner(service, AUTHFAIL))
  const authRecord = (await rowsOf<Record<string, unknown>>(db, 'select status, last_error_code from public.account_deletions where user_id = $1', [AUTHFAIL]))[0]
  check('R8 an auth failure is reported as the auth step, recorded as a code, and the sign-in still exists to retry with', [authFirst.value, authRecord?.status, authRecord?.last_error_code, await count(db, 'select count(*)::int as n from auth.users where id = $1', [AUTHFAIL])], [{ ok: false, code: 'deletion_incomplete', stage: 'auth' }, 'data_removed', 'auth_delete_failed', 1])
  check('R9 the auth error message and the user id never reach the log', authFirst.logs.some((l) => l.includes(AUTHFAIL) || /Database error/.test(l)), false)
  const authSecond = await captured(() => deleteAccountForOwner(service, AUTHFAIL))
  check('R10 retried, it completes', [authSecond.value, await ownedRowCounts(db, AUTHFAIL), await count(db, 'select count(*)::int as n from auth.users where id = $1', [AUTHFAIL])], [{ ok: true }, zeroCounts(), 0])

  harness.events.length = 0
  const again = await captured(() => deleteAccountForOwner(service, OWNER))
  const ownerRecordAgain = (await rowsOf<Record<string, unknown>>(db, 'select status, attempts from public.account_deletions where user_id = $1', [OWNER]))[0]
  check('R11 deleting an account that is already gone succeeds with nothing to do, and stays completed', [again.value, ownerRecordAgain?.status, ownerRecordAgain?.attempts, await count(db, 'select count(*)::int as n from public.account_deletions where user_id = $1', [OWNER])], [{ ok: true }, 'completed', 2, 1])
  check('R12 and still touches nobody else', await snapshot(db, storage, OTHER), otherBefore)

  // ═══════════════════ SUBSCRIPTIONS ═══════════════════

  await seedAccount(db, storage, SUBSCRIBER, 'subscriber')
  await db.query(
    "insert into public.billing_entitlements (user_id, product_key, status, stripe_subscription_id, stripe_checkout_session_id, current_period_start, current_period_end, cancel_at_period_end) values ($1, 'pro_monthly', 'active', 'sub_test_subscriber', 'cs_sub_subscriber', now() - interval '1 day', now() + interval '29 days', false)",
    [SUBSCRIBER]
  )
  const subscriberBefore = await snapshot(db, storage, SUBSCRIBER)
  harness.events.length = 0
  const blockedResult = await captured(() => deleteAccountForOwner(service, SUBSCRIBER))
  check('S1 an active recurring subscription blocks deletion with active_subscription', blockedResult.value, { ok: false, code: 'active_subscription' })
  check(
    'S2 and nothing changed: no data removed, no record written, no storage or auth call',
    [JSON.stringify(await snapshot(db, storage, SUBSCRIBER)) === JSON.stringify(subscriberBefore), await count(db, 'select count(*)::int as n from public.account_deletions where user_id = $1', [SUBSCRIBER]), harness.events.filter((e) => e !== 'rpc:remove_account_data')],
    [true, 0, []]
  )
  check('S3 the screen can say so in advance', await readAccountDeletionBlocker(service, SUBSCRIBER), 'active_subscription')

  const blockerFor = async (status: string, cancelAtPeriodEnd: boolean) => {
    await db.query('update public.billing_entitlements set status = $2, cancel_at_period_end = $3 where user_id = $1 and stripe_subscription_id is not null', [SUBSCRIBER, status, cancelAtPeriodEnd])
    return readAccountDeletionBlocker(service, SUBSCRIBER)
  }
  check(
    'S4 blocks every state Stripe can still charge; allows cancelled, expired, and active or trialing set to end',
    [
      await blockerFor('active', false),
      await blockerFor('trialing', false),
      await blockerFor('past_due', false),
      await blockerFor('unpaid', false),
      await blockerFor('incomplete', false),
      await blockerFor('paused', false),
      await blockerFor('past_due', true),
      await blockerFor('active', true),
      await blockerFor('trialing', true),
      await blockerFor('canceled', false),
      await blockerFor('expired', false),
    ],
    ['active_subscription', 'active_subscription', 'active_subscription', 'active_subscription', 'active_subscription', 'active_subscription', 'active_subscription', null, null, null, null]
  )
  await db.query("update public.abc_profiles set stripe_subscription_id = 'sub_legacy_plan' where id = $1", [SUBSCRIBER])
  check('S5 a legacy plan subscription blocks too', await readAccountDeletionBlocker(service, SUBSCRIBER), 'active_subscription')
  await db.query('update public.abc_profiles set stripe_subscription_id = null where id = $1', [SUBSCRIBER])
  check('S6 an expired Event Pass and bought credits never block', await readAccountDeletionBlocker(service, OTHER), null)

  // A free account with nothing bought.
  await db.query('insert into auth.users (id, email) values ($1, $2)', [FREE, 'free@example.com'])
  storage.objects.delete('avatars')
  const freeResult = await captured(() => deleteAccountForOwner(service, FREE))
  check('S7 a free account with no purchases deletes, and a missing bucket counts as empty', [freeResult.value, await readAccountDeletionBlocker(service, FREE), await count(db, 'select count(*)::int as n from auth.users where id = $1', [FREE])], [{ ok: true }, null, 0])
  const freeRecord = (await rowsOf<Record<string, unknown>>(db, 'select credit_summary, credit_purchases, pro_entitlements, stripe_customer_id from public.account_deletions where user_id = $1', [FREE]))[0]
  check('S8 its record is empty of economics, honestly', freeRecord, { credit_summary: { granted: 0, consumed: 0, reversed: 0, movements: 0, opening_balance: 0, balance_at_deletion: 0 }, credit_purchases: [], pro_entitlements: [], stripe_customer_id: null })
  storage.objects.set('avatars', new Set([`${OTHER}/avatar.png`]))

  await db.query("update public.billing_entitlements set status = 'active', cancel_at_period_end = false where user_id = $1 and stripe_subscription_id is not null", [SUBSCRIBER])
  storage.failListing.add('card-media')
  harness.events.length = 0
  const stillBlocked = await captured(() => deleteAccountForOwner(service, SUBSCRIBER))
  check('S9 a blocked account is refused before storage is ever listed', [stillBlocked.value, harness.events.some((e) => e.startsWith('storage.'))], [{ ok: false, code: 'active_subscription' }, false])

  // Cancelled in Stripe, and the webhook has arrived: now it may go.
  await db.query("update public.billing_entitlements set status = 'canceled' where user_id = $1 and stripe_subscription_id is not null", [SUBSCRIBER])
  const listFailure = await captured(() => deleteAccountForOwner(service, SUBSCRIBER))
  check(
    'S10 once cancelled it proceeds; a storage listing failure stops before the auth user and logs no storage message or path',
    [listFailure.value, await count(db, 'select count(*)::int as n from auth.users where id = $1', [SUBSCRIBER]), listFailure.logs.some((l) => /\/data\/|backend|subscriber|55555555/.test(l))],
    [{ ok: false, code: 'deletion_incomplete', stage: 'storage' }, 1, false]
  )
  storage.failListing.delete('card-media')
  check('S11 and retried, the cancelled subscriber is deleted, subscription history kept in the record', [await deleteAccountForOwner(service, SUBSCRIBER), ((await rowsOf<{ pro_entitlements: { product_key: string; status: string }[] }>(db, 'select pro_entitlements from public.account_deletions where user_id = $1', [SUBSCRIBER]))[0]?.pro_entitlements ?? []).map((e) => [e.product_key, e.status]).sort()], [{ ok: true }, [['pro_event', 'expired'], ['pro_monthly', 'canceled']]])

  // ═══════════════════ OWNERSHIP AND PRIVILEGE ═══════════════════

  harness.events.length = 0
  check('I4 an id that is not a uuid reaches nothing', [await deleteAccountForOwner(service, 'not-a-uuid'), await deleteAccountForOwner(service, `${OTHER}' or true --`), harness.events], [{ ok: false, code: 'deletion_incomplete', stage: 'data' }, { ok: false, code: 'deletion_incomplete', stage: 'data' }, []])

  const denied = async (role: Role, sql: string, params: unknown[] = []) => {
    try {
      await asRole(db, role, sql, params, OTHER)
      return 'allowed'
    } catch (err) {
      return (err as { code?: string }).code ?? 'error'
    }
  }
  check(
    'I5 a signed-in browser cannot run the deletion or the check, for itself or anyone — only the server can',
    [
      await denied('authenticated', 'select public.remove_account_data($1)', [OTHER]),
      await denied('authenticated', 'select public.remove_account_data($1)', [SUBSCRIBER]),
      await denied('anon', 'select public.remove_account_data($1)', [OTHER]),
      await denied('authenticated', 'select public.account_deletion_blocker($1)', [OTHER]),
    ],
    ['42501', '42501', '42501', '42501']
  )
  check(
    'I6 deletion records are server-only, and even the server cannot delete one',
    [
      await denied('authenticated', 'select * from public.account_deletions'),
      await denied('anon', 'select * from public.account_deletions'),
      await denied('service_role', 'delete from public.account_deletions where user_id = $1', [OWNER]),
      await denied('service_role', 'select count(*) from public.account_deletions'),
    ],
    ['42501', '42501', '42501', 'allowed']
  )
  check('I7 the other account survived every scenario above', await snapshot(db, storage, OTHER), otherBefore)

  // ═══════════════════ THE ROUTE ═══════════════════

  const route = code('app/api/account/delete/route.ts')
  const { POST } = await import('@/app/api/account/delete/route')
  const notJson = await POST(new NextRequest('https://www.abccard.io/api/account/delete', { method: 'POST', body: 'confirm=DELETE', headers: { 'content-type': 'application/x-www-form-urlencoded' } }))
  check('RT1 a form-encoded request is refused before anything runs', [notJson.status, await notJson.json(), notJson.headers.get('cache-control')], [415, { error: 'invalid_request' }, 'no-store'])
  const outOfScope = await captured(async () => {
    const res = await POST(new NextRequest('https://www.abccard.io/api/account/delete', { method: 'POST', body: JSON.stringify({ confirm: 'DELETE', userId: OTHER }), headers: { 'content-type': 'application/json' } }))
    return { status: res.status, body: await res.text() }
  })
  check('RT2 an unexpected failure answers a stable code, never the thrown message', [outOfScope.value.status, JSON.parse(outOfScope.value.body), Object.keys(JSON.parse(outOfScope.value.body)), /cookies|scope|supabase|NEXT_PUBLIC|stack|\bat\s/i.test(outOfScope.value.body)], [500, { error: 'deletion_incomplete' }, ['error'], false])
  check(
    'RT3 session first, then the body, then the confirmation, then deletion — of the session user',
    [
      route.indexOf('auth.getUser()') > 0,
      route.indexOf('auth.getUser()') < route.indexOf("refuse('unauthorized', 401)"),
      route.indexOf("refuse('unauthorized', 401)") < route.indexOf('req.json()'),
      route.indexOf('req.json()') < route.indexOf('isAccountDeletionConfirmed(body)'),
      route.indexOf("refuse('confirmation_required', 400)") < route.indexOf('deleteAccountForOwner('),
      route.includes('deleteAccountForOwner(createServiceClient(), user.id)'),
    ],
    [true, true, true, true, true, true]
  )
  check('RT4 no id is taken from the request: the body is only ever handed to the confirmation check', [/\b(userId|user_id|ownerId|owner_id)\b/.test(route), /body\.|body\[/.test(route), (route.match(/\bbody\b/g) ?? []).length], [false, false, 4])
  check(
    'RT5 every answer is a stable code or { deleted: true }, never a message',
    [
      [...route.matchAll(/refuse\('([a-z_]+)'/g)].map((m) => m[1]).every((c) => (ACCOUNT_DELETION_ERROR_CODES as readonly string[]).includes(c)),
      /NextResponse\.json\((?!\{ error: code \}|\{ deleted: true \})/.test(route),
      /\.message\b/.test(route),
    ],
    [true, false, false]
  )
  check('RT6 active_subscription is its own 409; every other failure is deletion_incomplete', [route.includes("refuse('active_subscription', 409)"), route.includes("refuse('deletion_incomplete', 500)")], [true, true])
  check('RT7 the session is ended after a deletion, by signOut and by expiring the auth cookies', [route.indexOf('await endSession(auth)') > route.indexOf('deleteAccountForOwner('), /auth-token/.test(route)], [true, true])

  const confirmations = [
    { confirm: 'DELETE' },
    { confirm: ' DELETE ' },
    { confirm: 'delete' },
    { confirm: 'Delete' },
    { confirm: true },
    { confirm: 'DELETE ME' },
    {},
    null,
    'DELETE',
    ['DELETE'],
    { confirmation: 'DELETE' },
  ].map(isAccountDeletionConfirmed)
  check('C1 only the typed word confirms: exact, case-sensitive, surrounding whitespace allowed', confirmations, [true, true, false, false, false, false, false, false, false, false, false])
  check('C2 the phrase is DELETE, and every code has a sentence of its own that is not a raw error', [ACCOUNT_DELETION_PHRASE, [...ACCOUNT_DELETION_ERROR_CODES, 'network'].map((c) => accountDeletionMessage(c).length > 20 && !/load failed|error:|exception|sql|token/i.test(accountDeletionMessage(c)))], ['DELETE', [true, true, true, true, true, true]])

  // ═══════════════════ THE SERVICE ═══════════════════

  const service_ = code('lib/account/delete.ts')
  check('V1 the deletion imports no Stripe, CRM, Gmail or Google code and makes no request of its own', /from '@\/lib\/(billing|crm|google|gmail)|stripe|hubspot|pipedrive|salesforce|fetch\(/i.test(service_.replace(/ACCOUNT_STORAGE_BUCKETS[^\n]*/, '')), false)
  check('V2 it never grants, consumes, reverses or refunds', /grant_scan_credits|consume_scan_credit|reversal|refund/i.test(service_), false)
  check('V3 the auth user is deleted only after data and storage both succeeded', service_.indexOf("rpc('remove_account_data'") < service_.indexOf('removeOwnerStorage(db, ownerId)') && service_.indexOf('removeOwnerStorage(db, ownerId)') < service_.indexOf('auth.admin.deleteUser('), true)
  check('V4 logs carry codes and bucket names only: no error message, no id', [/console\.(error|warn)\([^\n]*(\.message|ownerId|,\s*(error|authError|err)\s*\))/.test(service_), (service_.match(/console\.error\(/g) ?? []).length > 0], [false, true])

  // ═══════════════════ SCREENS AND REACHABILITY ═══════════════════

  const profileView = code('components/settings/ProfileSettingsView.tsx')
  const deleteView = code('components/settings/DeleteAccountView.tsx')
  const deletePage = code('app/settings/account/delete/page.tsx')
  const publicPage = code('app/account-deletion/page.tsx')
  const middleware = code('middleware.ts')
  const billingView = code('components/settings/BillingSettingsView.tsx')

  check('U1 Profile & Account links to Delete account', profileView.includes('href="/settings/account/delete"') && profileView.includes('Delete account'), true)
  check(
    'U2 the screen posts only the typed confirmation, and cannot be pressed until it matches',
    [deleteView.includes("fetch('/api/account/delete'"), deleteView.includes('body: JSON.stringify({ confirm: typed })'), deleteView.includes('disabled={!confirmed || deleting}'), /userId|user_id|ownerId/.test(deleteView)],
    [true, true, true, false]
  )
  check(
    'U3 it says what is deleted, what may be kept, what is not affected, and that credits are not refunded automatically',
    ['What is deleted', 'What may be kept', 'Not affected', 'not refunded', 'Gmail, HubSpot, Salesforce and Pipedrive'].map((s) => deleteView.includes(s)),
    [true, true, true, true, true]
  )
  check('U4 a blocked deletion points to Plan & Billing; failures use the shared sentences; a dropped connection is not "Load failed"', [deleteView.includes('href="/settings/billing"'), deleteView.includes('accountDeletionMessage(errorCode)'), deleteView.includes("setErrorCode('network')")], [true, true, true])
  check('U5 after deletion the browser is signed out and taken to the public page', [deleteView.includes("signOut({ scope: 'local' })"), deleteView.includes("'/account-deletion?deleted=1'")], [true, true])
  check('U6 the page reads the owner from the session', deletePage.includes('auth.getUser()') && deletePage.includes('readAccountDeletionBlocker(createServiceClient(), user.id)'), true)
  check(
    'U7 Pro subscribers can reach the portal to cancel, on the web, in exactly the states that block deletion',
    [billingView.includes('webCheckout && profile.stripe_customer_id && subscriptionStillBills(pro)'), billingView.includes("pro.status !== 'canceled' && pro.status !== 'expired'"), billingView.includes("pro.productKey !== 'pro_monthly' && pro.productKey !== 'pro_annual'")],
    [true, true, true]
  )

  const gated = /requirePro|resolveProEntitlement|resolveEntitlements|pro_required|insufficient_scan_credits|scanAvailable|isFounder/
  check('N1 no Pro, credit or founder gate anywhere on the path: free accounts delete like everyone else', [gated.test(route), gated.test(deleteView), gated.test(deletePage), gated.test(profileView.slice(profileView.indexOf('Delete account') - 400))], [false, false, false, false])
  check('N2 no native gate on the route or the screen: the store apps reach the same deletion', [/nativePlatform|webCheckoutAvailable|NATIVE_/.test(route), /nativePlatform|isNative|Capacitor/.test(deleteView)], [false, false])
  const origin = ABC_WEB_ORIGINS[0]
  check(
    'N3 inside the app, Settings, the deletion screen and the public page stay in the WebView; none is a download',
    [classifyNavigation('/settings/profile', origin), classifyNavigation('/settings/account/delete', origin), classifyNavigation('/account-deletion', origin), NATIVE_DOWNLOAD_PATHS.some((p) => '/api/account/delete'.startsWith(p))],
    [{ kind: 'internal', path: '/settings/profile' }, { kind: 'internal', path: '/settings/account/delete' }, { kind: 'internal', path: '/account-deletion' }, false]
  )
  check(
    'N4 middleware: the deletion screen needs a session but not a finished onboarding; the public page needs neither',
    [middleware.includes("'/settings/account/delete',"), middleware.includes("'/account-deletion',"), /protectedRoutes = \[[^\]]*'\/settings'/.test(flat(middleware)), /protectedRoutes = \[[^\]]*account-deletion/.test(flat(middleware))],
    [true, true, true, false]
  )

  check(
    'PG1 the public page explains how to delete in ABC, what to do without access, what goes, what may stay, and who to ask',
    ['Settings, then Profile & Account, then Delete account', 'If you cannot sign in', 'What is deleted', 'What may be kept', 'What ABC cannot delete', 'support@abccard.io', 'reset your password', 'cancel it in Plan & Billing first'].map((s) => publicPage.includes(s)),
    [true, true, true, true, true, true, true, true]
  )
  check('PG2 it reads no session, no database and no secret', /supabase|createServiceClient|getUser|process\.env/.test(publicPage), false)

  const duration = /\b\d+\s*(day|days|week|weeks|month|months|year|years)\b|within\s+\d+/i
  check(
    'PG3 no retention period is invented anywhere in the deletion copy, the service or the migration',
    [publicPage, deleteView, read('lib/account/deletion-confirmation.ts'), read('lib/account/delete.ts'), read(DELETION_MIGRATION)].map((text) => duration.test(text)),
    [false, false, false, false, false]
  )

  // ═══════════════════ THE MIGRATION ═══════════════════

  const migration = read(DELETION_MIGRATION)
  const outside = migration.replace(/\$\$[\s\S]*?\$\$/g, '').replace(/--.*$/gm, '')
  check('M1 additive: no DROP, TRUNCATE, or row written by the migration itself', /\b(drop\s+(table|column|constraint|trigger|policy|function)|truncate|delete\s+from|update\s+public\.|insert\s+into)\b/i.test(outside), false)
  check('M2 the only ALTER is enabling RLS on its own table', (outside.match(/\balter\s+table[^;]+/gi) ?? []).map(flat), ['alter table public.account_deletions enable row level security'])
  check('M3 nothing is granted to anon, authenticated or PUBLIC', /\bgrant\b[^;]*\bto\s+(anon|authenticated|public)\b/i.test(outside), false)
  const deleteGrant = flat(outside.match(/grant delete on table[^;]+;/i)?.[0] ?? '')
  check('M4 the service role is not given DELETE on the ledger, the entitlements, the webhook history or the deletion records', /scan_credit_ledger|billing_entitlements|stripe_webhook_events|account_deletions/.test(deleteGrant), false)
  const fns = await rowsOf<{ proname: string; prosecdef: boolean; proconfig: string[] | null }>(db, "select proname, prosecdef, proconfig from pg_proc where proname in ('remove_account_data', 'account_deletion_blocker') order by proname")
  check('M5 both functions run as the caller, with an empty search path', fns.map((f) => [f.proname, f.prosecdef, f.proconfig]), [['account_deletion_blocker', false, ['search_path=""']], ['remove_account_data', false, ['search_path=""']]])
  check('M6 the record has no foreign key, so it can outlive the account', await count(db, "select count(*)::int as n from pg_constraint where conrelid = 'public.account_deletions'::regclass and contype = 'f'"), 0)
  let reapplied = true
  try {
    await db.exec(migration)
  } catch {
    reapplied = false
  }
  check('M7 the migration re-applies cleanly', reapplied, true)
  check('M8 it sorts after the ledger migration it reads', DELETION_MIGRATION > LEDGER_MIGRATION, true)
  check('M9 existing ledger and entitlement cascades are unchanged: economic rows still leave only with the auth user', (await rowsOf<{ def: string }>(db, "select pg_get_constraintdef(oid) as def from pg_constraint where conrelid in ('public.scan_credit_ledger'::regclass, 'public.billing_entitlements'::regclass) and contype = 'f' order by conrelid::text")).map((r) => r.def), ['FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'])

  await db.close()

  const total = passed + failures.length
  if (failures.length) {
    console.log(`\nAccount deletion: ${passed}/${total} PASS, ${failures.length} FAILED\n`)
    for (const failure of failures) console.log('  FAIL ' + failure)
    process.exit(1)
  }
  console.log(`\nAccount deletion: ${passed}/${total} PASS`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
