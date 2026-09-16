/**
 * Native connector OAuth regression suite.
 *
 * Run with `npm run test:native-connectors` from the repository root.
 *
 * Connecting Gmail, HubSpot, Salesforce and Pipedrive from inside the native app
 * (lib/connectors/native.ts), in PGlite over every migration in the repository
 * with Supabase's default privileges emulated. Providers are replaced by a fake
 * exchange that records what it was given; nothing here reaches Google, a CRM
 * or Supabase. The token key is generated for this run and exists nowhere else.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

process.env.CRM_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64')
delete process.env.NEXT_PUBLIC_SUPABASE_URL
delete process.env.SUPABASE_SERVICE_ROLE_KEY

import { decryptToken, encryptToken } from '@/lib/crm/encryption'
import {
  claimNativeConnector,
  finishNativeConnectorCallback,
  isNativeConnectorState,
  nativeConnectHandbackUrl,
  startNativeConnector,
  type ExchangeOutcome,
  type NativeConnectorResult,
  type PersistDeps,
} from '@/lib/connectors/native'
import { nativeConnectorCallback } from '@/lib/connectors/native-callback'
import { nativePkceFor } from '@/lib/connectors/native-providers'
import {
  NATIVE_CONNECTOR_PROVIDERS,
  nativeConnectDestination,
  nativeConnectorStartFromHref,
  type NativeConnectorProvider,
} from '@/lib/connectors/native-shared'
import { hashNativeNonce } from '@/lib/native/auth-flow'
import { parseNativeDeepLink } from '@/lib/native/deep-link'
import { nativeHandbackPage } from '@/lib/native/handback-page'

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
const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('base64url')

const MIGRATION = 'supabase/migrations/20260917120000_native_connector_attempts.sql'
const DELETION_MIGRATION = 'supabase/migrations/20260916120000_account_deletion.sql'

const OWNER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const FREE = '33333333-3333-4333-8333-333333333333'
const confirmed = '2026-01-01T00:00:00.000Z'
const identity = (id: string) => ({ id, email: `${id.slice(0, 4)}@example.com`, email_confirmed_at: confirmed })

// ─────────────────────────── DATABASE ───────────────────────────

async function freshDatabase(): Promise<PGlite> {
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
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `)
  await db.exec(read('supabase/schema.sql').replace(/create extension[^;]+;/i, ''))
  await db.exec('alter table public.abc_profiles add column if not exists card_bio text')
  for (const file of fs.readdirSync(path.join(ROOT, 'supabase/migrations')).sort()) {
    try {
      await db.exec(read(`supabase/migrations/${file}`))
    } catch (err) {
      // Environment-only failures are pinned by test:account-deletion; this suite
      // only needs its own migration to apply, and checks that below.
      if (file === path.basename(MIGRATION)) throw err
    }
  }
  return db
}

type Role = 'service_role' | 'authenticated' | 'anon'

async function asRole<T = Record<string, unknown>>(db: PGlite, role: Role | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    if (role) await tx.exec(`set local role ${role}`)
    return tx.query<T>(sql, params)
  })
}

const SCALAR = new Set(['create_native_connector_attempt', 'complete_native_connector_callback', 'fail_native_connector_attempt'])

function serviceClient(db: PGlite, calls: string[]): SupabaseClient {
  const failure = (err: unknown) => ({ data: null, error: { code: (err as { code?: string }).code ?? 'unknown', message: String(err) } })

  async function rpc(name: string, params: Record<string, unknown>) {
    calls.push(`rpc:${name}`)
    const keys = Object.keys(params)
    const args = keys.map((key, i) => `${key} => $${i + 1}`).join(', ')
    const values = keys.map((key) => params[key])
    try {
      if (SCALAR.has(name)) {
        const result = await asRole<{ result: unknown }>(db, 'service_role', `select public.${name}(${args}) as result`, values)
        return { data: result.rows[0]?.result ?? null, error: null }
      }
      return { data: (await asRole(db, 'service_role', `select * from public.${name}(${args})`, values)).rows, error: null }
    } catch (err) {
      return failure(err)
    }
  }

  function from(table: string) {
    const filters: { column: string; value: unknown }[] = []
    let columns = '*'
    const builder = {
      select(cols = '*') {
        columns = cols
        return builder
      },
      eq(column: string, value: unknown) {
        filters.push({ column, value })
        return builder
      },
      then(resolve: (value: unknown) => void, reject: (err: unknown) => void) {
        const where = filters.length ? ' where ' + filters.map((f, i) => `${f.column} = $${i + 1}`).join(' and ') : ''
        asRole(db, 'service_role', `select ${columns} from public.${table}${where}`, filters.map((f) => f.value))
          .then((r) => ({ data: r.rows, error: null }), failure)
          .then(resolve, reject)
      },
    }
    return builder
  }

  return { rpc, from } as unknown as SupabaseClient
}

const rowsOf = async <T = Record<string, unknown>>(db: PGlite, sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows
const count = async (db: PGlite, sql: string, params: unknown[] = []) => Number((await db.query<{ n: number }>(sql, params)).rows[0].n)
const attemptRow = async (db: PGlite, id: string) => (await rowsOf<Record<string, unknown>>(db, 'select * from public.native_connector_attempts where id = $1', [id]))[0]

// ─────────────────────────── FAKES ───────────────────────────

const exchangeCalls: { provider: string; code: string; verifier: string | null }[] = []

function fakeResult(provider: NativeConnectorProvider, tag: string): NativeConnectorResult {
  if (provider === 'google-gmail') {
    return { kind: 'gmail', accessToken: `ya29.access-${tag}`, refreshToken: `1//refresh-${tag}`, expiresAt: new Date(Date.now() + 3_600_000).toISOString(), email: 'sales@example.com' }
  }
  return {
    kind: 'crm',
    provider,
    accessToken: `${provider}-access-${tag}`,
    refreshToken: `${provider}-refresh-${tag}`,
    expiresAt: provider === 'salesforce' ? null : new Date(Date.now() + 1_800_000).toISOString(),
    remoteAccountId: `${provider}-account`,
    apiBaseUrl: provider === 'hubspot' ? null : `https://acme.${provider}.example`,
  }
}

async function fakeExchange(provider: NativeConnectorProvider, providerCode: string, verifier: string | null): Promise<ExchangeOutcome> {
  exchangeCalls.push({ provider, code: providerCode, verifier })
  if (providerCode === 'code-no-token') return { ok: false, code: 'token_exchange_failed' }
  return { ok: true, result: fakeResult(provider, providerCode) }
}

let authorizeBuilds = 0
const unconfigured = new Set<NativeConnectorProvider>()
function fakeAuthorizeUrl(provider: NativeConnectorProvider, state: string, challenge: string | null): string | null {
  authorizeBuilds++
  if (unconfigured.has(provider)) return null
  const url = new URL(`https://provider.example/${provider}/authorize`)
  url.searchParams.set('redirect_uri', `https://www.abccard.io/api/auth/${provider}/callback`)
  url.searchParams.set('state', state)
  if (challenge) url.searchParams.set('code_challenge', challenge)
  return url.toString()
}

function persistInto(db: PGlite, saves: string[]): PersistDeps {
  return {
    async saveCrm(args) {
      saves.push(`crm:${args.provider}:${args.ownerId}`)
      // The shape saveCrmConnection writes: tokens encrypted, upserted per owner and provider.
      await db.query(
        `insert into public.crm_connections (user_id, provider, access_token_encrypted, refresh_token_encrypted, remote_account_id, remote_api_base_url)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (user_id, provider) do update set access_token_encrypted = excluded.access_token_encrypted`,
        [args.ownerId, args.provider, encryptToken(args.accessToken), args.refreshToken ? encryptToken(args.refreshToken) : null, args.remoteAccountId, args.apiBaseUrl]
      )
      return true
    },
    async saveGmail(ownerId, tokens) {
      saves.push(`gmail:${ownerId}:${tokens.expiresIn !== null && tokens.expiresIn > 3000}`)
      await db.query('update public.abc_profiles set google_connected = true, google_email = $2 where id = $1', [ownerId, tokens.email])
    },
  }
}

const nonce = () => randomBytes(32).toString('base64url')

async function quietly<T>(fn: () => Promise<T>): Promise<{ value: T; logs: string[] }> {
  const logs: string[] = []
  const original = console.error
  console.error = (...args: unknown[]) => logs.push(args.map(String).join(' '))
  try {
    return { value: await fn(), logs }
  } finally {
    console.error = original
  }
}

// ─────────────────────────── RUN ───────────────────────────

async function run() {
  const db = await freshDatabase()
  const calls: string[] = []
  const service = serviceClient(db, calls)
  const saves: string[] = []
  const persist = persistInto(db, saves)
  const startDeps = { db: service, authorizeUrl: fakeAuthorizeUrl, pkceFor: nativePkceFor }
  const callbackDeps = { db: service, exchange: fakeExchange }
  const claimDeps = { db: service, persist }

  for (const id of [OWNER, OTHER, FREE]) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${id.slice(0, 4)}@example.com`])
  }
  for (const id of [OWNER, OTHER]) {
    await db.query(
      "insert into public.billing_entitlements (user_id, product_key, status, stripe_subscription_id, current_period_start, current_period_end) values ($1, 'pro_monthly', 'active', $2, now() - interval '1 day', now() + interval '20 days')",
      [id, `sub_test_${id.slice(0, 4)}`]
    )
  }

  const start = (who: string | null, provider: unknown, nonceHash: unknown, returnTo: unknown = null) =>
    quietly(() => startNativeConnector(startDeps, { identity: who ? identity(who) : null, provider, nonceHash, returnTo })).then((r) => r.value)
  const stateOf = (authorizeUrl: string) => new URL(authorizeUrl).searchParams.get('state') as string
  const callback = (provider: NativeConnectorProvider, params: { code: string | null; state: string | null; error: string | null }) =>
    quietly(() => finishNativeConnectorCallback(callbackDeps, provider, params)).then((r) => r.value)
  const claim = (who: string | null, args: { attemptId: unknown; nonce: unknown; handoff: unknown }) =>
    quietly(() => claimNativeConnector(claimDeps, { identity: who ? identity(who) : null, ...args })).then((r) => r.value)

  // ═══════════════════ START ═══════════════════

  const n1 = nonce()
  check('S1 a signed-out start is refused before anything is recorded', [await start(null, 'hubspot', hashNativeNonce(n1)), await count(db, 'select count(*)::int as n from public.native_connector_attempts')], [{ ok: false, status: 401, code: 'unauthorized' }, 0])
  const buildsBefore = authorizeBuilds
  check(
    'S2 a Free account is sent to Plan & Billing for Gmail and for a CRM, and no provider URL is built',
    [await start(FREE, 'google-gmail', hashNativeNonce(n1)), await start(FREE, 'pipedrive', hashNativeNonce(n1)), authorizeBuilds - buildsBefore, await count(db, 'select count(*)::int as n from public.native_connector_attempts')],
    [{ ok: false, status: 403, code: 'pro_required', redirect: '/settings/billing?pro=required&feature=gmail' }, { ok: false, status: 403, code: 'pro_required', redirect: '/settings/billing?pro=required&feature=crm' }, 0, 0]
  )
  check(
    'S3 an unknown provider, or a nonce hash of the wrong shape, is refused',
    [await start(OWNER, 'github', hashNativeNonce(n1)), await start(OWNER, 'google', hashNativeNonce(n1)), await start(OWNER, 'hubspot', 'short'), await start(OWNER, 'hubspot', n1 + 'x')],
    Array(4).fill({ ok: false, status: 400, code: 'invalid_request' })
  )
  unconfigured.add('pipedrive')
  check('S4 an unconfigured provider is unavailable, and nothing is recorded', [await start(OWNER, 'pipedrive', hashNativeNonce(n1)), await count(db, 'select count(*)::int as n from public.native_connector_attempts')], [{ ok: false, status: 503, code: 'connector_unavailable' }, 0])
  unconfigured.delete('pipedrive')

  const flows: Record<string, { nonce: string; attemptId: string; state: string; authorizeUrl: string }> = {}
  for (const provider of NATIVE_CONNECTOR_PROVIDERS) {
    const n = nonce()
    const started = await start(OWNER, provider, hashNativeNonce(n), provider === 'google-gmail' ? '/chat/42' : '/should-be-ignored')
    if (!started.ok) throw new Error(`start failed for ${provider}: ${JSON.stringify(started)}`)
    flows[provider] = { nonce: n, attemptId: started.attemptId, state: stateOf(started.authorizeUrl), authorizeUrl: started.authorizeUrl }
  }

  const gmail = flows['google-gmail']
  const gmailRow = await attemptRow(db, gmail.attemptId)
  check(
    'A1 the attempt binds the session owner, the provider and the nonce hash; state and nonce are stored only as hashes',
    [gmailRow.user_id, gmailRow.provider, gmailRow.nonce_hash === hashNativeNonce(gmail.nonce), gmailRow.state_hash === sha256(gmail.state), gmailRow.status, gmailRow.return_to],
    [OWNER, 'google-gmail', true, true, 'pending', '/chat/42']
  )
  const everyRow = JSON.stringify(await rowsOf(db, 'select * from public.native_connector_attempts'))
  check('A2 no state, nonce or owner email appears anywhere in the table', Object.values(flows).some((f) => everyRow.includes(f.state) || everyRow.includes(f.nonce)) || everyRow.includes('@example.com'), false)
  const ttl = await rowsOf<{ seconds: number }>(db, 'select extract(epoch from (expires_at - created_at))::int as seconds from public.native_connector_attempts where id = $1', [gmail.attemptId])
  check('A3 attempts expire ten minutes after they start; a CRM ignores the requested return path', [ttl[0].seconds, (await attemptRow(db, flows.hubspot.attemptId)).return_to], [600, null])
  const sfRow = await attemptRow(db, flows.salesforce.attemptId)
  const sfVerifier = decryptToken(sfRow.pkce_verifier_encrypted as string)
  check(
    'A4 Salesforce: the PKCE verifier is stored encrypted, and the challenge sent is its S256; the others carry no verifier',
    [String(sfRow.pkce_verifier_encrypted).startsWith('v1:'), new URL(flows.salesforce.authorizeUrl).searchParams.get('code_challenge') === sha256(sfVerifier ?? ''), (await attemptRow(db, flows.hubspot.attemptId)).pkce_verifier_encrypted],
    [true, true, null]
  )
  check(
    'A5 the state is the signed native shape; a web state is not; the authorize URL carries no owner and no nonce',
    [isNativeConnectorState(gmail.state), isNativeConnectorState(randomBytes(32).toString('base64url')), Object.values(flows).some((f) => f.authorizeUrl.includes(OWNER) || f.authorizeUrl.includes(f.nonce) || f.authorizeUrl.includes(hashNativeNonce(f.nonce)))],
    [true, false, false]
  )

  // ═══════════════════ CALLBACK ═══════════════════

  // Wrong provider first: the HubSpot attempt answered on the Pipedrive callback.
  const crossed = await callback('pipedrive', { code: 'code-crossed', state: flows.hubspot.state, error: null })
  check('C1 a state issued for one provider fails on another provider’s callback, and leaves its attempt untouched', [crossed, (await attemptRow(db, flows.hubspot.attemptId)).status], [{ kind: 'failed', attemptId: null }, 'pending'])

  const forged = flows.hubspot.state.replace(/.$/, flows.hubspot.state.endsWith('A') ? 'B' : 'A').replace(/\.([A-Za-z0-9_-])/, (_m, c) => `.${c === 'x' ? 'y' : 'x'}`)
  calls.length = 0
  check('C2 a forged state fails before the database is asked anything', [await callback('hubspot', { code: 'code-forged', state: forged, error: null }), calls], [{ kind: 'failed', attemptId: null }, []])

  const handoffs: Record<string, string> = {}
  for (const provider of NATIVE_CONNECTOR_PROVIDERS) {
    const target = await callback(provider, { code: `code-${provider}`, state: flows[provider].state, error: null })
    if (target.kind !== 'authorized') throw new Error(`callback failed for ${provider}`)
    handoffs[provider] = target.handoff
    check(`C3 ${provider}: the callback exchanges the code and hands back only the attempt and a handoff`, [target.attemptId === flows[provider].attemptId, /^[A-Za-z0-9_-]{43}$/.test(target.handoff)], [true, true])
  }
  check(
    'C4 the exchange gets the decrypted PKCE verifier for Salesforce and none for the others',
    exchangeCalls.filter((c) => c.code.startsWith('code-') && c.code !== 'code-crossed').map((c) => [c.provider, c.verifier === null ? null : c.verifier === sfVerifier]),
    [['google-gmail', null], ['hubspot', null], ['salesforce', true], ['pipedrive', null]]
  )
  const authorized = await attemptRow(db, flows.hubspot.attemptId)
  check(
    'C5 tokens are held encrypted; the handoff only as a hash; the verifier is gone once used',
    [authorized.status, String(authorized.result_encrypted).startsWith('v1:'), String(authorized.result_encrypted).includes('hubspot-access'), authorized.handoff_hash === sha256(handoffs.hubspot), (await attemptRow(db, flows.salesforce.attemptId)).pkce_verifier_encrypted],
    ['authorized', true, false, true, null]
  )
  const handback = nativeConnectHandbackUrl({ kind: 'authorized', attemptId: flows.hubspot.attemptId, handoff: handoffs.hubspot })
  const handbackUrl = new URL(handback)
  check(
    'C6 the deep link names the app, the attempt and the handoff — no token, verifier, owner, nonce or state',
    [`${handbackUrl.protocol}//${handbackUrl.host}${handbackUrl.pathname}`, [...handbackUrl.searchParams.keys()], [OWNER, flows.hubspot.nonce, flows.hubspot.state, 'hubspot-access', 'refresh', 'v1:'].some((secret) => handback.includes(secret))],
    ['io.abccard.app://connect/callback', ['attempt', 'handoff'], false]
  )

  const exchangesBefore = exchangeCalls.length
  check('C7 a replayed callback finds nothing and exchanges nothing', [await callback('hubspot', { code: 'code-hubspot', state: flows.hubspot.state, error: null }), exchangeCalls.length - exchangesBefore, (await attemptRow(db, flows.hubspot.attemptId)).status], [{ kind: 'failed', attemptId: null }, 0, 'authorized'])

  const extra = async (provider: NativeConnectorProvider) => {
    const n = nonce()
    const started = await start(OWNER, provider, hashNativeNonce(n))
    if (!started.ok) throw new Error('extra start failed')
    return { nonce: n, attemptId: started.attemptId, state: stateOf(started.authorizeUrl) }
  }
  const cancelled = await extra('hubspot')
  const refusedAtProvider = await callback('hubspot', { code: null, state: cancelled.state, error: 'access_denied' })
  const erroring = await extra('pipedrive')
  const errored = await callback('pipedrive', { code: null, state: erroring.state, error: 'invalid_scope' })
  const codeless = await extra('salesforce')
  const noCode = await callback('salesforce', { code: null, state: codeless.state, error: null })
  const tokenless = await extra('google-gmail')
  const noToken = await callback('google-gmail', { code: 'code-no-token', state: tokenless.state, error: null })
  check(
    'C8 cancelling at the provider, a provider error, a missing code and a missing token each end the attempt with a code and nothing secret left',
    [
      [refusedAtProvider, errored, noCode, noToken].map((t) => t.kind),
      await Promise.all([cancelled, erroring, codeless, tokenless].map(async (a) => {
        const row = await attemptRow(db, a.attemptId)
        return [row.status, row.failure_code, row.result_encrypted, row.pkce_verifier_encrypted, row.handoff_hash]
      })),
    ],
    [['cancelled', 'failed', 'failed', 'failed'], [['failed', 'provider_cancelled', null, null, null], ['failed', 'provider_error', null, null, null], ['failed', 'missing_code', null, null, null], ['failed', 'token_exchange_failed', null, null, null]]]
  )
  check('C9 a cancelled attempt hands back "cancelled", a failed one "failed", each naming its attempt', [nativeConnectHandbackUrl(refusedAtProvider), nativeConnectHandbackUrl(noToken)], [`io.abccard.app://connect/callback?attempt=${cancelled.attemptId}&result=cancelled`, `io.abccard.app://connect/callback?attempt=${tokenless.attemptId}&result=failed`])

  const stale = await extra('hubspot')
  await db.query("update public.native_connector_attempts set expires_at = now() - interval '1 second' where id = $1", [stale.attemptId])
  check('C10 an expired attempt cannot be finished', await callback('hubspot', { code: 'code-late', state: stale.state, error: null }), { kind: 'failed', attemptId: null })

  // ═══════════════════ CLAIM ═══════════════════

  const hub = { attemptId: flows.hubspot.attemptId, nonce: flows.hubspot.nonce, handoff: handoffs.hubspot }
  check('L1 a signed-out claim is refused', await claim(null, hub), { ok: false, status: 401, code: 'unauthorized' })
  check(
    'L2 malformed claims are refused before the database',
    [await claim(OWNER, { ...hub, attemptId: 'not-a-uuid' }), await claim(OWNER, { ...hub, nonce: 'short' }), await claim(OWNER, { ...hub, handoff: 42 })],
    Array(3).fill({ ok: false, status: 400, code: 'invalid_request' })
  )
  check(
    'L3 another ABC account holding the attempt id, the handoff and even the owner’s nonce gets nothing, and the attempt survives',
    [await claim(OTHER, hub), (await attemptRow(db, hub.attemptId)).status, saves.length],
    [{ ok: false, status: 400, code: 'claim_failed' }, 'authorized', 0]
  )
  check(
    'L4 the owner with the wrong nonce — an intercepted deep link — gets nothing, and the attempt is not burned',
    [await claim(OWNER, { ...hub, nonce: nonce() }), (await attemptRow(db, hub.attemptId)).status],
    [{ ok: false, status: 400, code: 'claim_failed', redirect: '/settings/integrations?crm=hubspot-error' }, 'authorized']
  )
  check(
    'L5 the owner with the right nonce but without the handoff — an attempt somebody else consented to — gets nothing',
    [await claim(OWNER, { ...hub, handoff: randomBytes(32).toString('base64url') }), (await attemptRow(db, hub.attemptId)).status],
    [{ ok: false, status: 400, code: 'claim_failed', redirect: '/settings/integrations?crm=hubspot-error' }, 'authorized']
  )

  await db.query("update public.billing_entitlements set status = 'canceled' where user_id = $1", [OWNER])
  check('L6 Pro lapsed before the claim: refused with the Pro path, and the attempt is kept', [await claim(OWNER, hub), (await attemptRow(db, hub.attemptId)).status, saves.length], [{ ok: false, status: 403, code: 'pro_required', redirect: '/settings/billing?pro=required&feature=crm' }, 'authorized', 0])
  await db.query("update public.billing_entitlements set status = 'active' where user_id = $1", [OWNER])

  for (const provider of NATIVE_CONNECTOR_PROVIDERS) {
    const outcome = await claim(OWNER, { attemptId: flows[provider].attemptId, nonce: flows[provider].nonce, handoff: handoffs[provider] })
    const expected = provider === 'google-gmail' ? '/chat/42?gmail=connected' : `/settings/integrations?crm=${provider}-connected`
    check(`L7 ${provider}: the owner, holding nonce and handoff, connects and lands where the flow began`, outcome, { ok: true, provider, redirect: expected })
  }
  check(
    'L8 every connection was saved for the session owner, through the same save functions the web uses',
    saves,
    [`gmail:${OWNER}:true`, `crm:hubspot:${OWNER}`, `crm:salesforce:${OWNER}`, `crm:pipedrive:${OWNER}`]
  )
  check(
    'L9 connection status now shows all three CRMs and Gmail for the owner, and nothing for anybody else',
    [
      (await rowsOf<{ provider: string }>(db, 'select provider from public.crm_connections where user_id = $1 order by provider', [OWNER])).map((r) => r.provider),
      (await rowsOf<{ google_connected: boolean }>(db, 'select google_connected from public.abc_profiles where id = $1', [OWNER]))[0]?.google_connected,
      await count(db, 'select count(*)::int as n from public.crm_connections where user_id <> $1', [OWNER]),
    ],
    [['hubspot', 'pipedrive', 'salesforce'], true, 0]
  )
  check(
    'L10 a claimed attempt keeps nothing secret',
    await Promise.all(NATIVE_CONNECTOR_PROVIDERS.map(async (p) => {
      const row = await attemptRow(db, flows[p].attemptId)
      return [row.status, row.result_encrypted, row.handoff_hash, row.pkce_verifier_encrypted]
    })),
    Array(4).fill(['claimed', null, null, null])
  )
  const savesBefore = saves.length
  check('L11 a replayed claim gets nothing and saves nothing', [await claim(OWNER, hub), saves.length - savesBefore], [{ ok: false, status: 400, code: 'claim_failed', redirect: '/settings/integrations?crm=hubspot-error' }, 0])

  // The consent attack, end to end: OTHER starts, somebody else consents.
  const attackerNonce = nonce()
  const attackerStart = await start(OTHER, 'hubspot', hashNativeNonce(attackerNonce))
  if (!attackerStart.ok) throw new Error('attacker start failed')
  const victimConsent = await callback('hubspot', { code: 'code-victim', state: stateOf(attackerStart.authorizeUrl), error: null })
  check(
    'L12 an attempt started by one account and consented to on another device cannot be collected by the starter without that device’s handoff',
    [victimConsent.kind, await claim(OTHER, { attemptId: attackerStart.attemptId, nonce: attackerNonce, handoff: randomBytes(32).toString('base64url') }), await count(db, 'select count(*)::int as n from public.crm_connections where user_id = $1', [OTHER])],
    ['authorized', { ok: false, status: 400, code: 'claim_failed', redirect: '/settings/integrations?crm=hubspot-error' }, 0]
  )

  const lateClaim = await extra('pipedrive')
  const lateTarget = await callback('pipedrive', { code: 'code-pipedrive-late', state: lateClaim.state, error: null })
  await db.query("update public.native_connector_attempts set expires_at = now() - interval '1 second' where id = $1", [lateClaim.attemptId])
  check('L13 an expired authorized attempt cannot be claimed', await claim(OWNER, { attemptId: lateClaim.attemptId, nonce: lateClaim.nonce, handoff: lateTarget.kind === 'authorized' ? lateTarget.handoff : '' }), { ok: false, status: 400, code: 'claim_failed', redirect: '/settings/integrations?crm=pipedrive-error' })
  const beforeSweep = await count(db, 'select count(*)::int as n from public.native_connector_attempts where expires_at <= now()')
  await extra('hubspot')
  check('L14 starting a new attempt deletes every expired one, tokens and all', [beforeSweep > 0, await count(db, 'select count(*)::int as n from public.native_connector_attempts where expires_at <= now()')], [true, 0])

  // ═══════════════════ WEB FLOWS AND ROUTES ═══════════════════

  const webState = randomBytes(32).toString('base64url')
  const webResult = await nativeConnectorCallback(new NextRequest(`https://www.abccard.io/api/auth/hubspot/callback?code=abc&state=${webState}`), 'hubspot')
  check('W1 a web-shaped state is left to the web callback: the native branch returns nothing and touches nothing', webResult, null)

  const callbackRoutes = NATIVE_CONNECTOR_PROVIDERS.map((p) => code(`app/api/auth/${p}/callback/route.ts`))
  check(
    'W2 each callback takes the native branch first and keeps the web checks — signed cookie and matching session — unchanged below it',
    callbackRoutes.map((src, i) => [
      src.indexOf(`nativeConnectorCallback(request, '${NATIVE_CONNECTOR_PROVIDERS[i]}')`) > 0 && src.indexOf('nativeConnectorCallback(') < src.indexOf('consumeOAuthState('),
      /user\.id !== \w+\.ownerId/.test(src),
    ]),
    Array(4).fill([true, true])
  )
  check(
    'W3 the web start routes still bind the state to the session user and still decline a direct app navigation',
    NATIVE_CONNECTOR_PROVIDERS.map((p) => code(`app/api/auth/${p}/route.ts`)).map((src) => /createOAuthState\(\{\s*ownerId: user\.id/.test(src) && src.includes('refuseNativeConnect(request)')),
    [true, true, true, true]
  )
  check(
    'W4 disconnect still works as before: local delete for the session user',
    ['hubspot', 'salesforce', 'pipedrive'].map((p) => code(`app/api/auth/${p}/disconnect/route.ts`).includes(`deleteCrmConnection(user.id, '${p}')`)),
    [true, true, true]
  )
  const startRoute = code('app/api/connectors/native/start/route.ts')
  const claimRoute = code('app/api/connectors/native/claim/route.ts')
  check(
    'W5 both native routes take the identity from the verified session and no account id from the body',
    [startRoute, claimRoute].map((src) => [src.includes('auth.getUser()'), src.includes('identity: user ?? null'), /\b(userId|user_id|ownerId|owner_id)\b/.test(src)]),
    [[true, true, false], [true, true, false]]
  )
  check('W6 route failures answer codes, never messages', [startRoute, claimRoute].map((src) => /\.message\b/.test(src)), [false, false])
  const nativeLib = code('lib/connectors/native.ts')
  check('W7 logs name a provider and a stage, never a token, code, state, nonce or handoff', /console\.error\([^\n]*(params\.(code|state)|args\.(nonce|handoff)|accessToken|refreshToken|handoff\b|\.message)/.test(nativeLib), false)

  // ═══════════════════ THE APP ═══════════════════

  const link = parseNativeDeepLink(handback)
  check(
    'D1 the app parses a handback strictly: a good link, a cancel, a malformed attempt, a foreign host',
    [
      link,
      parseNativeDeepLink(`io.abccard.app://connect/callback?attempt=${cancelled.attemptId}&result=cancelled`),
      parseNativeDeepLink('io.abccard.app://connect/callback?attempt=../../x&handoff=abc'),
      parseNativeDeepLink(`io.abccard.app://evil/callback?attempt=${cancelled.attemptId}&handoff=${handoffs.hubspot}`),
      parseNativeDeepLink(`https://www.abccard.io/connect/callback?attempt=${cancelled.attemptId}&handoff=${handoffs.hubspot}`)?.kind,
    ],
    [
      { kind: 'connect-callback', attemptId: flows.hubspot.attemptId, handoff: handoffs.hubspot },
      { kind: 'connect-ended', attemptId: cancelled.attemptId, result: 'cancelled' },
      { kind: 'connect-ended', attemptId: null, result: 'failed' },
      null,
      'open-path',
    ]
  )
  const origin = 'https://www.abccard.io'
  check(
    'D2 inside the app only ABC’s own connect start links start the native flow; callbacks, disconnects and other sites do not',
    [
      nativeConnectorStartFromHref('/api/auth/hubspot', origin),
      nativeConnectorStartFromHref('https://abccard.io/api/auth/google-gmail?returnTo=%2Fchat%2F7', origin),
      nativeConnectorStartFromHref('/api/auth/google-gmail?returnTo=//evil.example', origin),
      nativeConnectorStartFromHref('/api/auth/hubspot/callback?code=x&state=y', origin),
      nativeConnectorStartFromHref('/api/auth/pipedrive/disconnect', origin),
      nativeConnectorStartFromHref('https://evil.example/api/auth/salesforce', origin),
    ],
    [{ provider: 'hubspot', returnTo: null }, { provider: 'google-gmail', returnTo: '/chat/7' }, { provider: 'google-gmail', returnTo: null }, null, null, null]
  )
  check(
    'D3 every outcome lands somewhere real: Gmail back in its conversation, a CRM on Integrations',
    [nativeConnectDestination('google-gmail', '/chat/1', 'error'), nativeConnectDestination('google-gmail', '//evil', 'cancelled'), nativeConnectDestination('salesforce', null, 'cancelled')],
    ['/chat/1?gmail=gmail_connect_failed', '/contacts', '/settings/integrations']
  )

  const client = code('lib/native/connect-client.ts')
  const startBody = client.slice(client.indexOf("fetch('/api/connectors/native/start'"), client.lastIndexOf('writePending('))
  check(
    'D4 the app sends only the nonce hash at the start, and the nonce, attempt and handoff at the claim',
    [/nonce:\s*nonce\b/.test(startBody), startBody.includes('nonceHash'), client.includes('JSON.stringify({ attemptId: link.attemptId, handoff: link.handoff, nonce: pending.nonce })')],
    [false, true, true]
  )
  check(
    'D5 a return for another attempt is ignored; a matching one clears the pending record and closes the browser before claiming',
    [client.includes('if (link.attemptId && link.attemptId !== pending.attemptId) return'), client.indexOf('clearPending()') < client.indexOf('Browser.close()'), client.indexOf('Browser.close()') < client.indexOf("fetch('/api/connectors/native/claim'")],
    [true, true, true]
  )
  const shell = code('lib/native/shell.ts')
  check(
    'D6 the shell turns Connect links and window.open into the native flow, and routes connect deep links to the claim',
    [shell.includes('nativeConnectorStartFromHref(anchor.href, origin)'), shell.includes('nativeConnectorStartFromHref(String(url), origin)'), shell.includes("link.kind === 'connect-callback' || link.kind === 'connect-ended'")],
    [true, true, true]
  )
  const composer = code('components/chat/MessageComposer.tsx')
  check('D7 the Gmail composer uses the native flow in the app and releases its button either way', [composer.includes("startNativeConnect('google-gmail', gmailReturnPath(contact.id))"), /finally \{\s*setConnectingGmail\(false\)/.test(composer)], [true, true])

  const page = nativeHandbackPage('io.abccard.app://connect/callback?attempt=a&handoff="><script>', 'Your connection continues in the app.')
  const html = await page.text()
  check('D8 the handback page is not cached, sends no referrer, and escapes what it links to', [page.headers.get('cache-control'), page.headers.get('referrer-policy'), html.includes('"><script>')], ['no-store', 'no-referrer', false])

  // ═══════════════════ THE MIGRATION ═══════════════════

  const migration = read(MIGRATION)
  const outside = migration.replace(/\$\$[\s\S]*?\$\$/g, '').replace(/--.*$/gm, '')
  check('M1 additive: no DROP, TRUNCATE or row written by the migration itself', /\b(drop\s+(table|column|constraint|trigger|policy|function)|truncate|delete\s+from|update\s+public\.|insert\s+into)\b/i.test(outside), false)
  check('M2 the only ALTER enables RLS on its own table', (outside.match(/\balter\s+table[^;]+/gi) ?? []).map(flat), ['alter table public.native_connector_attempts enable row level security'])
  check('M3 nothing is granted to anon, authenticated or PUBLIC', /\bgrant\b[^;]*\bto\s+(anon|authenticated|public)\b/i.test(outside), false)
  const denied = async (role: Role, sql: string) => {
    try {
      await asRole(db, role, sql)
      return 'allowed'
    } catch (err) {
      return (err as { code?: string }).code ?? 'error'
    }
  }
  check(
    'M4 a browser can neither read attempts nor run any step of the flow',
    [
      await denied('authenticated', 'select * from public.native_connector_attempts'),
      await denied('anon', 'select * from public.native_connector_attempts'),
      await denied('authenticated', `select * from public.claim_native_connector_attempt('${hub.attemptId}', '${OWNER}', 'x', 'y')`),
      await denied('authenticated', "select * from public.begin_native_connector_callback('x', 'hubspot')"),
      await denied('authenticated', `select public.create_native_connector_attempt('${OWNER}', 'hubspot', 's', 'n', null, null, 600)`),
      await denied('authenticated', `select public.remove_account_data('${OWNER}')`),
    ],
    ['42501', '42501', '42501', '42501', '42501', '42501']
  )
  const fns = await rowsOf<{ proname: string; prosecdef: boolean; proconfig: string[] | null }>(db, "select proname, prosecdef, proconfig from pg_proc where proname like '%native_connector%' order by proname")
  check('M5 every function runs as the caller with an empty search path', fns.map((f) => [f.proname, f.prosecdef, f.proconfig]), [
    ['begin_native_connector_callback', false, ['search_path=""']],
    ['claim_native_connector_attempt', false, ['search_path=""']],
    ['complete_native_connector_callback', false, ['search_path=""']],
    ['create_native_connector_attempt', false, ['search_path=""']],
    ['fail_native_connector_attempt', false, ['search_path=""']],
  ])
  const pick = (text: string) => {
    const at = text.indexOf('create or replace function public.remove_account_data')
    return text.slice(at, text.indexOf('\n$$;', at) + 4)
  }
  check(
    'M6 remove_account_data is redefined with exactly one added statement: native attempts go with the other credentials',
    [pick(migration).replace('  delete from public.native_connector_attempts where user_id = p_user_id;\n', '') === pick(read(DELETION_MIGRATION)), pick(migration).includes('delete from public.native_connector_attempts where user_id = p_user_id;')],
    [true, true]
  )
  let constraintHolds = false
  try {
    await db.query("update public.native_connector_attempts set status = 'claimed' where id = $1 and result_encrypted is null and false", [hub.attemptId])
    await db.query("insert into public.native_connector_attempts (user_id, provider, state_hash, nonce_hash, status, result_encrypted, expires_at) values ($1, 'hubspot', 'constraint-probe', 'n', 'failed', 'v1:x', now())", [OWNER])
  } catch {
    constraintHolds = true
  }
  check('M7 the database refuses tokens on a row that is not waiting to be claimed', constraintHolds, true)
  let reapplied = true
  try {
    await db.exec(migration)
  } catch {
    reapplied = false
  }
  check('M8 the migration re-applies cleanly and sorts after account deletion', [reapplied, MIGRATION > DELETION_MIGRATION], [true, true])

  await db.close()

  const total = passed + failures.length
  if (failures.length) {
    console.log(`\nNative connectors: ${passed}/${total} PASS, ${failures.length} FAILED\n`)
    for (const failure of failures) console.log('  FAIL ' + failure)
    process.exit(1)
  }
  console.log(`\nNative connectors: ${passed}/${total} PASS`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
