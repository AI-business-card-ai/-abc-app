/**
 * Auth email link regression suite.
 *
 * Run with `npm run test:auth-links` from the repository root.
 *
 * /auth/confirm verifies sign-up, recovery, invite, magic-link and email-change
 * links by token hash (lib/auth/email-link.ts). The route runs for real, with
 * Supabase's Auth and REST endpoints answered by a fetch stub that records every
 * request; nothing reaches a network. The project URL and keys below are
 * placeholders for this run only.
 */
import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'

const SUPABASE = 'https://project-ref.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-placeholder-for-tests'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-placeholder-for-tests'
// The callback route imports the mailer, which refuses to construct without a key. Nothing is sent.
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_placeholder_for_tests'

import { AUTH_ERROR_CODES, authErrorMessage } from '@/lib/auth/error-codes'
import { EMAIL_LINK_TYPES, emailLinkDestination, parseEmailLink, safeRelativePath } from '@/lib/auth/email-link'
import { parseNativeDeepLink } from '@/lib/native/deep-link'

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

const ORIGIN = 'https://www.abccard.io'
const USER = '11111111-1111-4111-8111-111111111111'
const NEW_USER = '22222222-2222-4222-8222-222222222222'
const VALID = 'a3f1c9e2b7d84f6a9c0e1b2d3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c'
const VALID_NEW = 'pkce_b4e2d0f3c8e95a7b0d1f2c3e4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d'
const EXPIRED = 'c5f3e1a4d9fa6b8c1e2a3d4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e'

// ─────────────────────────── SUPABASE STUB ───────────────────────────

