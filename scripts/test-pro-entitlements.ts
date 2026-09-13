/**
 * ABC Pro entitlements and feature gates.
 *
 * Run with `npm run test:pro` from the repository root.
 *
 * The resolver runs against real Postgres in PGlite: `billing_entitlements` and
 * `apply_billing_entitlement` from the Task #3 migration, the Smart Scan ledger,
 * and the contact, encounter and CRM mapping tables from their own migrations.
 * The routes are Next handlers that need a live Supabase session, so what they
 * enforce is proven in two halves: the shared gate they call is exercised for
 * real here, and each route is checked to call it, with the verified user,
 * before it does any paid work. Nothing here reaches Supabase, Stripe, Google or
 * a CRM.
 */
import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { grantScanCredits } from '@/lib/billing/ledger'
import {
  PRO_FEATURE_MESSAGES,
  PRO_REQUIRED,
  isProRequired,
  proRequiredPath,
} from '@/lib/billing/pro-features'
import { readBillingStatus } from '@/lib/billing/status'
import {
  isBillingEntitlementActive,
  requirePro,
  resolveEntitlements,
  resolveProEntitlement,
} from '@/lib/entitlements'
import type { AuthIdentity } from '@/lib/scan/entitlement'

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
const listFiles = (dir: string): string[] =>
  fs.existsSync(path.join(ROOT, dir))
    ? fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? listFiles(path.join(dir, entry.name)) : [path.join(dir, entry.name).replace(/\\/g, '/')]
      )
    : []

const NOW = new Date('2026-09-14T12:00:00.000Z')
const DAY = 86_400_000
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString()

const uid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const FREE = uid(1)
const FOUNDER_ID = uid(2)
const PASS = uid(3)
const PASS_EXPIRED = uid(4)
const MONTHLY = uid(5)
const MONTHLY_OFF = uid(6)
const MONTHLY_STALE = uid(7)
const ANNUAL = uid(8)
const ANNUAL_OFF = uid(9)
const FUTURE = uid(10)
const OTHER = uid(11)
const ALL_USERS = [FREE, FOUNDER_ID, PASS, PASS_EXPIRED, MONTHLY, MONTHLY_OFF, MONTHLY_STALE, ANNUAL, ANNUAL_OFF, FUTURE, OTHER]

