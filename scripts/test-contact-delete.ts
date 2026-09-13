/**
 * Contact delete integrity regression suite.
 *
 * Run with `npm run test:contact-delete` from the repository root.
 *
 * Deleting a contact that a Multi-Card batch saved or matched used to be refused
 * by Postgres with 23502, and /api/card/delete answered 500. This suite first
 * reproduces that on the schema as it was, then proves the fix on the schema as
 * it is — in PGlite, against the real migrations for encounters, CRM activities,
 * CRM mappings, Multi-Card batches, the delete fix and the Smart Scan ledger.
 * It never connects to Supabase and never calls a CRM.
 */
import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { getScanCreditBalance, grantScanCredits } from '@/lib/billing/ledger'
import { deleteOwnedContact } from '@/lib/contacts/delete'
import { saveBatchContacts } from '@/lib/scan/batch-store'

// The CRM side effect after a save builds its own client from the environment.
// With none, it fails here instead of reaching a real project.
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
const flat = (text: string) => text.replace(/\s+/g, ' ').trim()

const FIX_MIGRATION = 'supabase/migrations/20260911120000_contact_delete_batch_history.sql'
const LEDGER_MIGRATION = 'supabase/migrations/20260912120000_smart_scan_credit_ledger.sql'

const OWNER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const FOUNDER = '33333333-3333-4333-8333-333333333333'
const LEGACY = '44444444-4444-4444-8444-444444444444'

const ids = new Map<string, string>()
const id = (label: string) => {
  if (!ids.has(label)) ids.set(label, '00000000-0000-4000-8000-' + String(ids.size + 1).padStart(12, '0'))
  return ids.get(label) as string
}

// ─────────────────────────── DATABASE ───────────────────────────