type Recorded = { method: string; url: string; body: string | null; apikey: string | null }
const requests: Recorded[] = []
let profiles: Record<string, { id: string; onboarding_completed: boolean } | undefined> = {}

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
const jwt = (sub: string) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })}.signature`

function session(userId: string, email: string) {
  return {
    access_token: jwt(userId),
    refresh_token: 'refresh-placeholder',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: userId, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-09-01T00:00:00Z' },
  }
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const method = (init?.method ?? 'GET').toUpperCase()
  const headers = new Headers(init?.headers)
  const body = typeof init?.body === 'string' ? init.body : null
  requests.push({ method, url, body, apikey: headers.get('apikey') })

  if (!url.startsWith(SUPABASE)) return json(599, { error: 'unexpected host' })

  if (url.startsWith(`${SUPABASE}/auth/v1/verify`) && method === 'POST') {
    const payload = JSON.parse(body ?? '{}') as { token_hash?: string; type?: string }
    if (payload.token_hash === VALID) return json(200, session(USER, 'owner@example.com'))
    if (payload.token_hash === VALID_NEW) return json(200, session(NEW_USER, 'new@example.com'))
    return json(403, { code: 403, error_code: 'otp_expired', msg: `Email link is invalid or has expired for ${payload.token_hash}` })
  }

  if (url.startsWith(`${SUPABASE}/rest/v1/abc_profiles`) && method === 'GET') {
    const id = new URL(url).searchParams.get('id')?.replace(/^eq\./, '') ?? ''
    const row = profiles[id]
    return json(200, row ? [row] : [])
  }
  if (url.startsWith(`${SUPABASE}/rest/v1/abc_profiles`) && method === 'POST') {
    return new Response(null, { status: 201 })
  }
  return json(404, { error: 'not stubbed' })
}) as typeof fetch

const logs: string[] = []
for (const level of ['log', 'error', 'warn', 'info'] as const) {
  console[level] = (...args: unknown[]) => {
    logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
  }
}

// ─────────────────────────── RUN ───────────────────────────

async function run() {
  const { GET: confirm } = await import('@/app/auth/confirm/route')
  const { GET: callback } = await import('@/app/auth/callback/route')

  const visit = async (query: string, cookie?: string) => {
    requests.length = 0
    const res = await confirm(new NextRequest(`${ORIGIN}/auth/confirm?${query}`, cookie ? { headers: { cookie } } : undefined))
    const location = res.headers.get('location') ?? ''
    const setCookie = res.headers.get('set-cookie') ?? ''
    return {
      status: res.status,
      location,
      path: location ? `${new URL(location).pathname}${new URL(location).search}` : '',
      sameOrigin: location ? new URL(location).origin === ORIGIN : null,
      signedIn: /sb-project-ref-auth-token/.test(setCookie),
      cacheControl: res.headers.get('cache-control'),
      referrer: res.headers.get('referrer-policy'),
      verifyCalls: requests.filter((r) => r.url.includes('/auth/v1/verify')).length,
      profileReads: requests.filter((r) => r.url.includes('/rest/v1/abc_profiles') && r.method === 'GET').length,
      requests: [...requests],
    }
  }
  const refused = { path: `/login?error=auth&reason=${AUTH_ERROR_CODES.emailLinkInvalid}`, signedIn: false }

  // ═══════════════════ PARSING ═══════════════════

  const q = (params: Record<string, string>) => new URLSearchParams(params)
  check(
    'P1 every Supabase email link type is accepted; the token hash and a safe next are carried',
    EMAIL_LINK_TYPES.map((type) => parseEmailLink(q({ token_hash: VALID, type, next: '/contacts' }))),
    EMAIL_LINK_TYPES.map((type) => ({ ok: true, tokenHash: VALID, type, next: '/contacts' }))
  )
  check(
    'P2 a missing or malformed token hash is refused before anything else',
    [parseEmailLink(q({ type: 'email' })), ...['short', 'has spaces in it here', '<script>alert(1)</script>', 'x'.repeat(513), 'abc%2Fdef1234567890'].map((token_hash) => parseEmailLink(q({ token_hash, type: 'email' })))],
    [{ ok: false, reason: 'missing_token' }, ...Array(5).fill({ ok: false, reason: 'invalid_token' })]
  )
  check(
    'P3 any other type is refused: phone OTPs, case variants, blanks, missing',
    ['sms', 'phone_change', 'RECOVERY', 'Email', '', ' email'].map((type) => parseEmailLink(q({ token_hash: VALID, type }))).concat(parseEmailLink(q({ token_hash: VALID }))),
    Array(7).fill({ ok: false, reason: 'invalid_type' })
  )
  check(
    'P4 next is kept only as a path on this site',
    ['/contacts', '/chat/42?tab=email#top', '//evil.example', 'https://evil.example/x', '/\\evil.example', 'javascript:alert(1)', '/\tevil', '\t//evil.example', 'evil.example', '/%2F%2Fevil.example'].map(safeRelativePath),
    ['/contacts', '/chat/42?tab=email#top', null, null, null, null, null, null, null, '/%2F%2Fevil.example']
  )
  check(
    'P5 recovery always lands on the reset screen; an email change defaults to account settings; a sign-in to the dashboard',
    [emailLinkDestination('recovery', '/contacts'), emailLinkDestination('recovery', null), emailLinkDestination('email_change', null), emailLinkDestination('email', null), emailLinkDestination('invite', '/onboarding')],
    ['/reset-password', '/reset-password', '/settings/profile', '/dashboard', '/onboarding']
  )

  // ═══════════════════ THE ROUTE ═══════════════════

  profiles = { [USER]: { id: USER, onboarding_completed: true } }

  const confirmed = await visit(`token_hash=${VALID}&type=email&next=%2Fcontacts`)
  check(
    'R1 a valid confirmation opened in a browser with no cookies at all signs in and lands where it asked — no verifier needed',
    [confirmed.status, confirmed.path, confirmed.signedIn, confirmed.verifyCalls, confirmed.profileReads],
    [307, '/contacts', true, 1, 1]
  )
  check('R2 the redirect is never cached, sends no referrer, and does not carry the token hash', [confirmed.cacheControl, confirmed.referrer, confirmed.location.includes(VALID)], ['no-store', 'no-referrer', false])
  const verify = confirmed.requests.find((r) => r.url.includes('/auth/v1/verify'))
  const verifyBody = JSON.parse(verify?.body ?? '{}') as Record<string, unknown>
  check(
    'R3 verification is Supabase’s own, with the anon key, for exactly the type and token hash from the link',
    [verify?.url.startsWith(`${SUPABASE}/auth/v1/verify`), verify?.apikey, verifyBody.type, verifyBody.token_hash, confirmed.requests.every((r) => r.url.startsWith(SUPABASE))],
    [true, 'anon-placeholder-for-tests', 'email', VALID, true]
  )

  const sameBrowser = await visit(`token_hash=${VALID}&type=email`, 'sb-project-ref-auth-token=stale-session; other=1')
  check('R4 in a browser already holding an older session, the verified session replaces it', [sameBrowser.path, sameBrowser.signedIn], ['/dashboard', true])

  const fresh = await visit(`token_hash=${VALID_NEW}&type=signup&next=%2Fcontacts`)
  check(
    'R5 a first confirmation for an account with no profile creates it with the service role and starts onboarding',
    [fresh.path, fresh.signedIn, fresh.requests.filter((r) => r.method === 'POST' && r.url.includes('/rest/v1/abc_profiles')).map((r) => r.apikey)],
    ['/onboarding', true, ['service-placeholder-for-tests']]
  )

  profiles[USER] = { id: USER, onboarding_completed: false }
  check('R6 an account that never finished onboarding is sent there, whatever next says', (await visit(`token_hash=${VALID}&type=magiclink&next=%2Fcontacts`)).path, '/onboarding')
  profiles[USER] = { id: USER, onboarding_completed: true }

  const recovery = await visit(`token_hash=${VALID}&type=recovery&next=https%3A%2F%2Fevil.example%2Fsteal`)
  const recoveryNext = await visit(`token_hash=${VALID}&type=recovery&next=%2Fcontacts`)
  check(
    'R7 recovery signs in and always lands on the reset screen — an external or local next is ignored — with no sign-in bookkeeping',
    [recovery.path, recovery.signedIn, recovery.profileReads, recoveryNext.path, recoveryNext.profileReads],
    ['/reset-password', true, 0, '/reset-password', 0]
  )

  const emailChange = await visit(`token_hash=${VALID}&type=email_change`)
  check('R8 an email change signs in and lands on account settings', [emailChange.path, emailChange.signedIn, emailChange.profileReads], ['/settings/profile', true, 0])

  const hostile = await Promise.all(
    ['%2F%2Fevil.example', 'https%3A%2F%2Fevil.example', '%2F%5Cevil.example', 'javascript%3Aalert(1)', '%2F%09%2Fevil.example', '%2F%2F%2Fevil.example'].map((next) => visit(`token_hash=${VALID}&type=email&next=${next}`))
  )
  check('R9 a malicious next never leaves the site: every one falls back to the normal destination', hostile.map((r) => [r.sameOrigin, r.path]), Array(6).fill([true, '/dashboard']))

  const expired = await visit(`token_hash=${EXPIRED}&type=recovery`)
  check('R10 an expired or used link is refused with one stable code, after one verification attempt, and signs nobody in', [expired.path, expired.signedIn, expired.verifyCalls, expired.cacheControl], [refused.path, false, 1, 'no-store'])

  const malformed = await Promise.all([
    visit('type=email'),
    visit('token_hash=short&type=email'),
    visit(`token_hash=${encodeURIComponent('<script>alert(1)</script>')}&type=email`),
    visit(`token_hash=${VALID}&type=sms`),
    visit(`token_hash=${VALID}`),
    visit(`token_hash=${VALID}&type=RECOVERY`),
  ])
  check('R11 a missing token, a malformed token, or a wrong type is refused without asking Supabase', malformed.map((r) => [r.path, r.signedIn, r.verifyCalls]), Array(6).fill([refused.path, false, 0]))

  const allLogs = logs.join('\n')
  check('R12 no token hash, verification message or session token ever reaches a log', [VALID, VALID_NEW, EXPIRED, 'Email link is invalid', 'refresh-placeholder', 'eyJ'].filter((secret) => allLogs.includes(secret)), [])

  // Configuration missing entirely: the client cannot be built.
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  const unconfigured = await visit(`token_hash=${VALID}&type=email`)
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE
  check('R13 an unexpected failure is a stable code on /login, never a stack or message', [unconfigured.path, unconfigured.signedIn, /supabaseurl|stack|required|undefined|exception|\bat\s/i.test(decodeURIComponent(unconfigured.location))], [`/login?error=auth&reason=${AUTH_ERROR_CODES.unexpected}`, false, false])

  // ═══════════════════ THE EXISTING FLOWS ═══════════════════

  requests.length = 0
  const oldCallback = await callback(new NextRequest(`${ORIGIN}/auth/callback?flow=recovery&next=%2Freset-password`))
  check('E1 the PKCE callback is still there and still refuses a link with no code', [oldCallback.status, new URL(oldCallback.headers.get('location') ?? '').search, requests.length], [307, `?error=auth&reason=${AUTH_ERROR_CODES.missingCode}`, 0])
  const callbackSrc = code('app/auth/callback/route.ts')
  check('E2 the callback still exchanges its own code and stops for recovery before any sign-in bookkeeping', [callbackSrc.includes('exchangeCodeForSession(code)'), callbackSrc.indexOf('if (isRecovery)') < callbackSrc.indexOf('resolveSignInDestination(')], [true, true])
  check(
    'E3 password reset still requests its link through the callback until the template changes; sign-up now returns through it too',
    [code('app/(auth)/forgot-password/page.tsx').includes('/auth/callback?next=${encodeURIComponent(') && code('app/(auth)/forgot-password/page.tsx').includes('&flow=recovery'), code('app/(auth)/register/page.tsx').includes("emailRedirectTo: getOAuthCallbackUrl('/dashboard')")],
    [true, true]
  )
  check(
    'E4 the reset screen still reads no token from the URL — the verified session is its proof',
    /searchParams|token_hash|location\.(search|hash)/.test(code('app/(auth)/reset-password/page.tsx')),
    false
  )
  check('E5 the new code has a sentence of its own, and it names no token or provider', [authErrorMessage(AUTH_ERROR_CODES.emailLinkInvalid).length > 20, /token|supabase|otp/i.test(authErrorMessage(AUTH_ERROR_CODES.emailLinkInvalid))], [true, false])

  const confirmSrc = code('app/auth/confirm/route.ts')
  check(
    'E6 the route logs only codes and stages, and uses no service role except for a brand-new profile',
    [/console\.(log|error|warn)\([^\n]*(tokenHash|token_hash|error\.message|data\.)/.test(confirmSrc), confirmSrc.includes('createService: createServiceClient'), (confirmSrc.match(/createServiceClient/g) ?? []).length],
    [false, true, 2]
  )

  // ═══════════════════ NATIVE, MIDDLEWARE, DOCS ═══════════════════

  const universal = parseNativeDeepLink(`${ORIGIN}/auth/confirm?token_hash=${VALID}&type=recovery`)
  check(
    'N1 once app links are verified, a confirmation link opens the same route inside the app’s WebView',
    universal,
    { kind: 'open-path', path: `/auth/confirm?token_hash=${VALID}&type=recovery` }
  )
  const middleware = code('middleware.ts')
  check('N2 the route is outside every sign-in and onboarding gate', [middleware.includes("pathname.startsWith('/auth')"), /protectedRoutes = \[[^\]]*'\/auth/.test(middleware.replace(/\s+/g, ' '))], [true, false])

  const docs = read('docs/auth-email-links.md')
  check(
    'D1 the owner has the exact template links for sign-up and recovery, and the doc does not claim the live flow was tested',
    [
      docs.includes('{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard'),
      docs.includes('{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery'),
      docs.includes('{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/settings/profile'),
      /has not been tested end to end/.test(docs),
      /OWNER ACTION/.test(docs),
    ],
    [true, true, true, true, true]
  )

  const total = passed + failures.length
  const out = process.stdout
  if (failures.length) {
    out.write(`\nAuth email links: ${passed}/${total} PASS, ${failures.length} FAILED\n\n`)
    for (const failure of failures) out.write('  FAIL ' + failure + '\n')
    process.exit(1)
  }
  out.write(`\nAuth email links: ${passed}/${total} PASS\n`)
}

run().catch((err) => {
  process.stdout.write(String(err instanceof Error ? err.stack : err) + '\n')
  process.exit(1)
})
