/**
 * Billing and Smart Scan credit ledger regression suite.
 *
 * Run with `npm run test:billing` from the repository root.
 *
 * The ledger is tested against real Postgres. PGlite runs the actual migration
 * in-process — the plpgsql functions, the constraints, the triggers, the row
 * security and the role privileges — so "a duplicate grant writes nothing" and
 * "an authenticated user cannot mint credits" are proved by the database, not
 * asserted about a fake of it. Supabase's roles and `auth.uid()` are recreated
 * minimally for the purpose.
 *
 * Stripe is never called over the network. Signature verification uses the real
 * SDK's own `constructEvent` against payloads signed with the SDK's own test
 * helper; everything that would reach Stripe's API is a deterministic mock that
 * records its calls.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  PRODUCT_KEYS,
  PRODUCTS,
  catalogEnvNames,
  productForPriceId,
  resolveProduct,
} from '@/lib/billing/catalog'
import { createCheckoutSession } from '@/lib/billing/checkout'
import { ensureStripeCustomer, profileCustomerStore } from '@/lib/billing/customer'
import {
  consumeScanCredit,
  ensureLegacyOpeningBalance,
  getScanCreditBalance,
  grantScanCredits,
  ledgerEnabled,
  ledgerKeys,
  singleScanDigest,
} from '@/lib/billing/ledger'
import { readBillingStatus } from '@/lib/billing/status'
import { readStripeConfig } from '@/lib/billing/stripe'
import { handleStripeWebhook, supabaseWebhookStore } from '@/lib/billing/webhook'
import { saveBatchContacts } from '@/lib/scan/batch-store'
import {
  chargeAcceptedCards,
  resolveScanEntitlement,
  type AuthIdentity,
} from '@/lib/scan/entitlement'

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
const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

const MIGRATION_FILE = 'supabase/migrations/20260912120000_smart_scan_credit_ledger.sql'

/*
  Test fixtures only. These quantities exist so a configured product can be
  exercised; they are not product decisions, appear nowhere outside this file,
  and test N1 proves the application itself contains none.
*/
const FIXTURE_CREDITS = '4'
const FIXTURE_PASS_DAYS = '5'

const PRICE = {
  pack8: 'price_TestPack8xxxxxxxx',
  pack17: 'price_TestPack17xxxxxxx',
  proEvent: 'price_TestProEventxxxxx',
  proMonthly: 'price_TestProMonthlyxxx',
}

const ENV: Record<string, string> = {
  STRIPE_SECRET_KEY: 'sk_test_' + 'a'.repeat(24),
  STRIPE_WEBHOOK_SECRET: 'whsec_' + 'b'.repeat(32),
  NEXT_PUBLIC_APP_URL: 'https://www.abccard.io',
  STRIPE_PRICE_SCAN_PACK_8: PRICE.pack8,
  SCAN_PACK_8_CREDITS: FIXTURE_CREDITS,
  STRIPE_PRICE_PRO_EVENT: PRICE.proEvent,
  PRO_EVENT_PASS_DAYS: FIXTURE_PASS_DAYS,
  STRIPE_PRICE_PRO_MONTHLY: PRICE.proMonthly,
  SMART_SCAN_LEDGER: 'on',
}

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'
const FOUNDER = '33333333-3333-4333-8333-333333333333'
const LEGACY = '44444444-4444-4444-8444-444444444444'
const BUYER = '55555555-5555-4555-8555-555555555555'
const SAVER = '66666666-6666-4666-8666-666666666666'
const PARTIAL = '77777777-7777-4777-8777-777777777777'
const BROKE = '88888888-8888-4888-8888-888888888888'

const confirmed = '2026-01-01T00:00:00.000Z'
const identity = (id: string, email = `${id.slice(0, 4)}@example.com`): AuthIdentity => ({
  id,
  email,
  email_confirmed_at: confirmed,
})
const founderIdentity: AuthIdentity = { id: FOUNDER, email: 'im.expoguy@gmail.com', email_confirmed_at: confirmed }

// ─────────────────────────── DATABASE ───────────────────────────

async function freshDatabase(): Promise<PGlite> {
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

    -- The slice of abc_profiles the billing layer reads and writes.
    create table public.abc_profiles (
      id uuid primary key,
      plan text default 'free',
      email text,
      google_email text,
      scans_used integer default 0,
      stripe_customer_id text,
      stripe_subscription_id text,
      plan_activated_at timestamptz
    );

    -- The slice of scanned_contacts the batch save writes and the encounters
    -- migration reads. Encounters and batches themselves are the real migrations.
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
    grant select, insert, update, delete on public.scanned_contacts to service_role;
  `)
  // The tables a Multi-Card save writes, from their real migrations, in order.
  await db.exec(read('supabase/migrations/20260823120000_contact_encounters.sql'))
  await db.exec(read('supabase/migrations/20260910120000_multi_card_scan_batches.sql'))
  await db.exec(read('supabase/migrations/20260911120000_contact_delete_batch_history.sql'))
  await db.exec(read(MIGRATION_FILE))
  for (const id of [USER_A, USER_B, FOUNDER, LEGACY, BUYER, SAVER, PARTIAL, BROKE]) {
    await db.query('insert into auth.users (id) values ($1)', [id])
    await db.query("insert into public.abc_profiles (id, plan, scans_used) values ($1, 'free', 0)", [id])
  }
  return db
}

/**
 * Just enough of the Supabase client for the billing layer, over PGlite.
 *
 * Runs as the database owner, which — like the service role — is not subject to
 * row security. Permission tests switch role explicitly instead.
 */
function supabaseOver(db: PGlite): SupabaseClient {
  const scalarFunctions = new Set(['scan_credit_balance', 'claim_stripe_webhook_event', 'apply_billing_entitlement'])

  function placeholder(value: unknown, index: number): string {
    return value !== null && typeof value === 'object' ? `$${index}::jsonb` : `$${index}`
  }
  function param(value: unknown): unknown {
    return value !== null && typeof value === 'object' ? JSON.stringify(value) : value
  }

  async function rpc(name: string, params: Record<string, unknown>) {
    const keys = Object.keys(params)
    const args = keys.map((key, i) => `${key} => ${placeholder(params[key], i + 1)}`).join(', ')
    const values = keys.map((key) => param(params[key]))
    try {
      if (scalarFunctions.has(name)) {
        const result = await db.query<{ result: unknown }>(`select public.${name}(${args}) as result`, values)
        return { data: result.rows[0]?.result ?? null, error: null }
      }
      const result = await db.query(`select * from public.${name}(${args})`, values)
      return { data: result.rows, error: null }
    } catch (err) {
      return { data: null, error: { code: (err as { code?: string }).code ?? 'unknown', message: String(err) } }
    }
  }

  function from(table: string) {
    const filters: { sql: string; value?: unknown }[] = []
    let columns = '*'
    let updatePayload: Record<string, unknown> | null = null
    let orderBy = ''
    let limitN: number | null = null
    let single = false

    const builder = {
      select(cols: string) {
        columns = cols
        return builder
      },
      update(payload: Record<string, unknown>) {
        updatePayload = payload
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
        filters.push({ sql: `${column}::text in (select jsonb_array_elements_text($?::jsonb))`, value: JSON.stringify(values) })
        return builder
      },
      order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
        orderBy = ` order by ${column} ${opts?.ascending === false ? 'desc' : 'asc'}${
          opts?.nullsFirst === false ? ' nulls last' : ''
        }`
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
      then(resolve: (value: unknown) => void, reject: (err: unknown) => void) {
        run().then(resolve, reject)
      },
    }

    async function run() {
      // Placeholders are numbered in the order they appear in the statement.
      const values: unknown[] = []
      const bind = (value: unknown) => {
        values.push(value)
        return `$${values.length}`
      }
      const whereClause = () =>
        filters.length
          ? ' where ' + filters.map((f) => (f.sql.includes('$?') ? f.sql.replace('$?', bind(f.value)) : f.sql)).join(' and ')
          : ''
      try {
        if (updatePayload) {
          const sets = Object.keys(updatePayload).map((key) => `${key} = ${bind(updatePayload![key])}`)
          const where = whereClause()
          await db.query(`update public.${table} set ${sets.join(', ')}${where}`, values)
          return { data: null, error: null }
        }
        const where = whereClause()
        const result = await db.query(
          `select ${columns} from public.${table}${where}${orderBy}${limitN ? ` limit ${limitN}` : ''}`,
          values
        )
        return { data: single ? result.rows[0] ?? null : result.rows, error: null }
      } catch (err) {
        return { data: null, error: { code: (err as { code?: string }).code ?? 'unknown', message: String(err) } }
      }
    }

    return builder
  }

  return { rpc, from } as unknown as SupabaseClient
}

async function ledgerRows(db: PGlite, userId: string) {
  const result = await db.query<{ kind: string; delta: number; source: string; idempotency_key: string }>(
    'select kind, delta, source, idempotency_key from public.scan_credit_ledger where user_id = $1 order by created_at, id',
    [userId]
  )
  return result.rows
}

async function asRole<T>(db: PGlite, role: string, sub: string | null, fn: () => Promise<T>): Promise<T | 'denied'> {
  await db.exec(`set role ${role}`)
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [sub ?? ''])
  try {
    return await fn()
  } catch (err) {
    return /permission denied|42501/i.test(String(err) + ((err as { code?: string }).code ?? '')) ? 'denied' : Promise.reject(err)
  } finally {
    await db.exec('reset role')
  }
}

// ─────────────────────────── STRIPE ───────────────────────────

const realStripe = new Stripe(ENV.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' })

function stripeMock(options: { lineItemPrice?: string; subscription?: Partial<Stripe.Subscription> } = {}) {
  const calls = {
    customersCreate: [] as { params: unknown; opts: unknown }[],
    sessionsCreate: [] as Stripe.Checkout.SessionCreateParams[],
    listLineItems: [] as string[],
    subscriptionsRetrieve: [] as string[],
  }
  let customerSeq = 0

  const client = {
    webhooks: realStripe.webhooks,
    customers: {
      async create(params: unknown, opts: unknown) {
        calls.customersCreate.push({ params, opts })
        customerSeq += 1
        return { id: `cus_test_${customerSeq}` }
      },
    },
    checkout: {
      sessions: {
        async create(params: Stripe.Checkout.SessionCreateParams) {
          calls.sessionsCreate.push(params)
          return { id: `cs_test_${calls.sessionsCreate.length}`, url: `https://checkout.stripe.com/c/pay/cs_test_${calls.sessionsCreate.length}` }
        },
        async listLineItems(id: string) {
          calls.listLineItems.push(id)
          return { data: [{ price: { id: options.lineItemPrice ?? PRICE.pack8 }, quantity: 1 }] }
        },
      },
    },
    subscriptions: {
      async retrieve(id: string) {
        calls.subscriptionsRetrieve.push(id)
        return {
          id,
          status: 'active',
          current_period_start: 1_788_000_000,
          current_period_end: 1_790_600_000,
          cancel_at_period_end: false,
          metadata: {},
          ...options.subscription,
        }
      },
    },
  }

  return { calls, client: client as unknown as Stripe }
}