const FOUNDER_EMAIL = 'im.expoguy@gmail.com'
const confirmed = '2026-01-01T00:00:00.000Z'
const identity = (id: string, email = `${id.slice(-4)}@example.com`): AuthIdentity => ({ id, email, email_confirmed_at: confirmed })

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

    create table public.abc_profiles (
      id uuid primary key references auth.users (id) on delete cascade,
      plan text default 'free',
      email text,
      google_email text,
      scans_used integer default 0,
      stripe_customer_id text,
      google_connected boolean default false,
      google_refresh_token text,
      google_access_token text
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
    -- The shape crm_connections needs for "is a connection still there".
    create table public.crm_connections (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      provider text not null
    );
  `)
  for (const file of [
    'supabase/migrations/20260823120000_contact_encounters.sql',
    'supabase/migrations/20260825120000_crm_object_mappings.sql',
    'supabase/migrations/20260910120000_multi_card_scan_batches.sql',
    'supabase/migrations/20260911120000_contact_delete_batch_history.sql',
    'supabase/migrations/20260912120000_smart_scan_credit_ledger.sql',
  ]) {
    await db.exec(read(file))
  }
  for (const id of ALL_USERS) {
    await db.query('insert into auth.users (id) values ($1)', [id])
    await db.query('insert into public.abc_profiles (id) values ($1)', [id])
  }
  return db
}

/** Enough of the Supabase client for the resolver and the status reader, over PGlite, as the service role. */
function supabaseOver(db: PGlite): SupabaseClient {
  const scalar = new Set(['scan_credit_balance', 'apply_billing_entitlement'])
  const isJson = (value: unknown) => value !== null && typeof value === 'object' && !(value instanceof Date)
  const param = (value: unknown) => (isJson(value) ? JSON.stringify(value) : value)
  const failure = (err: unknown) => ({ data: null, error: { code: (err as { code?: string }).code ?? 'unknown', message: String(err) } })

  async function rpc(name: string, params: Record<string, unknown>) {
    const keys = Object.keys(params)
    const args = keys.map((key, i) => `${key} => $${i + 1}${isJson(params[key]) ? '::jsonb' : ''}`).join(', ')
    const values = keys.map((key) => param(params[key]))
    try {
      if (scalar.has(name)) {
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
    let columns = '*'
    let orderBy = ''
    let limitN = 0
    let single = false

    const builder = {
      select(cols = '*') {
        columns = cols
        return builder
      },
      eq(column: string, value: unknown) {
        filters.push({ sql: `${column} = $?`, value })
        return builder
      },
      order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
        orderBy = ` order by ${column} ${opts?.ascending === false ? 'desc' : 'asc'}${opts?.nullsFirst === false ? ' nulls last' : ''}`
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
      const values: unknown[] = []
      const clause = filters.length
        ? ' where ' +
          filters
            .map((f) => {
              values.push(param(f.value))
              return f.sql.replace('$?', `$${values.length}`)
            })
            .join(' and ')
        : ''
      try {
        const rows = (await db.query(`select ${columns} from public.${table}${clause}${orderBy}${limitN ? ` limit ${limitN}` : ''}`, values)).rows
        return { data: single ? rows[0] ?? null : rows, error: null }
      } catch (err) {
        return failure(err)
      }
    }

    return builder
  }

  return { rpc, from } as unknown as SupabaseClient
}

/** A stored entitlement, written the way the webhook writes one. */
async function entitle(
  db: PGlite,
  userId: string,
  productKey: 'pro_event' | 'pro_monthly' | 'pro_annual',
  status: string,
  start: string,
  end: string,
  cancelAtPeriodEnd: boolean,
  reference: string,
  eventAt = NOW.toISOString()
): Promise<string> {
  const pass = productKey === 'pro_event'
  const result = await db.query<{ outcome: string }>(
    `select public.apply_billing_entitlement(
       p_user_id => $1, p_product_key => $2, p_status => $3,
       p_stripe_subscription_id => $4, p_stripe_checkout_session_id => $5,
       p_current_period_start => $6, p_current_period_end => $7,
       p_cancel_at_period_end => $8, p_event_at => $9
     ) as outcome`,
    [userId, productKey, status, pass ? null : reference, pass ? reference : null, start, end, cancelAtPeriodEnd, eventAt]
  )
  return result.rows[0].outcome
}

const count = async (db: PGlite, sql: string, params: unknown[] = []) => Number((await db.query<{ n: number }>(sql, params)).rows[0].n)

// ─────────────────────────── ROUTES ───────────────────────────

type Gate = { file: string; feature: string; kind: 'json' | 'redirect'; work: string }

const GATED: Gate[] = [
  { file: 'app/api/auth/google-gmail/route.ts', feature: 'gmail', kind: 'redirect', work: 'getGmailAuthorizeUrl(' },
  { file: 'app/api/auth/google-gmail/callback/route.ts', feature: 'gmail', kind: 'redirect', work: 'exchangeGmailCode(' },
  { file: 'app/api/card/send-gmail/route.ts', feature: 'gmail', kind: 'json', work: 'sendGmailForContact(' },
  { file: 'app/api/contact/send-gmail/route.ts', feature: 'gmail', kind: 'json', work: 'sendGmailForContact(' },
  { file: 'app/api/auth/hubspot/route.ts', feature: 'crm', kind: 'redirect', work: 'getHubSpotAuthorizeUrl(' },
  { file: 'app/api/auth/pipedrive/route.ts', feature: 'crm', kind: 'redirect', work: 'getPipedriveAuthorizeUrl(' },
  { file: 'app/api/auth/salesforce/route.ts', feature: 'crm', kind: 'redirect', work: 'getSalesforceAuthorizeUrl(' },
  { file: 'app/api/auth/hubspot/callback/route.ts', feature: 'crm', kind: 'redirect', work: 'exchangeHubSpotCode(' },
  { file: 'app/api/auth/pipedrive/callback/route.ts', feature: 'crm', kind: 'redirect', work: 'exchangePipedriveCode(' },
  { file: 'app/api/auth/salesforce/callback/route.ts', feature: 'crm', kind: 'redirect', work: 'exchangeSalesforceCode(' },
  { file: 'app/api/crm/export/route.ts', feature: 'crm', kind: 'json', work: 'pushContactEncounterToCrm(' },
  { file: 'app/api/scan/batch/[id]/export/route.ts', feature: 'crm', kind: 'json', work: 'pushContactEncounterToCrm(' },
  { file: 'app/api/contact/message/route.ts', feature: 'smart_follow_up', kind: 'json', work: 'process.env.ANTHROPIC_API_KEY' },
  { file: 'app/api/enrich/messages/[id]/route.ts', feature: 'smart_follow_up', kind: 'json', work: 'generatePersonalizedMessages(' },
  { file: 'app/api/card/followup/route.ts', feature: 'follow_up_sequence', kind: 'json', work: ".from('followup_sequences')" },
]

/** Routes that must stay free: identity, own data, status, disconnecting, Smart Scan. */
const FREE_ROUTES = [
  'app/auth/callback/route.ts',
  'app/api/follow-ups/route.ts',
  'app/api/pipeline/action/route.ts',
  'app/api/crm/connections/route.ts',
  'app/api/auth/hubspot/disconnect/route.ts',
  'app/api/auth/pipedrive/disconnect/route.ts',
  'app/api/auth/salesforce/disconnect/route.ts',
  'app/api/export/csv/route.ts',
  'app/api/card/delete/route.ts',
  'app/api/card/scan/route.ts',
  'app/api/scan/batch/[id]/detect/route.ts',
  'app/api/scan/batch/[id]/save/route.ts',
  'app/api/billing/status/route.ts',
]

const gateOrder = (gate: Gate) => {
  const src = code(gate.file)
  const call = src.indexOf(`requirePro(`)
  const feature = src.indexOf(`'${gate.feature}')`, call)
  const work = src.indexOf(gate.work)
  return { src, call, feature, work }
}

async function run() {
  const db = await freshDatabase()
  const client = supabaseOver(db)
  const ledgerOn = { SMART_SCAN_LEDGER: 'on' }

  await entitle(db, PASS, 'pro_event', 'active', at(-1), at(4), false, 'cs_TESTpass00001')
  await entitle(db, PASS_EXPIRED, 'pro_event', 'active', at(-10), at(-5), false, 'cs_TESTpass00002')
  await entitle(db, MONTHLY, 'pro_monthly', 'active', at(-10), at(20), false, 'sub_TESTmonthly001')
  // Canceled mid-period and past due at renewal: both still inside a stored period, so only Stripe's status can refuse them.
  await entitle(db, MONTHLY_OFF, 'pro_monthly', 'canceled', at(-10), at(20), false, 'sub_TESTmonthly002')
  await entitle(db, MONTHLY_STALE, 'pro_monthly', 'active', at(-40), at(-10), false, 'sub_TESTmonthly003')
  await entitle(db, ANNUAL, 'pro_annual', 'active', at(-100), at(265), true, 'sub_TESTannual0001')
  await entitle(db, ANNUAL_OFF, 'pro_annual', 'past_due', at(-5), at(360), false, 'sub_TESTannual0002')
  await entitle(db, FUTURE, 'pro_event', 'active', at(2), at(7), false, 'cs_TESTfuture0001')
  await entitle(db, OTHER, 'pro_monthly', 'active', at(-1), at(29), false, 'sub_TESTother00001')

  const proOf = (userId: string, email?: string) => resolveProEntitlement(client, identity(userId, email), NOW)

  // ═══════════════════ ENTITLEMENTS ═══════════════════

  check('1  a Free account is not Pro', await proOf(FREE), { pro: false, founder: false, proSource: 'none', proEndsAt: null, proRenews: false })
  check('2  the founder is Pro', await proOf(FOUNDER_ID, FOUNDER_EMAIL), { pro: true, founder: true, proSource: 'founder', proEndsAt: null, proRenews: false })
  check('3  with no billing row, Stripe customer or Stripe configuration', [await count(db, 'select count(*)::int as n from public.billing_entitlements where user_id = $1', [FOUNDER_ID]), (await readBillingStatus(client, { id: FOUNDER_ID, plan: 'free' }, identity(FOUNDER_ID, FOUNDER_EMAIL), {}, NOW)).pro.active], [0, true])
  check('4  an active Event Pass is Pro until its end', await proOf(PASS), { pro: true, founder: false, proSource: 'event_pass', proEndsAt: at(4), proRenews: false })
  check('5  an expired Event Pass is not', (await proOf(PASS_EXPIRED)).pro, false)
  check('6  an active monthly subscription is Pro and renews', await proOf(MONTHLY), { pro: true, founder: false, proSource: 'monthly', proEndsAt: at(20), proRenews: true })
  check('7  a canceled monthly is not, nor one whose stored period ran out', [(await proOf(MONTHLY_OFF)).pro, (await proOf(MONTHLY_STALE)).pro], [false, false])
  check('8  an active annual subscription set to cancel is Pro until its end, not renewing', await proOf(ANNUAL), { pro: true, founder: false, proSource: 'annual', proEndsAt: at(265), proRenews: false })
  check('9  an annual subscription that is past due is not', (await proOf(ANNUAL_OFF)).pro, false)
  check('10 an Event Pass that has not started yet grants nothing early', (await proOf(FUTURE)).pro, false)
  const boundary = { product_key: 'pro_event', status: 'active', current_period_start: NOW.toISOString(), current_period_end: at(1), cancel_at_period_end: false }
  check(
    '10b the period is inclusive at its start and exclusive at its end; a pass with no end is nothing',
    [
      isBillingEntitlementActive(boundary, NOW),
      isBillingEntitlementActive({ ...boundary, current_period_end: NOW.toISOString() }, NOW),
      isBillingEntitlementActive({ ...boundary, current_period_end: null }, NOW),
      isBillingEntitlementActive({ ...boundary, product_key: 'scan_pack_8' }, NOW),
      isBillingEntitlementActive({ ...boundary, status: 'incomplete' }, NOW),
    ],
    [true, false, false, false, false]
  )

  check('11 somebody else\'s active subscription grants this account nothing', [(await proOf(OTHER)).pro, (await proOf(FREE)).pro], [true, false])
  check('11b not even when that person\'s profile is handed in', (await resolveEntitlements(client, { id: OTHER, plan: 'free', scans_used: 0 }, identity(FREE), ledgerOn, NOW)).pro, false)
  const claims = { ...identity(FREE), pro: true, plan: 'pro', founder: true, proSource: 'annual' } as AuthIdentity
  check('12 an identity carrying pro, plan or founder claims is still just that account', (await resolveProEntitlement(client, claims, NOW)).pro, false)
  check('12b a legacy paid plan name on the profile is not ABC Pro', [(await resolveEntitlements(client, { id: FREE, plan: 'pro', scans_used: 0 }, identity(FREE), {}, NOW)).pro, (await resolveEntitlements(client, { id: FREE, plan: 'team', scans_used: 0 }, identity(FREE), {}, NOW)).pro], [false, false])
  check('12c no gated route reads pro, plan or founder from the request', GATED.filter((g) => /body\.(pro|plan|founder|isPro|proSource)\b|searchParams\.get\(['"](pro|plan|founder)['"]/.test(code(g.file))).map((g) => g.file), [])

  const rows = await count(db, 'select count(*)::int as n from public.billing_entitlements where user_id = $1', [MONTHLY_OFF])
  check('R1 reactivation: a new active state from Stripe restores Pro on the same record', [await entitle(db, MONTHLY_OFF, 'pro_monthly', 'active', at(-1), at(29), false, 'sub_TESTmonthly002', at(0.01)), (await proOf(MONTHLY_OFF)).pro, await count(db, 'select count(*)::int as n from public.billing_entitlements where user_id = $1', [MONTHLY_OFF])], ['applied', true, rows])

  // ═══════════════════ SMART SCAN IS SEPARATE ═══════════════════

  await db.query('update public.abc_profiles set scans_used = 3 where id = any($1::uuid[])', [[MONTHLY, FREE]])
  const proNoCredits = await resolveEntitlements(client, { id: MONTHLY, plan: 'free', scans_used: 3 }, identity(MONTHLY), ledgerOn, NOW)
  check('13 a Pro subscriber with no Smart Scan credits still cannot scan', [proNoCredits.pro, proNoCredits.unmetered, proNoCredits.scanAvailable, proNoCredits.scanCreditBalance], [true, false, 0, 0])
  await grantScanCredits(client, { userId: FREE, amount: 2, kind: 'grant', source: 'manual', sourceRef: null, productKey: null, idempotencyKey: 'test:grant:free' })
  const freeWithCredits = await resolveEntitlements(client, { id: FREE, plan: 'free', scans_used: 3 }, identity(FREE), ledgerOn, NOW)
  check('14 a Free account with credits may scan', [freeWithCredits.pro, freeWithCredits.scanAvailable, freeWithCredits.scanCreditBalance], [false, 2, 2])
  const founderAll = await resolveEntitlements(client, { id: FOUNDER_ID, plan: 'free', scans_used: 99 }, identity(FOUNDER_ID, FOUNDER_EMAIL), ledgerOn, NOW)
  check('15 the founder stays unmetered, with no balance to spend', [founderAll.pro, founderAll.unmetered, founderAll.scanCreditBalance, await count(db, 'select count(*)::int as n from public.scan_credit_ledger where user_id = $1', [FOUNDER_ID])], [true, true, null, 0])
  check(
    '15b no scanning route asks about Pro',
    ['app/api/card/scan/route.ts', 'app/api/scan/batch/[id]/detect/route.ts', 'app/api/scan/batch/[id]/save/route.ts', 'lib/scan/entitlement.ts', 'lib/scan/batch-store.ts'].filter((f) => /lib\/entitlements|resolveProEntitlement|requirePro|\.pro\b/.test(code(f))),
    []
  )

  // ═══════════════════ THE GATE ═══════════════════

  const freeGate = await requirePro(client, identity(FREE), 'gmail', NOW)
  check('33 a Free account calling a Pro action gets a controlled 403 pro_required', freeGate, { ok: false, status: 403, body: { error: PRO_FEATURE_MESSAGES.gmail, code: PRO_REQUIRED, feature: 'gmail' } })
  check('33b which the screens recognise, and never a fake success', [isProRequired(freeGate.ok ? null : freeGate.body), freeGate.ok], [true, false])
  check('33c no identity is a 401, not a Pro question', await requirePro(client, null, 'crm', NOW), { ok: false, status: 401, body: { error: 'Unauthorized' } })
  check('33d a navigation that needs Pro lands on the plan page with the reason', proRequiredPath('crm'), '/settings/billing?pro=required&feature=crm')

  for (const gate of GATED) {
    const { src, call, feature, work } = gateOrder(gate)
    check(`G  ${gate.file} gates '${gate.feature}' with the verified user before any paid work`, [src.includes('auth.getUser()'), src.includes('auth.getSession()'), call > -1, feature > call, work > call], [true, false, true, true, true])
    check(
      `G  ${gate.file} answers a refusal honestly`,
      gate.kind === 'json' ? src.includes('if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status })') : src.includes(`proRequiredPath('${gate.feature}')`),
      true
    )
    check(`G  ${gate.file} passes the session user, not anything from the request`, /requirePro\([^,]+, user, '/.test(src), true)
  }
  check('G  every free route stays ungated', FREE_ROUTES.filter((f) => /requirePro|lib\/entitlements/.test(code(f))), [])

  // ═══════════════════ GMAIL ═══════════════════

  const googleLogin = code('lib/google-oauth.ts')
  const signIn = googleLogin.slice(googleLogin.indexOf('export async function signInWithGoogle'), googleLogin.indexOf('export function isGoogleProvider'))
  check('16 signing in with Google is free: the login flow has no Pro gate', ['app/auth/callback/route.ts', 'lib/google-oauth.ts', 'lib/apple-oauth.ts'].filter((f) => /requirePro|lib\/entitlements/.test(code(f))), [])
  check('17 a Free account cannot connect or send Gmail', [(await requirePro(client, identity(FREE), 'gmail', NOW)).ok, GATED.filter((g) => g.feature === 'gmail').length], [false, 4])
  check('18 a Pro account reaches the Gmail connector', [(await requirePro(client, identity(MONTHLY), 'gmail', NOW)).ok, (await requirePro(client, identity(PASS), 'gmail', NOW)).ok, (await requirePro(client, identity(FOUNDER_ID, FOUNDER_EMAIL), 'gmail', NOW)).ok], [true, true, true])
  await db.query("update public.abc_profiles set google_connected = true, google_refresh_token = 'stored-refresh-token', google_access_token = 'stored-access-token' where id = $1", [PASS_EXPIRED])
  const lapsedGmail = await requirePro(client, identity(PASS_EXPIRED), 'gmail', NOW)
  const tokens = (await db.query<{ google_connected: boolean; google_refresh_token: string }>('select google_connected, google_refresh_token from public.abc_profiles where id = $1', [PASS_EXPIRED])).rows[0]
  check('19 when Pro lapses sending stops, and the stored Gmail connection is untouched', [lapsedGmail.ok, tokens.google_connected, tokens.google_refresh_token], [false, true, 'stored-refresh-token'])
  check('19b the entitlement code cannot touch a token: it never writes', /\.update\(|\.delete\(|\.insert\(|\.upsert\(|google_|refresh_token|access_token/.test(code('lib/entitlements.ts')), false)
  check('20 a normal Google sign-in asks for identity only, never the Gmail scope', [/scopes\s*:/.test(signIn), /GOOGLE_GMAIL_SCOPE|gmail\.send|gmail/i.test(signIn)], [false, false])

  // ═══════════════════ CRM ═══════════════════

  for (const [label, provider] of [['21', 'hubspot'], ['22', 'salesforce'], ['23', 'pipedrive']] as const) {
    const start = GATED.find((g) => g.file === `app/api/auth/${provider}/route.ts`)
    const callback = GATED.find((g) => g.file === `app/api/auth/${provider}/callback/route.ts`)
    const startOrder = start ? gateOrder(start) : null
    const callbackOrder = callback ? gateOrder(callback) : null
    const saveAt = callbackOrder ? callbackOrder.src.indexOf('saveCrmConnection(') : -1
    check(
      `${label} a Free account cannot start ${provider}, and its callback stores nothing for one`,
      [(await requirePro(client, identity(FREE), 'crm', NOW)).ok, Boolean(startOrder && startOrder.work > startOrder.call), Boolean(callbackOrder && saveAt > callbackOrder.call)],
      [false, true, true]
    )
  }
  check('23b nor push a contact or a batch to any CRM', ['app/api/crm/export/route.ts', 'app/api/scan/batch/[id]/export/route.ts'].filter((f) => !GATED.some((g) => g.file === f && g.feature === 'crm')), [])
  check('24 a Pro account can start and push to each', [(await requirePro(client, identity(ANNUAL), 'crm', NOW)).ok, (await requirePro(client, identity(PASS), 'crm', NOW)).ok], [true, true])

  const lapsedContact = (await db.query<{ id: string }>("insert into public.scanned_contacts (user_id, name) values ($1, 'Met At MEDICA') returning id", [PASS_EXPIRED])).rows[0].id
  const lapsedEncounter = (await db.query<{ id: string }>("insert into public.contact_encounters (contact_id, user_id, event, discussed) values ($1, $2, 'MEDICA 2026', 'Demo booked') returning id", [lapsedContact, PASS_EXPIRED])).rows[0].id
  await db.query("insert into public.crm_object_mappings (user_id, provider, local_object_type, local_object_id, remote_object_type, remote_object_id) values ($1, 'hubspot', 'encounter', $2, 'meeting', 'hs-meeting-1')", [PASS_EXPIRED, lapsedEncounter])
  await db.query("insert into public.crm_connections (user_id, provider) values ($1, 'hubspot')", [PASS_EXPIRED])
  const lapsedCrm = await requirePro(client, identity(PASS_EXPIRED), 'crm', NOW)
  check('25 after Pro lapses the pushed-record history is still there to show', [lapsedCrm.ok, await count(db, 'select count(*)::int as n from public.crm_object_mappings where user_id = $1', [PASS_EXPIRED])], [false, 1])
  check('25b and connection status stays readable', FREE_ROUTES.includes('app/api/crm/connections/route.ts') && !/requirePro/.test(code('app/api/crm/connections/route.ts')), true)
  check('26 a lapse never disconnects: the connection row stays and disconnect remains the owner\'s choice', [await count(db, 'select count(*)::int as n from public.crm_connections where user_id = $1', [PASS_EXPIRED]), /deleteCrmConnection|crm_connections|crm_object_mappings/.test(code('lib/entitlements.ts'))], [1, false])

  // ═══════════════════ FOLLOW-UP ═══════════════════

  check('27 a Free account cannot draft a Smart Follow-up or schedule a sequence', [(await requirePro(client, identity(FREE), 'smart_follow_up', NOW)).ok, (await requirePro(client, identity(FREE), 'follow_up_sequence', NOW)).ok], [false, false])
  check('28 a Pro account can', [(await requirePro(client, identity(MONTHLY), 'smart_follow_up', NOW)).ok, (await requirePro(client, identity(ANNUAL), 'follow_up_sequence', NOW)).ok], [true, true])
  check('28b the sequence gate comes before the existing schedule is replaced', (() => { const { call, work } = gateOrder(GATED.find((g) => g.feature === 'follow_up_sequence') as Gate); return work > call })(), true)
  check(
    '29 after Pro lapses the meeting and its follow-up state are still the owner\'s to read and complete',
    [await count(db, 'select count(*)::int as n from public.contact_encounters where user_id = $1', [PASS_EXPIRED]), FREE_ROUTES.includes('app/api/follow-ups/route.ts')],
    [1, true]
  )
  check('29b no contact screen or contact read is gated', [...listFiles('app/contacts'), ...listFiles('components/contacts')].filter((f) => /\.(ts|tsx)$/.test(f) && /requirePro|lib\/entitlements/.test(code(f))), [])

  // ═══════════════════ EVENTS ═══════════════════

  const eventFiles = [...listFiles('app/events'), ...listFiles('components/events'), ...listFiles('lib/events')].filter((f) => /\.(ts|tsx)$/.test(f))
  check('30 the Event Workspace is not gated', [eventFiles.length > 0, eventFiles.filter((f) => /requirePro|lib\/entitlements|resolveProEntitlement/.test(code(f)))], [true, []])
  check('31 its event memory reads the owner\'s own encounters', /contact_encounters/.test(code('lib/events/data.ts')), true)
  check('32 it holds no paid workflow action that would need a gate', eventFiles.filter((f) => /send-gmail|\/api\/crm\/export|\/export['`]|\/api\/contact\/message|\/api\/enrich\/messages|\/api\/card\/followup/.test(code(f))), [])

  // ═══════════════════ SECURITY ═══════════════════

  check('34 nobody can ask for somebody else\'s entitlement: the resolver takes an identity, and the status route reads only the session', [resolveProEntitlement.length >= 2, /searchParams|req\.json|request\.json|body\./.test(code('app/api/billing/status/route.ts'))], [true, false])
  check('35 founder access is the verified identity: an unconfirmed founder address is not the founder', (await resolveProEntitlement(client, { id: FREE, email: FOUNDER_EMAIL }, NOW)).pro, false)
  check('35b nor is a profile that merely stores the founder address', (await resolveEntitlements(client, { id: FREE, plan: 'free', email: FOUNDER_EMAIL, scans_used: 0 }, identity(FREE), {}, NOW)).pro, false)

  // ═══════════════════ BILLING STATUS ═══════════════════

  const statusOf = (userId: string, email?: string) => readBillingStatus(client, { id: userId, plan: 'free', scans_used: 0 }, identity(userId, email), {}, NOW)
  const sFree = await statusOf(FREE)
  const sPass = await statusOf(PASS)
  const sMonthly = await statusOf(MONTHLY)
  const sAnnual = await statusOf(ANNUAL)
  const sExpired = await statusOf(PASS_EXPIRED)
  const sFounder = await statusOf(FOUNDER_ID, FOUNDER_EMAIL)
  check('36 status says Free truthfully', [sFree.pro.active, sFree.pro.viaFounder, sFree.pro.source, sFree.pro.endsAt], [false, false, 'none', null])
  check('37 status names where Pro comes from', [sPass.pro.source, sMonthly.pro.source, sAnnual.pro.source], ['event_pass', 'monthly', 'annual'])
  check('38 and when it ends or renews', [[sPass.pro.endsAt, sPass.pro.renews], [sMonthly.pro.endsAt, sMonthly.pro.renews], [sAnnual.pro.endsAt, sAnnual.pro.renews]], [[at(4), false], [at(20), true], [at(265), false]])
  check('38b an expired pass reads as not active, with the date it ended', [sExpired.pro.active, sExpired.pro.source, sExpired.pro.productKey, sExpired.pro.currentPeriodEnd], [false, 'none', 'pro_event', at(-5)])
  check('39 status reports founder access truthfully, with Stripe unconfigured', [sFounder.pro.active, sFounder.pro.viaFounder, sFounder.pro.source, sFounder.stripeConfigured], [true, true, 'founder', false])
  check('40 no Stripe id of any kind reaches a status', /sub_|cs_|cus_|price_|pi_|whsec_|sk_(test|live)/.test(JSON.stringify([sFree, sPass, sMonthly, sAnnual, sExpired, sFounder])), false)

  // ═══════════════════ SCREENS ═══════════════════

  const note = read('components/billing/ProRequiredNote.tsx')
  const billingView = read('components/settings/BillingSettingsView.tsx')
  const integrationsView = read('components/settings/IntegrationsSettingsView.tsx')
  check('U1 the ABC Pro note names no price and sells nothing', /€|\$\s?\d|\bEUR\b|\bUSD\b|per month|\/pricing|checkout/i.test(note), false)
  check('U2 the plan page offers ABC Pro only when it can really be bought, and names no price', billingView.includes('proProducts.filter((product) => product.available)') && billingView.includes('isn’t available to buy yet') && !/€|\$\s?\d|\bEUR\b|\bUSD\b|per month|\/mo\b/.test(billingView), true)
  check('U3 integrations: a Free owner is told CRM sync is ABC Pro, offered no connect, and can still disconnect', /pro \? \(\s*<a\s+href=\{provider\.connectPath\}/.test(integrationsView) && integrationsView.includes('<ProRequiredNote feature="crm" />') && integrationsView.includes('/disconnect'), true)
  check('U4 both settings pages resolve Pro from the verified session', [code('app/settings/billing/page.tsx').includes('auth.getUser()') && code('app/settings/billing/page.tsx').includes('readBillingStatus('), code('app/settings/integrations/page.tsx').includes('auth.getUser()') && code('app/settings/integrations/page.tsx').includes('resolveProEntitlement(')], [true, true])
  check('U5 every refusal and every screen use one set of sentences', /PRO_FEATURE_MESSAGES/.test(code('lib/billing/pro-features.ts')) && /proRequiredBody\(feature\)/.test(code('lib/entitlements.ts')) && /PRO_FEATURE_MESSAGES/.test(code('components/billing/ProRequiredNote.tsx')), true)

  await db.close()

  const total = passed + failures.length
  if (failures.length) {
    console.log(`\nABC Pro: ${passed}/${total} PASS, ${failures.length} FAILED\n`)
    for (const failure of failures) console.log('  FAIL ' + failure)
    process.exit(1)
  }
  console.log(`\nABC Pro: ${passed}/${total} PASS`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