async function freshDatabase(withFix: boolean): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;

    -- abc_profiles, scanned_contacts and followup_sequences as supabase/schema.sql
    -- creates them, cut to the columns these paths touch, with production's RLS
    -- policy and grants on scanned_contacts.
    create table public.abc_profiles (
      id uuid primary key references auth.users (id) on delete cascade,
      plan text default 'free',
      email text,
      google_email text,
      scans_used integer default 0
    );
    create table public.scanned_contacts (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users (id) on delete cascade,
      name text, first_name text, last_name text, company text, role text,
      email text, phone text, website text, linkedin_url text,
      status text, scan_status text, source text, capture_origin text, capture_kind text,
      enrichment_status text, enrichment_step text, lead_source text,
      meeting_date text, meeting_event_date text, raw_event_text text, meeting_event_name text,
      event_name text, meeting_location text, meeting_topic text, next_action text, next_step text,
      followup_note text, next_action_date timestamptz,
      scanned_at timestamptz,
      created_at timestamptz not null default now()
    );
    alter table public.scanned_contacts enable row level security;
    create policy "contacts_all_own" on public.scanned_contacts
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
    grant select, insert, update, delete on public.scanned_contacts to authenticated, service_role;

    create table public.followup_sequences (
      id uuid primary key default gen_random_uuid(),
      contact_id uuid not null references public.scanned_contacts (id) on delete cascade,
      user_id uuid not null references auth.users (id) on delete cascade,
      step int not null,
      message_type text not null check (message_type in ('linkedin', 'email', 'whatsapp')),
      message_body text not null default ''
    );
  `)

  const migrations = [
    'supabase/migrations/20260622160000_crm_zero_input.sql',
    'supabase/migrations/20260823120000_contact_encounters.sql',
    'supabase/migrations/20260825120000_crm_object_mappings.sql',
    'supabase/migrations/20260910120000_multi_card_scan_batches.sql',
    ...(withFix ? [FIX_MIGRATION, LEDGER_MIGRATION] : []),
  ]
  for (const file of migrations) await db.exec(read(file))

  for (const owner of [OWNER, OTHER, FOUNDER, LEGACY]) {
    await db.query('insert into auth.users (id) values ($1)', [owner])
    await db.query('insert into public.abc_profiles (id) values ($1)', [owner])
  }
  return db
}

/** Enough of the Supabase client for the save and delete paths, over PGlite, as the service role. */
function supabaseOver(db: PGlite): SupabaseClient {
  const isJson = (value: unknown) => value !== null && typeof value === 'object' && !(value instanceof Date)
  const param = (value: unknown) => (isJson(value) ? JSON.stringify(value) : value)
  const failure = (err: unknown) => ({
    data: null,
    error: { code: (err as { code?: string }).code ?? 'unknown', message: String(err) },
  })

  async function rpc(name: string, params: Record<string, unknown>) {
    const keys = Object.keys(params)
    const args = keys.map((key, i) => `${key} => $${i + 1}${isJson(params[key]) ? '::jsonb' : ''}`).join(', ')
    const values = keys.map((key) => param(params[key]))
    try {
      if (name === 'scan_credit_balance') {
        const result = await db.query<{ result: unknown }>(`select public.${name}(${args}) as result`, values)
        return { data: result.rows[0]?.result ?? null, error: null }
      }
      return { data: (await db.query(`select * from public.${name}(${args})`, values)).rows, error: null }
    } catch (err) {
      return failure(err)
    }
  }

  function from(table: string) {
    const filters: { sql: string; value?: unknown }[] = []
    let action: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let payload: Record<string, unknown> = {}
    let columns = '*'
    let returning: string | null = null
    let orderBy = ''
    let limitN = 0
    let single = false

    const builder = {
      select(cols = '*') {
        if (action === 'select') columns = cols
        else returning = cols
        return builder
      },
      insert(values: Record<string, unknown>) {
        action = 'insert'
        payload = values
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
      is(column: string, value: null) {
        if (value === null) filters.push({ sql: `${column} is null` })
        return builder
      },
      in(column: string, values: unknown[]) {
        filters.push({ sql: `${column}::text in (select jsonb_array_elements_text($?::jsonb))`, value: values })
        return builder
      },
      order(column: string, opts?: { ascending?: boolean }) {
        orderBy = ` order by ${column} ${opts?.ascending === false ? 'desc' : 'asc'}`
        return builder
      },
      limit(n: number) {
        limitN = n
        return builder
      },
      maybeSingle() {
        single = true
        return builder
      },
      single() {
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
        filters.length
          ? ' where ' + filters.map((f) => (f.sql.includes('$?') ? f.sql.replace('$?', bind(f.value)) : f.sql)).join(' and ')
          : ''
      const tail = returning ? ` returning ${returning}` : ''
      try {
        let rows: unknown[]
        if (action === 'insert') {
          const keys = Object.keys(payload)
          const slots = keys.map((key) => bind(payload[key]))
          rows = (await db.query(`insert into public.${table} (${keys.join(', ')}) values (${slots.join(', ')})${tail}`, values)).rows
        } else if (action === 'update') {
          const sets = Object.keys(payload).map((key) => `${key} = ${bind(payload[key])}`)
          const clause = where()
          rows = (await db.query(`update public.${table} set ${sets.join(', ')}${clause}${tail}`, values)).rows
        } else if (action === 'delete') {
          const clause = where()
          rows = (await db.query(`delete from public.${table}${clause}${tail}`, values)).rows
        } else {
          const clause = where()
          rows = (await db.query(`select ${columns} from public.${table}${clause}${orderBy}${limitN ? ` limit ${limitN}` : ''}`, values)).rows
        }
        if (action !== 'select' && !returning) return { data: null, error: null }
        return { data: single ? rows[0] ?? null : rows, error: null }
      } catch (err) {
        return failure(err)
      }
    }

    return builder
  }

  return { rpc, from } as unknown as SupabaseClient
}

async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error
  console.error = () => {}
  try {
    return await fn()
  } finally {
    console.error = original
  }
}

type Card = { key: string; position: number; first_name: string; email: string; link_contact_id?: string }

async function seedBatch(db: PGlite, owner: string, batchKey: string, cards: Card[]) {
  await db.query(
    "insert into public.scan_batches (id, user_id, shared_event, shared_discussed, shared_met_at, total_detected) values ($1, $2, 'MEDICA 2026', 'Hall 12 demo', '2026-09-10T10:00:00Z', $3)",
    [id(batchKey), owner, cards.length]
  )
  for (const card of cards) {
    await db.query(
      'insert into public.scan_batch_items (id, batch_id, user_id, position, first_name, email, raw_ocr, confidence, link_contact_id) values ($1, $2, $3, $4, $5, $6, $7::jsonb, 0.91, $8)',
      [id(card.key), id(batchKey), owner, card.position, card.first_name, card.email, JSON.stringify({ text: card.first_name + ' card' }), card.link_contact_id ?? null]
    )
  }
  return id(batchKey)
}

const rowsOf = async <T = Record<string, unknown>>(db: PGlite, sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows
const count = async (db: PGlite, sql: string, params: unknown[] = []) =>
  Number((await db.query<{ n: number }>(sql, params)).rows[0].n)
const exists = (db: PGlite, table: string, rowId: string) =>
  count(db, `select count(*)::int as n from public.${table} where id = $1`, [rowId])

const ITEM_COLUMNS =
  'id, batch_id, user_id, position, first_name, email, raw_ocr, confidence, selected, link_to_existing, credit_consumed, created_contact_id, created_encounter_id, link_contact_id, contact_deleted_at, created_at'
const SCAN_HISTORY = ['id', 'batch_id', 'user_id', 'position', 'first_name', 'email', 'raw_ocr', 'confidence', 'selected', 'link_to_existing', 'credit_consumed', 'created_at']

const itemRow = async (db: PGlite, key: string) =>
  (await rowsOf<Record<string, unknown>>(db, `select ${ITEM_COLUMNS} from public.scan_batch_items where id = $1`, [id(key)]))[0]
const pick = (row: Record<string, unknown> | undefined, keys: string[]) =>
  Object.fromEntries(keys.map((key) => [key, row?.[key] ?? null]))
const danglingContactRefs = (db: PGlite) =>
  count(
    db,
    `select count(*)::int as n from public.scan_batch_items i
     where (i.created_contact_id is not null and not exists (select 1 from public.scanned_contacts c where c.id = i.created_contact_id))
        or (i.link_contact_id is not null and not exists (select 1 from public.scanned_contacts c where c.id = i.link_contact_id))`
  )
const danglingEncounterRefs = (db: PGlite) =>
  count(
    db,
    `select count(*)::int as n from public.scan_batch_items i
     where i.created_encounter_id is not null and not exists (select 1 from public.contact_encounters e where e.id = i.created_encounter_id)`
  )
const ledger = (db: PGlite) =>
  rowsOf(db, 'select id, user_id, delta, kind, source, source_ref, product_key, idempotency_key, metadata, created_at from public.scan_credit_ledger order by created_at, id')

async function run() {
  const deleteRoute = code('app/api/card/delete/route.ts')
  const deleteLib = code('lib/contacts/delete.ts')

  // ═══════════════════ THE BUG, ON THE SCHEMA AS IT WAS ═══════════════════

  const before = await freshDatabase(false)
  const beforeClient = supabaseOver(before)
  const oldBatch = await seedBatch(before, OWNER, 'old-batch', [{ key: 'old-card', position: 0, first_name: 'Old', email: 'old@x.co' }])
  const oldSave = await quietly(() => saveBatchContacts(beforeClient, OWNER, oldBatch))
  const oldContact = oldSave?.created[0]?.contactId as string
  const oldDelete = await quietly(() => deleteOwnedContact(beforeClient, OWNER, oldContact))
  check('R0 before the fix: deleting a Multi-Card contact is refused by Postgres with 23502', oldDelete, { ok: false, code: '23502' })
  check('R0b and the contact is still there', await exists(before, 'scanned_contacts', oldContact), 1)
  check('R0c which the API answers with a 500', /if \(!result\.ok\) \{\s*return NextResponse\.json\(\{ error: DELETE_FAILED \}, \{ status: 500 \}\)/.test(deleteRoute), true)
  let oldAccountDelete = 'deleted'
  try {
    await before.query('delete from auth.users where id = $1', [OWNER])
  } catch (err) {
    oldAccountDelete = (err as { code?: string }).code ?? 'error'
  }
  check('R1 before the fix: deleting an account that owns one fails the same way', oldAccountDelete, '23502')
  await before.close()

  // ═══════════════════ THE SCHEMA AS IT IS ═══════════════════

  const db = await freshDatabase(true)
  const client = supabaseOver(db)

  await grantScanCredits(client, { userId: OWNER, amount: 10, kind: 'grant', source: 'manual', sourceRef: null, productKey: null, idempotencyKey: 'test:grant:owner' })
  const known = (await rowsOf<{ id: string }>(db, "insert into public.scanned_contacts (user_id, name, email, source) values ($1, 'Known Person', 'k@x.co', 'business_card') returning id", [OWNER]))[0].id
  await db.query("insert into public.contact_encounters (contact_id, user_id, event) values ($1, $2, 'An earlier fair')", [known, OWNER])

  const batch1 = await seedBatch(db, OWNER, 'batch-1', [
    { key: 'card-a', position: 0, first_name: 'Anna', email: 'a@x.co' },
    { key: 'card-known', position: 1, first_name: 'Known', email: 'k@x.co', link_contact_id: known },
    { key: 'card-b', position: 2, first_name: 'Ben', email: 'b@x.co' },
  ])
  const saved = await quietly(() => saveBatchContacts(client, OWNER, batch1, 0, { ledger: { charge: true } }))
  const savedA = saved?.created.find((c) => c.itemId === id('card-a'))
  const contactA = savedA?.contactId as string
  const encounterA = savedA?.encounterId as string
  const contactB = saved?.created.find((c) => c.itemId === id('card-b'))?.contactId as string
  check('S0 setup: three cards saved and paid through the real transaction', [saved?.created.length, saved?.creditsConsumed, await getScanCreditBalance(client, OWNER)], [3, 3, 7])

  // What a contact accumulates: an activity, an opportunity, a follow-up, and a HubSpot push.
  await db.query("insert into public.crm_activities (contact_id, user_id, activity_type) values ($1, $2, 'scanned')", [contactA, OWNER])
  await db.query('insert into public.crm_opportunities (contact_id, user_id) values ($1, $2)', [contactA, OWNER])
  await db.query("insert into public.followup_sequences (contact_id, user_id, step, message_type) values ($1, $2, 1, 'email')", [contactA, OWNER])
  await db.query(
    "insert into public.crm_object_mappings (user_id, provider, local_object_type, local_object_id, remote_object_type, remote_object_id) values ($1, 'hubspot', 'contact', $2, 'contact', 'hs-101'), ($1, 'hubspot', 'encounter', $3, 'meeting', 'hs-m-201')",
    [OWNER, contactA, encounterA]
  )

  const otherBatch = await seedBatch(db, OTHER, 'batch-other', [{ key: 'card-other', position: 0, first_name: 'Olga', email: 'o@x.co' }])
  const otherContact = (await quietly(() => saveBatchContacts(client, OTHER, otherBatch)))?.created[0]?.contactId as string

  const ledgerBefore = await ledger(db)
  const batchBefore = await rowsOf(db, 'select * from public.scan_batches where id = $1', [batch1])
  const cardABefore = await itemRow(db, 'card-a')
  const cardKnownBefore = await itemRow(db, 'card-known')
  const cardBBefore = await itemRow(db, 'card-b')
  const otherCardBefore = await itemRow(db, 'card-other')
  const mappingsBefore = await rowsOf(db, 'select * from public.crm_object_mappings order by remote_object_id')

  // 3. The case that used to fail.
  const deletedA = await deleteOwnedContact(client, OWNER, contactA)
  const cardA = await itemRow(db, 'card-a')

  check('3  a contact saved through Multi-Card now deletes', [deletedA, await exists(db, 'scanned_contacts', contactA)], [{ ok: true, deleted: true }, 0])
  check('5  its batch item is still there, the scan exactly as it was', pick(cardA, SCAN_HISTORY), pick(cardABefore, SCAN_HISTORY))
  check('6  created_contact_id is cleared and no item names a missing contact', [cardA?.created_contact_id, await danglingContactRefs(db)], [null, 0])
  check('7  created_encounter_id is cleared, the meeting went with the person, and no item names a missing meeting', [cardA?.created_encounter_id, await exists(db, 'contact_encounters', encounterA), await danglingEncounterRefs(db)], [null, 0, 0])
  check('8  credit_consumed still says the card was paid for', cardA?.credit_consumed, true)
  check('8b and the item records that its person was deleted', [cardABefore?.contact_deleted_at, cardA?.contact_deleted_at !== null], [null, true])
  check('9  every credit ledger row is unchanged', await ledger(db), ledgerBefore)
  check('10 the Smart Scan balance is unchanged', await getScanCreditBalance(client, OWNER), 7)
  check('11 no refund: no reversal and no new ledger row', [await count(db, "select count(*)::int as n from public.scan_credit_ledger where kind = 'reversal'"), (await ledger(db)).length], [0, ledgerBefore.length])
  check('12 the other cards in the same batch are untouched', [await itemRow(db, 'card-known'), await itemRow(db, 'card-b')], [cardKnownBefore, cardBBefore])
  check('13 the batch itself is unchanged', await rowsOf(db, 'select * from public.scan_batches where id = $1', [batch1]), batchBefore)
  check('14 CRM mappings are kept, as they always were: no foreign key, no cleanup', await rowsOf(db, 'select * from public.crm_object_mappings order by remote_object_id'), mappingsBefore)
  check(
    '14b the relations that always cascaded still do: activity, opportunity, follow-up',
    [
      await count(db, 'select count(*)::int as n from public.crm_activities where contact_id = $1', [contactA]),
      await count(db, 'select count(*)::int as n from public.crm_opportunities where contact_id = $1', [contactA]),
      await count(db, 'select count(*)::int as n from public.followup_sequences where contact_id = $1', [contactA]),
    ],
    [0, 0, 0]
  )
  check('15 no CRM is called: the delete path imports no CRM code and makes no request', /@\/lib\/(crm|integrations)|hubspot|pipedrive|salesforce|fetch\(|axios/i.test(deleteLib + deleteRoute), false)
  check('16 nobody else is affected: the other people and their meetings are still there', [await exists(db, 'scanned_contacts', contactB), await exists(db, 'scanned_contacts', known), await exists(db, 'scanned_contacts', otherContact), await count(db, 'select count(*)::int as n from public.contact_encounters where contact_id = $1', [contactB])], [1, 1, 1, 1])

  // 4. A person already on file, met again through the batch.
  const deletedKnown = await deleteOwnedContact(client, OWNER, known)
  const cardKnown = await itemRow(db, 'card-known')
  check('4  a person already on file, met again through a batch, deletes', [deletedKnown, await exists(db, 'scanned_contacts', known)], [{ ok: true, deleted: true }, 0])
  check('4b the card that matched them keeps its history and loses only the references', [cardKnown?.created_contact_id, cardKnown?.link_contact_id, cardKnown?.created_encounter_id, cardKnown?.credit_consumed, cardKnown?.contact_deleted_at !== null, pick(cardKnown, SCAN_HISTORY)], [null, null, null, true, true, pick(cardKnownBefore, SCAN_HISTORY)])
  check('4c every meeting with them, old and new, is gone, as a contact delete always removed them', await count(db, 'select count(*)::int as n from public.contact_encounters where contact_id = $1', [known]), 0)
  check('4d still no dangling reference, and still no ledger change', [await danglingContactRefs(db), await danglingEncounterRefs(db), await ledger(db)], [0, 0, ledgerBefore])

  // 1–2. Contacts with no batch behind them.
  const manual = (await rowsOf<{ id: string }>(db, "insert into public.scanned_contacts (user_id, name, source) values ($1, 'Typed In', 'manual') returning id", [OWNER]))[0].id
  await db.query("insert into public.contact_encounters (contact_id, user_id, event) values ($1, $2, 'Coffee')", [manual, OWNER])
  check('1  an ordinary contact deletes, with its meetings', [await deleteOwnedContact(client, OWNER, manual), await exists(db, 'scanned_contacts', manual), await count(db, 'select count(*)::int as n from public.contact_encounters where contact_id = $1', [manual])], [{ ok: true, deleted: true }, 0, 0])

  const single = (await rowsOf<{ id: string }>(db, "insert into public.scanned_contacts (user_id, name, source, capture_origin, capture_kind, scan_status) values ($1, 'Single Scan', 'business_card', 'camera', 'business_card', 'basic') returning id", [OWNER]))[0].id
  await db.query("insert into public.contact_encounters (contact_id, user_id, event, capture_origin, capture_kind) values ($1, $2, 'MEDICA 2026', 'camera', 'business_card')", [single, OWNER])
  await db.query("insert into public.crm_activities (contact_id, user_id, activity_type) values ($1, $2, 'scanned')", [single, OWNER])
  check(
    '2  a Single Scan contact deletes, with its meeting and activity',
    [await deleteOwnedContact(client, OWNER, single), await exists(db, 'scanned_contacts', single), await count(db, 'select count(*)::int as n from public.contact_encounters where contact_id = $1', [single]), await count(db, 'select count(*)::int as n from public.crm_activities where contact_id = $1', [single])],
    [{ ok: true, deleted: true }, 0, 0, 0]
  )

  // 17. Owner isolation.
  check('17 another owner naming this contact deletes nothing', [await deleteOwnedContact(client, OTHER, contactB), await exists(db, 'scanned_contacts', contactB), await itemRow(db, 'card-b')], [{ ok: true, deleted: false }, 1, cardBBefore])
  check('17b the route takes the owner from the verified session and nothing else from the body', deleteRoute.includes('auth.getUser()') && deleteRoute.includes('deleteOwnedContact(createServiceClient(), user.id, contactId)') && !/body\.(userId|ownerId|user_id|owner)/.test(deleteRoute), true)
  check('17c and the delete itself is scoped to id and owner together', /\.eq\('id', contactId\)\s*\.eq\('user_id', ownerId\)/.test(deleteLib), true)

  async function asSignedIn<T>(sub: string, fn: () => Promise<T>): Promise<T> {
    await db.exec('set role authenticated')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [sub])
    try {
      return await fn()
    } finally {
      await db.exec('reset role')
    }
  }
  const directCross = await asSignedIn(OTHER, () => db.query('delete from public.scanned_contacts where id = $1', [contactB]))
  check('17d signed in as another owner, a direct delete of this contact removes nothing', [directCross.affectedRows, await exists(db, 'scanned_contacts', contactB)], [0, 1])
  const directOwn = await asSignedIn(OWNER, () => db.query('delete from public.scanned_contacts where id = $1', [contactB]))
  const cardB = await itemRow(db, 'card-b')
  check('17e signed in as the owner, deleting their own Multi-Card contact directly works and releases the card', [directOwn.affectedRows, cardB?.created_contact_id, cardB?.created_encounter_id, cardB?.credit_consumed, cardB?.contact_deleted_at !== null], [1, null, null, true, true])
  check("17f and never reaches another owner's batch", await itemRow(db, 'card-other'), otherCardBefore)

  // 18. Deleting twice.
  check('18 deleting it again succeeds with nothing to do', await deleteOwnedContact(client, OWNER, contactA), { ok: true, deleted: false })
  check('18b and the API answers that with success, as it always has', !deleteRoute.includes('result.deleted') && deleteRoute.includes('return NextResponse.json({ success: true })'), true)
  check('18c a failure never returns the database message', !deleteRoute.includes('err.message') && !deleteRoute.includes('error.message'), true)

  // 19. Founder.
  const founderBatch = await seedBatch(db, FOUNDER, 'batch-founder', [{ key: 'card-founder', position: 0, first_name: 'Guest', email: 'g@x.co' }])
  const founderContact = (await quietly(() => saveBatchContacts(client, FOUNDER, founderBatch, 0, { ledger: { charge: false } })))?.created[0]?.contactId as string
  const founderDelete = await deleteOwnedContact(client, FOUNDER, founderContact)
  const cardFounder = await itemRow(db, 'card-founder')
  check('19 the founder deletes a Multi-Card contact the same way, with no ledger row before or after', [founderDelete, cardFounder?.created_contact_id, cardFounder?.contact_deleted_at !== null, await count(db, 'select count(*)::int as n from public.scan_credit_ledger where user_id = $1', [FOUNDER])], [{ ok: true, deleted: true }, null, true, 0])

  // 20. Ledger off: the counter-era save path.
  await db.query('update public.abc_profiles set scans_used = 3 where id = $1', [LEGACY])
  const legacyBatch = await seedBatch(db, LEGACY, 'batch-legacy', [
    { key: 'card-legacy', position: 0, first_name: 'Lena', email: 'l@x.co' },
    { key: 'card-legacy-2', position: 1, first_name: 'Lars', email: 'l2@x.co' },
  ])
  const legacySave = await quietly(() => saveBatchContacts(client, LEGACY, legacyBatch))
  const legacyContact = legacySave?.created.find((c) => c.itemId === id('card-legacy'))?.contactId as string
  const legacyDelete = await deleteOwnedContact(client, LEGACY, legacyContact)
  const cardLegacy = await itemRow(db, 'card-legacy')
  check(
    '20 ledger off: a counter-era Multi-Card contact deletes, the card keeps its paid mark, the counter does not move',
    [legacyDelete, cardLegacy?.created_contact_id, cardLegacy?.credit_consumed, cardLegacy?.contact_deleted_at !== null, await count(db, 'select scans_used as n from public.abc_profiles where id = $1', [LEGACY]), await count(db, 'select count(*)::int as n from public.scan_credit_ledger where user_id = $1', [LEGACY])],
    [{ ok: true, deleted: true }, null, true, true, 3, 0]
  )
  const legacyAgain = await quietly(() => saveBatchContacts(client, LEGACY, legacyBatch))
  check('20b ledger off: saving the batch again does not bring the deleted person back', [legacyAgain?.created.length, legacyAgain?.failed.length, await count(db, 'select count(*)::int as n from public.scanned_contacts where user_id = $1', [LEGACY]), (await itemRow(db, 'card-legacy'))?.created_contact_id], [0, 0, 1, null])
  check('20c and the batch still counts both cards it kept', await count(db, 'select total_saved as n from public.scan_batches where id = $1', [legacyBatch]), 2)

  // 21. Ledger on: the transactional save path.
  const againSave = await quietly(() => saveBatchContacts(client, OWNER, batch1, 0, { ledger: { charge: true } }))
  check('21 ledger on: saving the batch again brings nobody back and debits nothing', [againSave?.created.length, againSave?.failed.length, againSave?.creditsConsumed, await getScanCreditBalance(client, OWNER), await ledger(db)], [0, 0, 0, 7, ledgerBefore])
  const replay = (
    await rowsOf<{ outcome: string; charged: boolean }>(
      db,
      'select outcome, charged from public.accept_scan_batch_item($1, $2, true, $3::jsonb, $4::jsonb)',
      [OWNER, id('card-a'), JSON.stringify({ name: 'Anna' }), JSON.stringify({ event: 'MEDICA 2026' })]
    )
  )[0]
  check('21b the save transaction itself refuses that card, uncharged', [replay?.outcome, replay?.charged, await getScanCreditBalance(client, OWNER), await exists(db, 'scanned_contacts', contactA)], ['contact_deleted', false, 7, 0])
  check('21c the batch still counts every card it kept', await count(db, 'select total_saved as n from public.scan_batches where id = $1', [batch1]), 3)

  // Deleting a whole account.
  await db.query('delete from auth.users where id = $1', [OTHER])
  check(
    'X1 deleting an account that owns Multi-Card contacts completes and leaves nothing of theirs',
    [
      await count(db, 'select count(*)::int as n from public.scanned_contacts where user_id = $1', [OTHER]),
      await count(db, 'select count(*)::int as n from public.scan_batch_items where user_id = $1', [OTHER]),
      await count(db, 'select count(*)::int as n from public.scan_batches where user_id = $1', [OTHER]),
      await exists(db, 'scanned_contacts', contactB),
    ],
    [0, 0, 0, 0]
  )

  // ═══════════════════ THE MIGRATION ═══════════════════

  const fix = read(FIX_MIGRATION)
  const outside = fix.replace(/\$\$[\s\S]*?\$\$/g, '').replace(/--.*$/gm, '')
  check('M1 the only DROP is the guard for its own trigger', (outside.match(/\bdrop\s+[^;]+/gi) ?? []).map(flat), ['drop trigger if exists scan_batch_items_release_deleted_contact on public.scanned_contacts'])
  check('M2 no row is deleted, truncated, updated or inserted by the migration', /\b(delete\s+from|truncate|update\s+public\.|insert\s+into)\b/i.test(outside), false)
  check('M3 the only column change is one new nullable column', (outside.match(/\balter\s+table[^;]+/gi) ?? []).map(flat), ['alter table public.scan_batch_items add column if not exists contact_deleted_at timestamptz'])
  check('M4 the only constraint added is the encounter key, inside an existence guard', flat(fix).includes('add constraint scan_batch_items_created_encounter_fkey foreign key (created_encounter_id) references public.contact_encounters (id) on delete set null;'), true)
  const keys = await rowsOf<{ conname: string; def: string }>(db, "select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.scan_batch_items'::regclass and contype = 'f' order by conname")
  check(
    'M5 the existing owner-composite keys are exactly as they were',
    keys.filter((k) => k.conname !== 'scan_batch_items_created_encounter_fkey').map((k) => [k.conname, k.def]),
    [
      ['scan_batch_items_batch_owner_fkey', 'FOREIGN KEY (batch_id, user_id) REFERENCES scan_batches(id, user_id) ON UPDATE CASCADE ON DELETE CASCADE'],
      ['scan_batch_items_contact_owner_fkey', 'FOREIGN KEY (created_contact_id, user_id) REFERENCES scanned_contacts(id, user_id) ON UPDATE CASCADE ON DELETE SET NULL'],
      ['scan_batch_items_link_owner_fkey', 'FOREIGN KEY (link_contact_id, user_id) REFERENCES scanned_contacts(id, user_id) ON UPDATE CASCADE ON DELETE SET NULL'],
    ]
  )
  const column = (await rowsOf<{ is_nullable: string; column_default: string | null }>(db, "select is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'scan_batch_items' and column_name = 'contact_deleted_at'"))[0]
  check('M6 the new column is nullable with no default, so existing rows are not rewritten', [column?.is_nullable, column?.column_default], ['YES', null])
  const fn = (await rowsOf<{ prosecdef: boolean; proconfig: string[] | null }>(db, "select prosecdef, proconfig from pg_proc where proname = 'scan_batch_items_release_deleted_contact'"))[0]
  check('M7 the trigger function runs as definer with an empty search path', [fn?.prosecdef, fn?.proconfig], [true, ['search_path=""']])
  let reapplied = true
  try {
    await db.exec(fix)
  } catch {
    reapplied = false
  }
  check('M8 the migration re-applies cleanly', reapplied, true)
  check('M9 it sorts before the unapplied ledger migration that reads its column', FIX_MIGRATION < LEDGER_MIGRATION, true)

  await db.close()

  const total = passed + failures.length
  if (failures.length) {
    console.log(`\nContact delete: ${passed}/${total} PASS, ${failures.length} FAILED\n`)
    for (const failure of failures) console.log('  FAIL ' + failure)
    process.exit(1)
  }
  console.log(`\nContact delete: ${passed}/${total} PASS`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