function signedEvent(event: Record<string, unknown>, secret = ENV.STRIPE_WEBHOOK_SECRET) {
  const payload = JSON.stringify(event)
  const signature = realStripe.webhooks.generateTestHeaderString({ payload, secret })
  return { payload, signature }
}

function stripeEvent(id: string, type: string, object: Record<string, unknown>, created = 1_788_000_100) {
  return {
    id,
    object: 'event',
    type,
    created,
    livemode: false,
    api_version: '2025-02-24.acacia',
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object },
  }
}

function paidPackSession(sessionId: string, userId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: sessionId,
    object: 'checkout.session',
    mode: 'payment',
    payment_status: 'paid',
    status: 'complete',
    created: 1_788_000_000,
    client_reference_id: userId,
    customer: 'cus_test_1',
    metadata: {
      abc_user_id: userId,
      product_key: 'scan_pack_8',
      catalog_price_id: PRICE.pack8,
      credits: FIXTURE_CREDITS,
    },
    ...overrides,
  }
}

async function run() {
  const db = await freshDatabase()
  const client = supabaseOver(db)

  // ═══════════════════ LEDGER (real Postgres) ═══════════════════

  // 1–3. Grant, debit, derived balance.
  const g1 = await grantScanCredits(client, { userId: USER_A, amount: 5, kind: 'grant', source: 'manual', sourceRef: null, productKey: null, idempotencyKey: 'test:grant:a1' })
  check('1  a grant adds credits', [g1.granted, g1.balance], [true, 5])
  const c1 = await consumeScanCredit(client, { userId: USER_A, source: 'batch_item', sourceRef: 'item-1', idempotencyKey: ledgerKeys.batchItem('item-1') })
  check('2  a consumption debits exactly one', [c1.outcome, c1.balance], ['consumed', 4])
  await grantScanCredits(client, { userId: USER_A, amount: 3, kind: 'grant', source: 'manual', sourceRef: null, productKey: null, idempotencyKey: 'test:grant:a2' })
  check('3  the balance is the sum of the rows', await getScanCreditBalance(client, USER_A), 7)
  check('3b and every movement is a traceable row', (await ledgerRows(db, USER_A)).map((r) => [r.kind, r.delta]), [['grant', 5], ['consume', -1], ['grant', 3]])

  // 4. Credits do not expire.
  await db.query(
    "insert into public.scan_credit_ledger (user_id, delta, kind, source, idempotency_key, created_at) values ($1, 2, 'grant', 'manual', 'test:ancient', now() - interval '20 years')",
    [USER_B]
  )
  check('4  a grant from twenty years ago still counts', await getScanCreditBalance(client, USER_B), 2)
  // SQL only: the ledger's own comments say, in words, that nothing expires.
  const ledgerSql = read(MIGRATION_FILE).split('-- 3. Pro billing state')[0].replace(/--.*$/gm, '')
  check('4b the ledger has no expiry concept at all', /expir|valid_until|expires_at/i.test(ledgerSql), false)

  // 5. Negative balance prevented.
  const empty = await consumeScanCredit(client, { userId: LEGACY, source: 'single_scan', sourceRef: 'x', idempotencyKey: 'test:consume:empty' })
  check('5  spending with nothing left is refused', empty.outcome, 'insufficient')
  let negativeBlocked = false
  try {
    await db.query("insert into public.scan_credit_ledger (user_id, delta, kind, source, idempotency_key) values ($1, -1, 'reversal', 'manual', 'test:reverse:neg')", [LEGACY])
  } catch {
    negativeBlocked = true
  }
  check('5b and the database refuses any row that would go below zero', negativeBlocked, true)
  check('5c the balance stays at zero', await getScanCreditBalance(client, LEGACY), 0)

  // 6–7. Idempotency.
  const dupGrant = await grantScanCredits(client, { userId: USER_A, amount: 3, kind: 'grant', source: 'manual', sourceRef: null, productKey: null, idempotencyKey: 'test:grant:a2' })
  check('6  a repeated grant writes nothing', [dupGrant.granted, dupGrant.balance], [false, 7])
  const dupConsume = await consumeScanCredit(client, { userId: USER_A, source: 'batch_item', sourceRef: 'item-1', idempotencyKey: ledgerKeys.batchItem('item-1') })
  check('7  a repeated consumption charges nothing', [dupConsume.outcome, dupConsume.balance], ['already_consumed', 7])

  // 8–9. Batch items.
  check('8  the same batch item cannot consume twice', (await ledgerRows(db, USER_A)).filter((r) => r.idempotency_key === ledgerKeys.batchItem('item-1')).length, 1)
  await consumeScanCredit(client, { userId: USER_A, source: 'batch_item', sourceRef: 'item-2', idempotencyKey: ledgerKeys.batchItem('item-2') })
  await consumeScanCredit(client, { userId: USER_A, source: 'batch_item', sourceRef: 'item-3', idempotencyKey: ledgerKeys.batchItem('item-3') })
  check('9  two distinct accepted items consume two credits', await getScanCreditBalance(client, USER_A), 5)

  // The function refuses with 23505; the ledger module reports that as an error outcome.
  let foreignKey = 'ok'
  try {
    foreignKey = (await quietly(() => consumeScanCredit(client, { userId: USER_B, source: 'batch_item', sourceRef: 'item-1', idempotencyKey: ledgerKeys.batchItem('item-1') }))).outcome
  } catch {
    foreignKey = 'error'
  }
  check('9b a key spent by one owner can never be reused by another', foreignKey, 'error')
  check('9e and the other owner is charged nothing for trying', await getScanCreditBalance(client, USER_B), 2)

  let immutable = false
  try {
    await db.query('update public.scan_credit_ledger set delta = 100 where user_id = $1', [USER_A])
  } catch {
    immutable = true
  }
  check('9c ledger rows are immutable even to the table owner', immutable, true)

  // ═══════════════════ MULTI-CARD: SAVED AND PAID IN ONE TRANSACTION ═══════════════════
  //
  // The real batch save in ledger mode — saveBatchContacts → accept_scan_batch_item — over
  // the real migrations for contacts, encounters, batches and the ledger. The balance handed
  // to the save is 0 every time: the database decides whether a card is paid for, not a
  // number read before the loop.
  process.env.SMART_SCAN_LEDGER = 'on'
  // No real Supabase: the CRM side effect after a save must fail here, never reach a project.
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY

  const ids = new Map<string, string>()
  const id = (label: string) => {
    if (!ids.has(label)) ids.set(label, '00000000-0000-4000-8000-' + String(ids.size + 1).padStart(12, '0'))
    return ids.get(label) as string
  }
  type SeedItem = {
    key: string
    position: number
    first_name?: string
    email?: string
    selected?: boolean
    link_contact_id?: string
    credit_consumed?: boolean
    created_contact_id?: string
  }
  async function seedBatch(owner: string, batchKey: string, cards: SeedItem[], discussed: string | null = null) {
    await db.query(
      "insert into public.scan_batches (id, user_id, shared_event, shared_discussed, shared_met_at, total_detected) values ($1, $2, 'MEDICA 2026', $3, '2026-09-10T10:00:00Z', $4)",
      [id(batchKey), owner, discussed, cards.length]
    )
    for (const card of cards) {
      await db.query(
        'insert into public.scan_batch_items (id, batch_id, user_id, position, first_name, email, selected, link_contact_id, credit_consumed, created_contact_id) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [id(card.key), id(batchKey), owner, card.position, card.first_name ?? null, card.email ?? null, card.selected ?? true, card.link_contact_id ?? null, card.credit_consumed ?? false, card.created_contact_id ?? null]
      )
    }
    return id(batchKey)
  }
  const count = async (sql: string, params: unknown[]) => Number((await db.query<{ n: number }>(sql, params)).rows[0].n)
  const debits = (key: string) => count('select count(*)::int as n from public.scan_credit_ledger where idempotency_key = $1', [ledgerKeys.batchItem(id(key))])
  const contactsOfItem = (key: string) => count('select count(*)::int as n from public.scanned_contacts where scan_batch_item_id = $1', [id(key)])
  const peopleOf = (owner: string) => count('select count(*)::int as n from public.scanned_contacts where user_id = $1', [owner])
  const meetingsOf = (owner: string) => count('select count(*)::int as n from public.contact_encounters where user_id = $1', [owner])
  const meetingsWith = (contactId: string | null) => count('select count(*)::int as n from public.contact_encounters where contact_id = $1', [contactId])
  const itemRow = async (key: string) =>
    (
      await db.query<{ created_contact_id: string | null; created_encounter_id: string | null; credit_consumed: boolean }>(
        'select created_contact_id, created_encounter_id, credit_consumed from public.scan_batch_items where id = $1',
        [id(key)]
      )
    ).rows[0]
  const untouched = async (key: string) => {
    const row = await itemRow(key)
    return (
      row.created_contact_id === null &&
      row.created_encounter_id === null &&
      row.credit_consumed === false &&
      (await contactsOfItem(key)) === 0 &&
      (await debits(key)) === 0
    )
  }
  const ledgerSave = (owner: string, batchId: string, charge = true, over: SupabaseClient = client) =>
    quietly(() => saveBatchContacts(over, owner, batchId, 0, { ledger: { charge } }))
  const acceptDirect = (owner: string, key: string, charge = true) =>
    db
      .query<{ outcome: string; charged: boolean }>(
        'select outcome, charged from public.accept_scan_batch_item($1, $2, $3, $4::jsonb, $5::jsonb)',
        [owner, id(key), charge, JSON.stringify({ name: 'Direct', first_name: 'Direct' }), JSON.stringify({ event: 'MEDICA 2026', capture_origin: 'camera', capture_kind: 'business_card' })]
      )
      .then((result) => result.rows[0])
  const grant = (owner: string, amount: number, key: string) =>
    grantScanCredits(client, { userId: owner, amount, kind: 'grant', source: 'manual', sourceRef: null, productKey: null, idempotencyKey: key })
  const positionsOf = (entries: { itemId: string }[] | undefined, cards: SeedItem[]) =>
    (entries ?? []).map((entry) => cards.findIndex((card) => id(card.key) === entry.itemId))

  // Failure injection for the crash tests. Inert unless a test switches it on.
  await db.exec(`
    create function public.test_inject_failure() returns trigger language plpgsql as $f$
    begin
      if tg_table_name = 'contact_encounters' then
        if new.discussed = 'FAIL_MEETING_WRITE' then
          raise exception 'simulated failure writing the meeting';
        end if;
      elsif current_setting('test.fail_item_update', true) = 'on' then
        raise exception 'simulated crash at the last write';
      end if;
      return new;
    end
    $f$;
    create trigger test_inject_failure before insert on public.contact_encounters
      for each row execute function public.test_inject_failure();
    create trigger test_inject_failure before update on public.scan_batch_items
      for each row execute function public.test_inject_failure();
  `)

  // One batch: a new person, a person already on file, a removed card, an unusable card.
  await grant(SAVER, 10, 'test:grant:saver')
  const known = (await db.query<{ id: string }>("insert into public.scanned_contacts (user_id, name, first_name, email) values ($1, 'Known Person', 'Known', 'k@x.co') returning id", [SAVER])).rows[0].id
  const firstCards: SeedItem[] = [
    { key: 'new-person', position: 0, first_name: 'New', email: 'n@x.co' },
    { key: 'known-person', position: 1, first_name: 'Known', email: 'k@x.co', link_contact_id: known },
    { key: 'removed-card', position: 2, first_name: 'Removed', email: 'r@x.co', selected: false },
    { key: 'unusable-card', position: 3 },
  ]
  const batch1 = await seedBatch(SAVER, 'batch-1', firstCards)
  const saved1 = await ledgerSave(SAVER, batch1)
  const newRow = await itemRow('new-person')
  const knownRow = await itemRow('known-person')

  check('A1 an accepted card is saved and debited once, in the same commit', [Boolean(newRow.created_contact_id && newRow.created_encounter_id), newRow.credit_consumed, await debits('new-person')], [true, true, 1])
  check('A1b under the canonical key batch_item:<scan_batch_items.id>', (await db.query<{ k: string }>("select idempotency_key as k from public.scan_credit_ledger where source = 'batch_item' and source_ref = $1", [id('new-person')])).rows.map((r) => r.k), [ledgerKeys.batchItem(id('new-person'))])
  check('A2 an existing person gets a new meeting and one debit — the same person, not a copy', [knownRow.created_contact_id === known, await meetingsWith(known), await debits('known-person')], [true, 1, 1])
  check('A2b no second person was created for them', [await peopleOf(SAVER), saved1?.linkedContacts, saved1?.newContacts], [2, 1, 1])
  check('A3 a new person is one person, one meeting, one debit', [await contactsOfItem('new-person'), await meetingsWith(newRow.created_contact_id), await debits('new-person')], [1, 1, 1])
  check('A4 a removed card is neither saved nor debited', [await untouched('removed-card'), saved1?.failed.some((f) => f.itemId === id('removed-card'))], [true, false])
  check('A5 a card that cannot be saved is not debited', [await untouched('unusable-card'), positionsOf(saved1?.failed, firstCards)], [true, [3]])
  check('A15 two accepted cards, two debits', [saved1?.creditsConsumed, positionsOf(saved1?.paidItemIds.map((itemId) => ({ itemId })), firstCards), await getScanCreditBalance(client, SAVER)], [2, [0, 1], 8])
  check('10 a removed card consumes zero', await debits('removed-card'), 0)
  check('11 a failed card consumes zero', await debits('unusable-card'), 0)
  check('12 an existing person with a new encounter consumes one', await debits('known-person'), 1)
  check('13 a new person with an encounter consumes one', await debits('new-person'), 1)

  // Pressing Save again on the same batch.
  const saved1Again = await ledgerSave(SAVER, batch1)
  check('A9 pressing Save again debits nothing more', [saved1Again?.creditsConsumed, await debits('new-person'), await debits('known-person'), await getScanCreditBalance(client, SAVER)], [0, 1, 1, 8])
  check('A9b and duplicates nobody', [await peopleOf(SAVER), await meetingsOf(SAVER)], [2, 2])
  check('15 a repeated successful save pays for nothing new', saved1Again?.paidItemIds, [])

  // Crashes and failures before COMMIT.
  const crashBatch = await seedBatch(SAVER, 'batch-crash', [{ key: 'crash-card', position: 0, first_name: 'Crash', email: 'c@x.co' }])
  await db.exec('begin')
  const inFlight = await acceptDirect(SAVER, 'crash-card')
  await db.exec('rollback') // the process died before COMMIT
  check('A7 a save interrupted before commit leaves no person, meeting, debit or finished item', [inFlight.outcome, await untouched('crash-card'), await peopleOf(SAVER), await getScanCreditBalance(client, SAVER)], ['saved', true, 2, 8])

  await db.exec("set test.fail_item_update = 'on'")
  const lastWrite = await ledgerSave(SAVER, crashBatch)
  await db.exec("set test.fail_item_update = 'off'")
  check('A7b a failure at the very last write undoes the person, the meeting and the debit before it', [lastWrite?.created.length, lastWrite?.failed.map((f) => f.reason), await untouched('crash-card'), await peopleOf(SAVER), await meetingsOf(SAVER), await getScanCreditBalance(client, SAVER)], [0, ['Could not save this contact.'], true, 2, 2, 8])

  const meetingBatch = await seedBatch(SAVER, 'batch-meeting', [{ key: 'meeting-fails', position: 0, first_name: 'Meet', email: 'm@x.co' }], 'FAIL_MEETING_WRITE')
  const noMeeting = await ledgerSave(SAVER, meetingBatch)
  check('A7c a failed meeting write leaves no person and gives back the debit taken first', [noMeeting?.created.length, await untouched('meeting-fails'), await getScanCreditBalance(client, SAVER)], [0, true, 8])
  check('A5b a failed save is 0 even though its debit was written earlier in the transaction', await debits('meeting-fails'), 0)

  await db.query('update public.scan_batches set shared_discussed = null where id = $1', [meetingBatch])
  const retried = await ledgerSave(SAVER, meetingBatch)
  const crashRetry = await ledgerSave(SAVER, crashBatch)
  check('14 a card that failed and later saves is debited exactly once', [retried?.creditsConsumed, await debits('meeting-fails'), await contactsOfItem('meeting-fails')], [1, 1, 1])
  check('14b and so is the card whose save crashed', [crashRetry?.creditsConsumed, await debits('crash-card'), await contactsOfItem('crash-card'), await getScanCreditBalance(client, SAVER)], [1, 1, 1, 6])

  // The transaction committed; the answer never arrived.
  const lostBatch = await seedBatch(SAVER, 'batch-lost', [{ key: 'lost-reply', position: 0, first_name: 'Lost', email: 'l@x.co' }])
  const committed = await acceptDirect(SAVER, 'lost-reply') // committed — the app never hears back
  const afterLoss = await ledgerSave(SAVER, lostBatch)
  check('A8 a committed save whose answer was lost is not debited again when Save is pressed again', [committed.outcome, committed.charged, afterLoss?.creditsConsumed, await debits('lost-reply'), await contactsOfItem('lost-reply'), await getScanCreditBalance(client, SAVER)], ['saved', true, 0, 1, 1, 5])
  const replayed = await acceptDirect(SAVER, 'lost-reply')
  check('A8b replaying the transaction itself answers already_saved and debits nothing', [replayed.outcome, replayed.charged, await debits('lost-reply')], ['already_saved', false, 1])

  const adapter = client as unknown as {
    from: (table: string) => unknown
    rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
  }
  let dropNextAnswer = true
  const lossy = {
    from: adapter.from,
    async rpc(name: string, params: Record<string, unknown>) {
      const answer = await adapter.rpc(name, params)
      if (name === 'accept_scan_batch_item' && dropNextAnswer) {
        dropNextAnswer = false
        return { data: null, error: { code: 'fetch_failed', message: 'network connection lost' } }
      }
      return answer
    },
  } as unknown as SupabaseClient
  const inlineBatch = await seedBatch(SAVER, 'batch-inline', [{ key: 'answer-dropped', position: 0, first_name: 'Dropped', email: 'd@x.co' }])
  const recovered = await ledgerSave(SAVER, inlineBatch, true, lossy)
  check('A8c an answer lost mid-request: the save asks again, finds it committed, reports it once', [recovered?.created.map((c) => c.itemId), recovered?.failed.length, recovered?.creditsConsumed, await debits('answer-dropped'), await contactsOfItem('answer-dropped'), await getScanCreditBalance(client, SAVER)], [[id('answer-dropped')], 0, 1, 1, 1, 4])

  await seedBatch(SAVER, 'batch-race', [{ key: 'double-tap', position: 0, first_name: 'Double', email: 'dt@x.co' }])
  const taps = await Promise.all([acceptDirect(SAVER, 'double-tap'), acceptDirect(SAVER, 'double-tap')])
  check('A8d two saves of one card at once: one saves, the other finds it saved, one debit', [taps.map((t) => t.outcome).sort(), await debits('double-tap'), await contactsOfItem('double-tap'), await getScanCreditBalance(client, SAVER)], [['already_saved', 'saved'], 1, 1, 3])
  // PGlite is one connection, so two truly parallel transactions cannot be staged here: A8d runs
  // them back to back. What makes a parallel second save wait and then answer already_saved is
  // the row lock, and that is pinned in the source rather than claimed as exercised.
  check('A8e the item row is locked for the whole transaction (static pin, not a parallel run)', /from public\.scan_batch_items i\s+where i\.id = p_item_id and i\.user_id = p_user_id\s+for update;/.test(read(MIGRATION_FILE)), true)

  // The flag says unpaid, the ledger says paid: the ledger wins.
  const flagBatch = await seedBatch(SAVER, 'batch-flag', [{ key: 'key-already-spent', position: 0, first_name: 'Flag', email: 'fl@x.co' }])
  await consumeScanCredit(client, { userId: SAVER, source: 'batch_item', sourceRef: id('key-already-spent'), idempotencyKey: ledgerKeys.batchItem(id('key-already-spent')) })
  const flagSave = await ledgerSave(SAVER, flagBatch)
  check('A10 credit_consumed false cannot cause a second debit when the ledger already holds the key', [flagSave?.created.length, flagSave?.creditsConsumed, await debits('key-already-spent'), (await itemRow('key-already-spent')).credit_consumed, await getScanCreditBalance(client, SAVER)], [1, 0, 1, true, 2])

  // The flag says paid, the ledger has no row: paid under the pre-ledger counter.
  const legacyContact = (await db.query<{ id: string }>("insert into public.scanned_contacts (user_id, name) values ($1, 'Saved Before The Ledger') returning id", [SAVER])).rows[0].id
  const legacyBatch = await seedBatch(SAVER, 'batch-legacy', [
    { key: 'legacy-saved', position: 0, first_name: 'Legacy', email: 'lg@x.co', credit_consumed: true, created_contact_id: legacyContact },
    { key: 'legacy-paid-unsaved', position: 1, first_name: 'Paid', email: 'pd@x.co', credit_consumed: true },
  ])
  const peopleBefore = await peopleOf(SAVER)
  const legacySave = await ledgerSave(SAVER, legacyBatch)
  check('A11 a card already paid under the old counter is never debited by the ledger', [legacySave?.creditsConsumed, await debits('legacy-saved'), await debits('legacy-paid-unsaved'), await getScanCreditBalance(client, SAVER)], [0, 0, 0, 2])
  check('A11b the finished card is left alone; a paid card with no saved person is saved once, uncharged', [(await itemRow('legacy-saved')).created_contact_id === legacyContact, legacySave?.created.map((c) => c.itemId), (await peopleOf(SAVER)) - peopleBefore], [true, [id('legacy-paid-unsaved')], 1])
  const legacyAgain = await ledgerSave(SAVER, legacyBatch)
  check('A11c and saving again changes nothing', [legacyAgain?.created.length, legacyAgain?.creditsConsumed, (await peopleOf(SAVER)) - peopleBefore], [0, 0, 1])

  // Ten detected, eight selected, five credits.
  await grant(PARTIAL, 5, 'test:grant:partial')
  const tenCards: SeedItem[] = Array.from({ length: 10 }, (_, i) => ({ key: 'partial-' + i, position: i, first_name: 'Card ' + i, email: 'p' + i + '@x.co', selected: i !== 3 && i !== 7 }))
  const partialBatch = await seedBatch(PARTIAL, 'batch-partial', tenCards)
  const partial = await ledgerSave(PARTIAL, partialBatch)
  check('A12 the first five selected cards in reading order are saved and paid', [positionsOf(partial?.created, tenCards), partial?.creditsConsumed, await getScanCreditBalance(client, PARTIAL)], [[0, 1, 2, 4, 5], 5, 0])
  check('A12b the other three selected cards are refused for credits, not saved', [positionsOf(partial?.failed, tenCards), partial?.stoppedForCredits, Array.from(new Set(partial?.failed.map((f) => f.reason)))], [[6, 8, 9], true, ['No Smart Scan credits left for this card.']])
  check('A12c nothing saved without a debit; waiting and removed cards untouched and still as the owner left them', [await peopleOf(PARTIAL), await meetingsOf(PARTIAL), await untouched('partial-6'), await untouched('partial-9'), await untouched('partial-3'), await untouched('partial-7'), await count('select count(*)::int as n from public.scan_batch_items where batch_id = $1 and selected', [partialBatch])], [5, 5, true, true, true, true, 8])
  await grant(PARTIAL, 3, 'test:grant:partial-top-up')
  const topUp = await ledgerSave(PARTIAL, partialBatch)
  check('A12d after buying more, Save finishes exactly the three that were waiting', [positionsOf(topUp?.created, tenCards), topUp?.creditsConsumed, await peopleOf(PARTIAL), await getScanCreditBalance(client, PARTIAL)], [[6, 8, 9], 3, 8, 0])

  // A normal owner with nothing left.
  const brokeBatch = await seedBatch(BROKE, 'batch-broke', [{ key: 'broke-card', position: 0, first_name: 'Broke', email: 'b@x.co' }])
  const broke = await ledgerSave(BROKE, brokeBatch)
  check('A6 no credit: the card is refused, never saved as an unpaid success', [broke?.created.length, broke?.failed.map((f) => f.reason), broke?.stoppedForCredits], [0, ['No Smart Scan credits left for this card.'], true])
  check('A14 a normal owner at zero gets no person, meeting or ledger row for free', [await untouched('broke-card'), await peopleOf(BROKE), await meetingsOf(BROKE), (await ledgerRows(db, BROKE)).length], [true, 0, 0, 0])
  check('A14b the transaction itself answers insufficient', (await acceptDirect(BROKE, 'broke-card')).outcome, 'insufficient')

  // Founder: the same transaction, no debit, no ledger row.
  const founderBatch = await seedBatch(FOUNDER, 'batch-founder', [
    { key: 'founder-a', position: 0, first_name: 'Founder', email: 'fa@x.co' },
    { key: 'founder-b', position: 1, first_name: 'Guest', email: 'fb@x.co' },
  ])
  const founderSave = await ledgerSave(FOUNDER, founderBatch, false)
  check('A13 the founder saves at a zero balance with no ledger row at all', [founderSave?.created.length, founderSave?.creditsConsumed, (await ledgerRows(db, FOUNDER)).length, await peopleOf(FOUNDER)], [2, 0, 0, 2])
  const saveRouteCode = code('app/api/scan/batch/[id]/save/route.ts')
  check('A13b the route takes the charge decision from the verified entitlement, never the request', saveRouteCode.includes('ledger ? { ledger: { charge: !entitlement.unmetered } } : {}'), true)
  check('A13c and charges after the save only when the ledger is off', /if \(!ledger\) \{\s*await chargeAcceptedCards\(/.test(saveRouteCode), true)
  check('A13d a signed-in user cannot call the save-and-charge transaction', await asRole(db, 'authenticated', SAVER, () => db.query("select * from public.accept_scan_batch_item($1, $2, false, '{}'::jsonb, '{}'::jsonb)", [SAVER, id('broke-card')])), 'denied')

  // 16. Single scan: one read of one image, at most one debit.
  await grant(BUYER, 10, 'test:grant:buyer')
  const buyerProfile = { id: BUYER, plan: 'free', scans_used: 0 }
  const buyer = identity(BUYER)
  const image = new TextEncoder().encode('the same compressed card image bytes')
  const digest = singleScanDigest(BUYER, image)
  const scanCard = { source: 'single_scan' as const, ref: digest, idempotencyKey: ledgerKeys.singleScan(digest) }
  await chargeAcceptedCards(client, buyerProfile, buyer, [scanCard])
  const retriedUpload = await chargeAcceptedCards(client, buyerProfile, buyer, [{ ...scanCard, idempotencyKey: ledgerKeys.singleScan(singleScanDigest(BUYER, new TextEncoder().encode('the same compressed card image bytes'))) }])
  check('16 a retried single-scan upload is charged once', [retriedUpload, await getScanCreditBalance(client, BUYER)], [['already_consumed'], 9])
  check('16b a different photo is a different read', singleScanDigest(BUYER, new TextEncoder().encode('another photo')) === digest, false)
  check('16c the same image for another owner is not the same key', singleScanDigest(USER_A, image) === digest, false)
  check('16d the key holds no image content, only a digest', /^[0-9a-f]{64}$/.test(digest), true)

  // 17–18. Founder.
  const founderProfile = { id: FOUNDER, plan: 'free', scans_used: 99, email: 'im.expoguy@gmail.com' }
  const founderCharge = await chargeAcceptedCards(client, founderProfile, founderIdentity, [{ source: 'batch_item', ref: 'f1', idempotencyKey: ledgerKeys.batchItem('founder-item') }])
  const founderState = await resolveScanEntitlement(client, founderProfile, founderIdentity, ENV)
  check('17 the founder is never charged', founderCharge, ['unmetered'])
  check('17b and never receives a ledger row, not even an opening balance', (await ledgerRows(db, FOUNDER)).length, 0)
  check('18 the founder scans at a zero balance', [founderState.available, founderState.unmetered, founderState.founder, founderState.pro, founderState.source], [Infinity, true, true, true, 'founder'])

  // 19. A normal owner with nothing left is blocked.
  const spentProfile = { id: LEGACY, plan: 'free', scans_used: 3 }
  const spent = await resolveScanEntitlement(client, spentProfile, identity(LEGACY), ENV)
  check('19 a normal owner at zero is blocked', [spent.available, spent.unmetered, spent.source], [0, false, 'ledger'])

  // Legacy bridge: remaining allowance carried across exactly once, zero included.
  const bridgedProfile = { id: USER_B, plan: 'free', scans_used: 1 }
  await resolveScanEntitlement(client, bridgedProfile, identity(USER_B), ENV)
  await resolveScanEntitlement(client, { ...bridgedProfile, scans_used: 0 }, identity(USER_B), ENV)
  const bridgeRows = (await ledgerRows(db, USER_B)).filter((r) => r.kind === 'opening_balance')
  check('19b the legacy allowance is carried across once', bridgeRows.map((r) => r.delta), [2])
  check('19c recorded even when nothing was left', (await ledgerRows(db, LEGACY)).filter((r) => r.kind === 'opening_balance').map((r) => r.delta), [0])
  check('19d with the ledger off, production keeps its counters', (await resolveScanEntitlement(client, { id: USER_A, plan: 'free', scans_used: 1 }, identity(USER_A), {})).source, 'legacy')

  // 20. An authenticated user cannot mint, spend, edit or erase.
  const mint = await asRole(db, 'authenticated', USER_A, () => db.query("select * from public.grant_scan_credits($1, 1000, 'grant', 'manual', null, null, 'attack:mint', '{}'::jsonb)", [USER_A]))
  const spend = await asRole(db, 'authenticated', USER_A, () => db.query("select * from public.consume_scan_credit($1, 'batch_item', 'x', 'attack:spend', '{}'::jsonb)", [USER_B]))
  const insert = await asRole(db, 'authenticated', USER_A, () => db.query("insert into public.scan_credit_ledger (user_id, delta, kind, source, idempotency_key) values ($1, 1000, 'grant', 'manual', 'attack:insert')", [USER_A]))
  const edit = await asRole(db, 'authenticated', USER_A, () => db.query('update public.scan_credit_ledger set delta = 1000 where user_id = $1', [USER_A]))
  const erase = await asRole(db, 'authenticated', USER_A, () => db.query('delete from public.scan_credit_ledger where user_id = $1', [USER_A]))
  const anonRead = await asRole(db, 'anon', null, () => db.query('select * from public.scan_credit_ledger'))
  check('20 an authenticated user cannot mint credits', mint, 'denied')
  check('20b nor spend them', spend, 'denied')
  check('20c nor insert, edit or delete ledger rows', [insert, edit, erase], ['denied', 'denied', 'denied'])
  check('20d and a signed-out visitor cannot read the ledger at all', anonRead, 'denied')
  check('20e the balance is unchanged by every attempt', await getScanCreditBalance(client, USER_A), 5)

  // 21. Cross-user isolation.
  const ownView = await asRole(db, 'authenticated', USER_A, () => db.query<{ user_id: string }>('select user_id from public.scan_credit_ledger'))
  check('21 an owner reads only their own ledger rows', ownView === 'denied' ? 'denied' : Array.from(new Set(ownView.rows.map((r) => r.user_id))), [USER_A])
  const peek = await asRole(db, 'authenticated', USER_A, () => db.query('select * from public.scan_credit_ledger where user_id = $1', [USER_B]))
  check('21b and never another owner’s', peek === 'denied' ? 'denied' : peek.rows.length, 0)
  const webhookPeek = await asRole(db, 'authenticated', USER_A, () => db.query('select * from public.stripe_webhook_events'))
  check('21c webhook records are server-only', webhookPeek, 'denied')

  // ═══════════════════ STRIPE (offline) ═══════════════════

  // 22. Missing configuration fails safely.
  const unconfigured = stripeMock()
  const noStripe = await createCheckoutSession({ stripe: null, customers: profileCustomerStore(client), env: {} }, identity(USER_A), 'scan_pack_8')
  check('22 checkout without Stripe configured is refused honestly', noStripe, { ok: false, status: 503, code: 'stripe_not_configured' })
  const noWebhookSecret = await handleStripeWebhook({ stripe: unconfigured.client, store: supabaseWebhookStore(client), env: { STRIPE_SECRET_KEY: ENV.STRIPE_SECRET_KEY } }, '{}', 'sig')
  check('22b a webhook without its secret is refused honestly', noWebhookSecret, { status: 503, body: { error: 'webhook_not_configured' } })
  check('22c nothing reached Stripe', unconfigured.calls.customersCreate.length + unconfigured.calls.sessionsCreate.length, 0)
  check('22d placeholder keys are not configuration', [readStripeConfig({ STRIPE_SECRET_KEY: 'sk_123' }).ok, readStripeConfig({ STRIPE_SECRET_KEY: '' }).ok], [false, false])

  // 23–25, 27. Checkout.
  const shop = stripeMock()
  const bought = await createCheckoutSession({ stripe: shop.client, customers: profileCustomerStore(client), env: ENV }, identity(USER_A), 'scan_pack_8')
  const params = shop.calls.sessionsCreate[0]
  check('23 the purchaser is the session owner', [params?.client_reference_id, (params?.metadata as Record<string, string>)?.abc_user_id], [USER_A, USER_A])
  check('23b checkout takes a product and nothing else from the request', code('app/api/billing/checkout/route.ts').includes('body.productKey') && !/body\.(user|customer|price|credits|quantity)/i.test(code('app/api/billing/checkout/route.ts')), true)
  check('24 the customer is resolved for that owner, not chosen by the client', [params?.customer, (await db.query<{ c: string }>('select stripe_customer_id as c from public.abc_profiles where id = $1', [USER_A])).rows[0].c], ['cus_test_1', 'cus_test_1'])
  check('27 a scan pack checks out as a one-time payment', [bought.ok, params?.mode, params?.line_items, (params?.metadata as Record<string, string>)?.credits], [true, 'payment', [{ price: PRICE.pack8, quantity: 1 }], FIXTURE_CREDITS])
  check('27b redirects come from the canonical origin', [params?.success_url, params?.cancel_url], ['https://www.abccard.io/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}', 'https://www.abccard.io/settings/billing?checkout=cancelled'])
  check('27c the payment carries the purchase terms too', Boolean((params as { payment_intent_data?: { metadata?: unknown } })?.payment_intent_data?.metadata), true)
  await createCheckoutSession({ stripe: shop.client, customers: profileCustomerStore(client), env: ENV }, identity(USER_A), 'pro_monthly')
  check('27d a Pro subscription checks out as a subscription', [shop.calls.sessionsCreate[1]?.mode, Boolean((shop.calls.sessionsCreate[1] as { subscription_data?: unknown })?.subscription_data)], ['subscription', true])

  await createCheckoutSession({ stripe: shop.client, customers: profileCustomerStore(client), env: ENV }, identity(USER_A), 'scan_pack_8')
  check('25 the Stripe customer is created once per owner', shop.calls.customersCreate.length, 1)
  check('25b under an owner-keyed idempotency key', (shop.calls.customersCreate[0]?.opts as { idempotencyKey?: string })?.idempotencyKey, `abc-customer-${USER_A}`)
  const race = stripeMock()
  const [raceOne, raceTwo] = await Promise.all([
    ensureStripeCustomer(race.client, profileCustomerStore(client), identity(USER_B)),
    ensureStripeCustomer(race.client, profileCustomerStore(client), identity(USER_B)),
  ])
  check('25c two simultaneous first purchases settle on one customer', raceOne === raceTwo, true)
  const renamed = await ensureStripeCustomer(race.client, profileCustomerStore(client), identity(USER_B, 'new-address@example.com'))
  check('25d changing email does not create a second customer', renamed, raceOne)

  // 26. Unconfigured products cannot check out.
  const notSold = stripeMock()
  const unsold = await createCheckoutSession({ stripe: notSold.client, customers: profileCustomerStore(client), env: ENV }, identity(USER_A), 'scan_pack_17')
  check('26 an unconfigured pack cannot be bought', unsold, { ok: false, status: 409, code: 'product_not_configured' })
  check('26b a zero quantity is not a configuration', resolveProduct('scan_pack_8', { ...ENV, SCAN_PACK_8_CREDITS: '0' }).configured, false)
  check('26c nor a price without a quantity', resolveProduct('scan_pack_8', { STRIPE_PRICE_SCAN_PACK_8: PRICE.pack8 }).configured, false)
  check('26d nor a placeholder Price ID', resolveProduct('scan_pack_8', { ...ENV, STRIPE_PRICE_SCAN_PACK_8: 'price_123' }).configured, false)
  check('26e an unknown product is refused', (await createCheckoutSession({ stripe: notSold.client, customers: profileCustomerStore(client), env: ENV }, identity(USER_A), 'scan_pack_999')).ok, false)
  check('26f and Stripe is never called for any of them', notSold.calls.sessionsCreate.length, 0)

  // 28. Checkout alone grants nothing.
  check('28 starting checkout grants nothing', await getScanCreditBalance(client, USER_A), 5)
  check('28b no route grants from a success redirect', /grantScanCredits|grant_scan_credits/.test(code('app/api/billing/checkout/route.ts') + code('app/api/billing/status/route.ts') + code('lib/billing/checkout.ts')), false)

  // 29–35. Webhooks.
  const hook = stripeMock()
  const deps = { stripe: hook.client, store: supabaseWebhookStore(client), env: ENV }

  const completed = signedEvent(stripeEvent('evt_paid_1', 'checkout.session.completed', paidPackSession('cs_paid_1', USER_B)))
  const accepted = await handleStripeWebhook(deps, completed.payload, completed.signature)
  check('29 a validly signed paid checkout is accepted', accepted, { status: 200, body: { received: true } })
  check('29b and grants exactly the credits that were sold', (await ledgerRows(db, USER_B)).filter((r) => r.source === 'stripe_checkout').map((r) => [r.delta, r.idempotency_key]), [[4, 'stripe:checkout:cs_paid_1']])

  const tampered = await handleStripeWebhook(deps, completed.payload.replace('"credits":"4"', '"credits":"400"'), completed.signature)
  check('30 an altered body fails verification', tampered, { status: 400, body: { error: 'invalid_signature' } })
  const forged = signedEvent(stripeEvent('evt_forged', 'checkout.session.completed', paidPackSession('cs_forged', USER_B)), 'whsec_' + 'z'.repeat(32))
  check('30b a payload signed with another secret is rejected', (await handleStripeWebhook(deps, forged.payload, forged.signature)).status, 400)
  check('30c neither was recorded', (await db.query('select 1 from public.stripe_webhook_events where event_id = $1', ['evt_forged'])).rows.length, 0)

  const again = await handleStripeWebhook(deps, completed.payload, completed.signature)
  check('31 a duplicate delivery is acknowledged as a duplicate', again, { status: 200, body: { received: true, duplicate: true } })
  check('31b and grants nothing more', (await ledgerRows(db, USER_B)).filter((r) => r.source === 'stripe_checkout').length, 1)

  const asyncSucceeded = signedEvent(stripeEvent('evt_paid_1_async', 'checkout.session.async_payment_succeeded', paidPackSession('cs_paid_1', USER_B)))
  await handleStripeWebhook(deps, asyncSucceeded.payload, asyncSucceeded.signature)
  check('32 a second event completing the same session grants nothing more', (await ledgerRows(db, USER_B)).filter((r) => r.source === 'stripe_checkout').length, 1)

  const unpaid = signedEvent(stripeEvent('evt_unpaid', 'checkout.session.completed', paidPackSession('cs_unpaid', USER_B, { payment_status: 'unpaid' })))
  const unpaidResult = await handleStripeWebhook(deps, unpaid.payload, unpaid.signature)
  check('33 an unpaid session grants nothing', [unpaidResult.status, (await ledgerRows(db, USER_B)).some((r) => r.idempotency_key === 'stripe:checkout:cs_unpaid')], [200, false])
  const wrongPrice = stripeMock({ lineItemPrice: 'price_SomethingElsexxxxx' })
  const mismatch = signedEvent(stripeEvent('evt_mismatch', 'checkout.session.completed', paidPackSession('cs_mismatch', USER_B)))
  await handleStripeWebhook({ ...deps, stripe: wrongPrice.client }, mismatch.payload, mismatch.signature)
  check('33b a session whose charge does not match the catalogue grants nothing', (await ledgerRows(db, USER_B)).some((r) => r.idempotency_key === 'stripe:checkout:cs_mismatch'), false)
  const wrongOwner = signedEvent(stripeEvent('evt_owner', 'checkout.session.completed', paidPackSession('cs_owner', USER_B, { client_reference_id: USER_A })))
  await handleStripeWebhook(deps, wrongOwner.payload, wrongOwner.signature)
  check('33c nor one whose owner fields disagree', (await ledgerRows(db, USER_A)).some((r) => r.idempotency_key === 'stripe:checkout:cs_owner') || (await ledgerRows(db, USER_B)).some((r) => r.idempotency_key === 'stripe:checkout:cs_owner'), false)

  const events = await db.query<{ event_id: string; status: string; attempts: number; error_code: string | null }>('select event_id, status, attempts, error_code from public.stripe_webhook_events order by received_at, event_id')
  const byId = new Map(events.rows.map((row) => [row.event_id, row]))
  check('34 each event is recorded once, with its outcome', [byId.get('evt_paid_1')?.status, byId.get('evt_paid_1')?.attempts, byId.get('evt_unpaid')?.status], ['processed', 1, 'ignored'])
  check('34b a rejected event is visible, with a code rather than a payload', [byId.get('evt_mismatch')?.status, byId.get('evt_mismatch')?.error_code], ['failed', 'line_items_mismatch'])

  // A transient failure is retried, and the retry completes the work exactly once.
  let failNext = true
  const flakyStore = supabaseWebhookStore(client)
  const flakyDeps = {
    ...deps,
    store: { ...flakyStore, grantCredits: async (args: Parameters<typeof flakyStore.grantCredits>[0]) => {
      if (failNext) { failNext = false; throw new Error('ledger_grant_failed:08006') }
      return flakyStore.grantCredits(args)
    } },
  }
  const flaky = signedEvent(stripeEvent('evt_flaky', 'checkout.session.completed', paidPackSession('cs_flaky', USER_B)))
  const firstDelivery = await handleStripeWebhook(flakyDeps, flaky.payload, flaky.signature)
  const secondDelivery = await handleStripeWebhook(flakyDeps, flaky.payload, flaky.signature)
  const flakyRow = (await db.query<{ status: string; attempts: number }>('select status, attempts from public.stripe_webhook_events where event_id = $1', ['evt_flaky'])).rows[0]
  check('34c a transient failure asks Stripe to retry', firstDelivery.status, 500)
  check('34d and the retry grants once', [secondDelivery.status, flakyRow.status, flakyRow.attempts, (await ledgerRows(db, USER_B)).filter((r) => r.idempotency_key === 'stripe:checkout:cs_flaky').length], [200, 'processed', 2, 1])

  const unknown = signedEvent(stripeEvent('evt_invoice', 'invoice.paid', { id: 'in_1', object: 'invoice' }))
  const unknownResult = await handleStripeWebhook(deps, unknown.payload, unknown.signature)
  check('35 an event type this code does not handle is acknowledged and ignored', [unknownResult.status, (await db.query<{ status: string }>('select status from public.stripe_webhook_events where event_id = $1', ['evt_invoice'])).rows[0]?.status], [200, 'ignored'])

  // Pro billing state: subscriptions in order, an Event Pass with its own period.
  const proHook = stripeMock({ subscription: { status: 'active' } })
  const proDeps = { stripe: proHook.client, store: supabaseWebhookStore(client), env: ENV }
  const proSession = signedEvent(stripeEvent('evt_pro_1', 'checkout.session.completed', {
    id: 'cs_pro_1', object: 'checkout.session', mode: 'subscription', payment_status: 'paid', client_reference_id: USER_A,
    subscription: 'sub_test_1', customer: 'cus_test_1', metadata: { abc_user_id: USER_A, product_key: 'pro_monthly', catalog_price_id: PRICE.proMonthly },
  }, 1_788_000_200))
  await handleStripeWebhook(proDeps, proSession.payload, proSession.signature)
  const cancelled = signedEvent(stripeEvent('evt_pro_cancel', 'customer.subscription.deleted', {
    id: 'sub_test_1', object: 'subscription', status: 'canceled', customer: 'cus_test_1', current_period_start: 1_788_000_000, current_period_end: 1_790_600_000, cancel_at_period_end: false,
    metadata: { abc_user_id: USER_A, product_key: 'pro_monthly' },
  }, 1_788_000_900))
  await handleStripeWebhook(proDeps, cancelled.payload, cancelled.signature)
  const lateUpdate = signedEvent(stripeEvent('evt_pro_late', 'customer.subscription.updated', {
    id: 'sub_test_1', object: 'subscription', status: 'active', customer: 'cus_test_1', current_period_start: 1_788_000_000, current_period_end: 1_790_600_000, cancel_at_period_end: false,
    metadata: { abc_user_id: USER_A, product_key: 'pro_monthly' },
  }, 1_788_000_500))
  await handleStripeWebhook(proDeps, lateUpdate.payload, lateUpdate.signature)
  const proRows = (await db.query<{ product_key: string; status: string }>('select product_key, status from public.billing_entitlements where user_id = $1', [USER_A])).rows
  check('P1 a Pro subscription is recorded as billing state', proRows.map((r) => r.product_key), ['pro_monthly'])
  check('P2 an older event arriving late cannot undo a cancellation', proRows[0]?.status, 'canceled')
  check('P3 Pro grants no Smart Scan credits', (await ledgerRows(db, USER_A)).some((r) => r.source === 'stripe_checkout'), false)

  const passHook = stripeMock({ lineItemPrice: PRICE.proEvent })
  const pass = signedEvent(stripeEvent('evt_pass', 'checkout.session.completed', {
    id: 'cs_pass_1', object: 'checkout.session', mode: 'payment', payment_status: 'paid', created: 1_788_000_000, client_reference_id: USER_B, customer: 'cus_x',
    metadata: { abc_user_id: USER_B, product_key: 'pro_event', catalog_price_id: PRICE.proEvent, pass_days: FIXTURE_PASS_DAYS },
  }))
  await handleStripeWebhook({ ...proDeps, stripe: passHook.client }, pass.payload, pass.signature)
  const passRow = (await db.query<{ status: string; current_period_start: Date; current_period_end: Date }>('select status, current_period_start, current_period_end from public.billing_entitlements where stripe_checkout_session_id = $1', ['cs_pass_1'])).rows[0]
  check('P4 an Event Pass is active for exactly its configured period', [passRow?.status, passRow ? (new Date(passRow.current_period_end).getTime() - new Date(passRow.current_period_start).getTime()) / 86_400_000 : null], ['active', 5])

  // 36. Nothing secret reaches the client.
  const statusA = await readBillingStatus(client, { id: USER_A, plan: 'free', scans_used: 0 }, identity(USER_A), ENV, new Date(1_788_000_300_000))
  const serialized = JSON.stringify(statusA)
  check('36 billing status carries no secret, id or price', /sk_|whsec_|price_|cus_|sub_|cs_/.test(serialized), false)
  // Reading status is this owner's first ledger-on resolve, so the untouched free
  // allowance is bridged in: five from the ledger tests, plus three carried across.
  check('36b it reports the balance, legacy allowance included', statusA.smartScan.balance, 8)
  check('36f of which exactly the bridged legacy allowance', (await ledgerRows(db, USER_A)).filter((r) => r.kind === 'opening_balance').map((r) => r.delta), [3])
  const checkoutResponses = code('app/api/billing/checkout/route.ts').split('\n').filter((line) => line.includes('NextResponse.json('))
  check('36c checkout errors carry a code and a sentence, nothing else', checkoutResponses.some((line) => line.includes('{ error: MESSAGES[result.code], code: result.code }')) && !checkoutResponses.some((line) => /process\.env|config|secret|customer|price/i.test(line)), true)
  check('36d the status route is authenticated and uncached', code('app/api/billing/status/route.ts').includes("if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })") && code('app/api/billing/status/route.ts').includes("'Cache-Control': 'no-store'"), true)
  check('36e unconfigured products report no quantity at all', statusA.products.filter((p) => !p.available).every((p) => p.credits === null), true)

  // 37. The founder does not depend on Stripe.
  const founderStatus = await readBillingStatus(client, founderProfile, founderIdentity, {})
  check('37 with Stripe entirely unconfigured the founder is unmetered and Pro', [founderStatus.stripeConfigured, founderStatus.smartScan.unmetered, founderStatus.pro.active, founderStatus.pro.viaFounder], [false, true, true, true])
  check('37b and the founder rule is unchanged', code('lib/scan/entitlement.ts').includes('if (!identity.email_confirmed_at && !identity.confirmed_at) return false'), true)

  // ═══════════════════ NO INVENTED QUANTITIES ═══════════════════

  check('N1 with no configuration, nothing can be sold', PRODUCT_KEYS.map((key) => resolveProduct(key, {}).configured), [false, false, false, false, false, false])
  check('N2 the catalogue defines no credit quantity', Object.values(PRODUCTS).some((p) => 'credits' in p), false)
  check('N3 no quantity literal appears in billing code', /credits\s*[:=]\s*\d|CREDITS\s*\|\|\s*['"]?\d|\?\?\s*\d+\s*\/\/\s*credits/i.test(['lib/billing/catalog.ts', 'lib/billing/checkout.ts', 'lib/billing/webhook.ts', 'lib/billing/status.ts'].map(code).join('\n')), false)
  check('N4 the three locked price points are documented, not granted', [PRODUCTS.scan_pack_8, PRODUCTS.scan_pack_17, PRODUCTS.scan_pack_28].map((p) => (p.kind === 'scan_pack' ? p.publicPriceEurCents : null)), [800, 1700, 2800])
  check('N5 every catalogue env name is a configuration name', catalogEnvNames(), ['STRIPE_PRICE_SCAN_PACK_8', 'SCAN_PACK_8_CREDITS', 'STRIPE_PRICE_SCAN_PACK_17', 'SCAN_PACK_17_CREDITS', 'STRIPE_PRICE_SCAN_PACK_28', 'SCAN_PACK_28_CREDITS', 'STRIPE_PRICE_PRO_EVENT', 'PRO_EVENT_PASS_DAYS', 'STRIPE_PRICE_PRO_MONTHLY', 'STRIPE_PRICE_PRO_ANNUAL'])
  check('N6 a price maps back to its product only when configured', [productForPriceId(PRICE.pack8, ENV), productForPriceId(PRICE.pack8, {})], ['scan_pack_8', null])
  check('N7 the ledger is off unless switched on', [ledgerEnabled({}), ledgerEnabled({ SMART_SCAN_LEDGER: 'on' })], [false, true])

  // ═══════════════════ MIGRATION SAFETY ═══════════════════

  const migration = read(MIGRATION_FILE)
  const outsideFunctions = migration.replace(/\$\$[\s\S]*?\$\$/g, '').replace(/--.*$/gm, '')
  check('M1 no table or column is dropped', /drop\s+(table|column|schema|index)/i.test(outsideFunctions), false)
  check('M2 no rows are deleted, truncated or rewritten', /\b(delete\s+from|truncate|update\s+public\.)/i.test(outsideFunctions), false)
  check('M3 no existing table is altered beyond enabling RLS on its own new tables', (outsideFunctions.match(/alter table\s+public\.(\w+)/gi) || []).map((s) => s.split('.')[1]).every((t) => ['scan_credit_ledger', 'stripe_webhook_events', 'billing_entitlements'].includes(t)), true)
  check('M4 the only drops are guards on objects this migration creates', (outsideFunctions.match(/drop\s+(trigger|policy)\s+if\s+exists\s+"?([\w_]+)"?\s+on\s+public\.(\w+)/gi) || []).every((s) => /scan_credit_ledger|billing_entitlements/.test(s)), true)
  check('M5 no backfill', /insert\s+into\s+public\.scan_credit_ledger/i.test(outsideFunctions), false)
  const reapplied = await new PGlite().exec('select 1').then(() => true)
  check('M6 the migration re-applies cleanly', await (async () => { try { await db.exec(migration); return true } catch { return false } })(), reapplied)

  // ═══════════════════ NOTHING ELSE MOVED ═══════════════════

  const changed = git('diff', '--name-only', 'origin/berlin-event-workspace').split('\n').filter(Boolean)
  const touching = (re: RegExp) => changed.filter((f) => re.test(f))
  check('U1 the event workspace is untouched', touching(/events/i), [])
  check('U2 auth and wallet are untouched', touching(/auth|wallet|apple|google/i), [])
  check('U3 the legacy pricing flow is untouched', touching(/^app\/pricing|^app\/api\/stripe\/(checkout|session|portal)|stripe-prices/), [])
  check('U4 existing migrations are untouched', touching(/^supabase\/migrations\//).filter((f) => f !== MIGRATION_FILE), [])

  await db.close()

  const total = passed + failures.length
  if (failures.length) {
    console.log(`\nBilling: ${passed}/${total} PASS, ${failures.length} FAILED\n`)
    for (const failure of failures) console.log('  FAIL ' + failure)
    process.exit(1)
  }
  console.log(`\nBilling: ${passed}/${total} PASS`)
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

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
