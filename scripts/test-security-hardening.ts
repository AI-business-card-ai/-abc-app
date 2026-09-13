/**
 * Security hardening: the welcome email route and the retired webhook export.
 *
 * Run with `npm run test:security` from the repository root.
 *
 * The welcome policy is a pure function with injected dependencies, so every
 * refusal is proven here to reach neither the rate limiter nor the email
 * provider. The webhook export route is imported and called for real, with the
 * global `fetch` replaced by a spy, so "it sends nothing" is observed rather than
 * inferred. Nothing here reaches Resend, Supabase or any network address.
 */
import fs from 'node:fs'
import path from 'node:path'

import { POST as webhookExport } from '@/app/api/export/webhook/route'
import {
  WELCOME_RATE_SCOPE,
  WELCOME_WINDOW_SECONDS,
  isUsableRecipient,
  sendWelcomeForIdentity,
  welcomeName,
  type WelcomeDeps,
  type WelcomeIdentity,
} from '@/lib/welcome-email'

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
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? entry.name === 'node_modules' || entry.name.startsWith('.')
        ? []
        : listFiles(path.join(dir, entry.name))
      : [path.join(dir, entry.name).replace(/\\/g, '/')]
  )

/** Every provider and limiter call any refused request makes, across the whole suite. */
const refusedReach = { claim: 0, send: 0 }

function fakeDeps(options: { configured?: boolean; claim?: 'allowed' | 'limited' | 'unavailable'; send?: 'ok' | 'fail' | 'throw' } = {}) {
  const calls = { claim: [] as string[], send: [] as unknown[][] }
  const deps: WelcomeDeps = {
    configured: options.configured ?? true,
    claim: async (userId) => {
      calls.claim.push(userId)
      return options.claim ?? 'allowed'
    },
    send: async (...args) => {
      calls.send.push(args)
      if (options.send === 'throw') throw new Error('Resend 500 upstream: key re_live_SECRETKEY rejected by 10.0.0.12')
      return { ok: options.send !== 'fail' }
    },
  }
  return { deps, calls }
}

async function refused(identity: WelcomeIdentity | null, body: unknown, options: Parameters<typeof fakeDeps>[0] = {}) {
  const { deps, calls } = fakeDeps(options)
  const result = await sendWelcomeForIdentity(deps, identity, body)
  /*
    A refusal is a request the policy turned away. `send_failed` is not one: the
    request was accepted and the provider itself failed, so calling it was right.
  */
  if (result.status !== 200 && (result.body as { code?: string }).code !== 'send_failed') {
    refusedReach.send += calls.send.length
    if (!['already_sent', 'email_unavailable', 'send_failed'].includes((result.body as { code?: string }).code ?? '')) {
      refusedReach.claim += calls.claim.length
    }
  }
  return { result, calls }
}

const confirmed = '2026-01-01T00:00:00.000Z'
const ANNA: WelcomeIdentity = { id: 'user-a', email: 'anna@example.com', email_confirmed_at: confirmed, fullName: 'Anna Novák' }
const FOUNDER: WelcomeIdentity = { id: 'founder', email: 'im.expoguy@gmail.com', email_confirmed_at: confirmed, fullName: 'Founder' }

async function run() {
  // Anything here that tries to reach the network is a failure of the suite.
  const realFetch = globalThis.fetch
  let outbound = 0
  globalThis.fetch = (async () => {
    outbound += 1
    throw new Error('network is blocked in this suite')
  }) as typeof fetch
  process.env.RESEND_API_KEY = 're_test_SECRETVALUE_never_returned'

  // ═══════════════════ EMAIL ═══════════════════

  const anonymous = await refused(null, { type: 'welcome', to: 'victim@example.com' })
  check('1  an anonymous request triggers no email, no limiter and no provider', [anonymous.result, anonymous.calls.claim.length, anonymous.calls.send.length], [{ status: 401, body: { error: 'Sign in to continue.', code: 'unauthorized' } }, 0, 0])

  const intended = fakeDeps()
  const welcome = await sendWelcomeForIdentity(intended.deps, ANNA, { type: 'welcome' })
  check('2  a signed-in, confirmed account receives its own welcome, once claimed', [welcome, intended.calls.claim, intended.calls.send], [{ status: 200, body: { success: true } }, ['user-a'], [['anna@example.com', 'Anna Novák']]])

  const impersonation = fakeDeps()
  await sendWelcomeForIdentity(impersonation.deps, ANNA, { type: 'welcome', to: 'victim@example.com', email: 'victim@example.com', userId: 'user-b', user_id: 'user-b', name: 'Your bank' })
  check('3  a user id, recipient or name in the request changes nothing: the account itself is claimed and mailed', [impersonation.calls.claim, impersonation.calls.send], [['user-a'], [['anna@example.com', 'Anna Novák']]])

  const spoof = fakeDeps()
  await sendWelcomeForIdentity(spoof.deps, ANNA, { type: 'welcome', from: 'CEO <ceo@abccard.io>', subject: 'Urgent', html: '<a href="https://evil.example">login</a>' })
  const emailModule = code('lib/email.ts')
  const welcomeSource = emailModule.slice(emailModule.indexOf('export async function sendWelcomeEmail'), emailModule.indexOf('export async function sendQrConnectNotification'))
  check('4  the sender cannot be chosen: the provider is given recipient and name only, and the sender is a fixed literal', [spoof.calls.send.map((args) => args.length), /from: 'ABC AI Business Card <hello@abccard\.io>'/.test(welcomeSource), /body\.(from|subject|html|to|name)|from:\s*(body|req)/.test(code('app/api/email/send/route.ts') + code('lib/welcome-email.ts'))], [[2], true, false])

  const malformed: string[] = []
  for (const email of ['not-an-email', 'anna@example', 'anna@example.com\nBcc: everyone@example.com', 'anna@example.com, victim@example.com', '"quoted"@example.com', '', 'a'.repeat(250) + '@example.com']) {
    const attempt = await refused({ ...ANNA, email }, { type: 'welcome' })
    if (attempt.result.status !== 400 || attempt.calls.send.length || attempt.calls.claim.length) malformed.push(email.slice(0, 40))
  }
  const noEmail = await refused({ ...ANNA, email: null }, { type: 'welcome' })
  check('5  a malformed, multi-recipient or header-carrying address is refused before anything is spent', [malformed, noEmail.result.body], [[], { error: 'Your account has no email address we can use.', code: 'invalid_recipient' }])
  check('5b the recipient check itself', [isUsableRecipient('anna@example.com'), isUsableRecipient('anna @example.com'), isUsableRecipient('anna@example.com;x@y.com')], [true, false, false])

  const outcomes = [welcome, anonymous.result, noEmail.result, (await refused(ANNA, { type: 'welcome' }, { send: 'throw' })).result, (await refused(ANNA, { type: 'welcome' }, { configured: false })).result]
  check('6  no response carries a key, a provider detail or the environment', /re_test|re_live|SECRET|RESEND|10\.0\.0\.12|upstream/i.test(JSON.stringify(outcomes)), false)
  check('6b the route never puts configuration into a response', /NextResponse\.json\([^)]*process\.env/.test(code('app/api/email/send/route.ts')), false)

  const failed = await refused(ANNA, { type: 'welcome' }, { send: 'fail' })
  const thrown = await refused(ANNA, { type: 'welcome' }, { send: 'throw' })
  check('7  a provider failure is a generic 502, whether it returns an error or throws', [failed.result, thrown.result], [
    { status: 502, body: { error: 'Could not send the email.', code: 'send_failed' } },
    { status: 502, body: { error: 'Could not send the email.', code: 'send_failed' } },
  ])

  check('8  the welcome is a system email, not ABC Pro: no Pro gate on the route or the policy', /requirePro|lib\/entitlements|resolveProEntitlement/.test(code('app/api/email/send/route.ts') + code('lib/welcome-email.ts')), false)
  const founder = fakeDeps()
  check('9  the founder is welcomed like anybody else', [(await sendWelcomeForIdentity(founder.deps, FOUNDER, { type: 'welcome' })).status, founder.calls.send], [200, [['im.expoguy@gmail.com', 'Founder']]])

  const unconfirmed = await refused({ ...ANNA, email_confirmed_at: null }, { type: 'welcome' })
  const limited = await refused(ANNA, { type: 'welcome' }, { claim: 'limited' })
  const unavailable = await refused(ANNA, { type: 'welcome' }, { claim: 'unavailable' })
  const unconfigured = await refused(ANNA, { type: 'welcome' }, { configured: false })
  check(
    '10 transactional rules: unconfirmed 403, a second welcome 429, no counter 503, no provider 503 — none of them sends',
    [
      [unconfirmed.result.status, unconfirmed.result.body],
      [limited.result.status, limited.calls.send.length],
      [unavailable.result.status, unavailable.calls.send.length],
      [unconfigured.result.status, unconfigured.calls.claim.length, unconfigured.calls.send.length],
    ],
    [
      [403, { error: 'Confirm your email address first.', code: 'email_unconfirmed' }],
      [429, 0],
      [503, 0],
      [503, 0, 0],
    ]
  )
  const route = code('app/api/email/send/route.ts')
  check('10b one welcome per account per window, counted by the shared Postgres limiter, failing closed', [WELCOME_RATE_SCOPE, WELCOME_WINDOW_SECONDS >= 30 * 86_400, route.includes('consumeRateLimit(') && route.includes('maxHits: 1') && route.includes("return 'unavailable'")], ['email:welcome', true, true])
  check('10c the route takes the account from a verified session only', [route.includes('auth.getUser()'), route.includes('auth.getSession()'), route.includes('id: user.id')], [true, false, true])
  const register = code('app/(auth)/register/page.tsx')
  const registerCall = register.slice(register.indexOf("fetch('/api/email/send'"), register.indexOf('.catch(() => {})'))
  check('10d the register page asks only for the welcome, only once there is a session, and names no recipient', [registerCall.includes("JSON.stringify({ type: 'welcome' })"), /\bto:|name:/.test(registerCall), register.indexOf('if (data.session)') < register.indexOf("fetch('/api/email/send'")], [true, false, true])

  const retiredTypes: unknown[] = []
  for (const body of [{ type: 'followup', to: 'x@example.com', name: 'x', contactName: 'y', dayNumber: 1 }, { type: 'message-sent', to: 'x@example.com', name: 'x', contactName: 'y', channel: 'z' }, {}, null, 'welcome']) {
    const attempt = await refused(ANNA, body)
    retiredTypes.push([attempt.result.status, (attempt.result.body as { code?: string }).code, attempt.calls.send.length])
  }
  check('11 the retired types, and anything that is not the welcome, are refused in a controlled way', retiredTypes, [[400, 'unsupported_email_type', 0], [400, 'unsupported_email_type', 0], [400, 'unsupported_email_type', 0], [400, 'unsupported_email_type', 0], [400, 'unsupported_email_type', 0]])
  const leftovers = listFiles('app').concat(listFiles('lib'), listFiles('components')).filter((f) => /\.(ts|tsx)$/.test(f) && /sendFollowUpReminder|sendMessageSentConfirmation/.test(read(f)))
  check('11b their uncalled templates are gone from the codebase', leftovers, [])
  check('12 across every refusal in this suite, the provider was never called', refusedReach.send, 0)
  check('12b and no refusal before the limiter spent a welcome', refusedReach.claim, 0)
  check('12c the provider module is only loaded after every check has passed', route.includes("(await import('@/lib/email')).sendWelcomeEmail(") && !/^import .*@\/lib\/email'/m.test(read('app/api/email/send/route.ts')), true)

  const { renderWelcomeEmailHtml } = await import('@/lib/email')
  const injected = renderWelcomeEmailHtml('<img src=x onerror=alert(1)><a href="https://evil.example">')
  check('13e the one variable in the welcome is escaped', [injected.includes('<img src=x'), injected.includes('&lt;img src=x onerror=alert(1)&gt;'), injected.includes('href="https://evil.example"')], [false, true, false])
  check('13f and the greeting is one bounded line', [welcomeName('  Anna\n\rNovák  '), welcomeName('x'.repeat(200)).length, welcomeName(42), welcomeName('   ')], ['Anna Novák', 80, 'there', 'there'])

  // ═══════════════════ WEBHOOK EXPORT ═══════════════════

  const callRetired = (body: unknown) =>
    (webhookExport as unknown as (request: Request) => Promise<Response>)(
      new Request('https://www.abccard.io/api/export/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    )

  const anonymousExport = await callRetired({ webhookUrl: 'https://public.example/hook' })
  check('13 an anonymous request is refused', [anonymousExport.status, await anonymousExport.json()], [410, { error: 'Webhook export is no longer available. Use CSV export or CRM sync instead.', code: 'webhook_export_retired' }])

  const destinations = [
    'https://public.example/hook',
    'http://localhost:3000/hook',
    'http://127.0.0.1/hook',
    'http://10.0.0.5/hook',
    'http://172.16.0.1/hook',
    'http://192.168.1.10/hook',
    'http://169.254.169.254/latest/meta-data/',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://[::1]/hook',
    'http://[fd00::1]/hook',
    'http://[fe80::1]/hook',
    'file:///etc/passwd',
    'ftp://public.example/hook',
    'gopher://127.0.0.1:6379/_FLUSHALL',
    'https://user:password@public.example/hook',
    'https://public.example/redirects-to-169.254.169.254',
  ]
  const answers: number[] = []
  for (const webhookUrl of destinations) {
    const response = await callRetired({ webhookUrl, contactIds: ['someone-elses-contact'], userId: 'user-b', headers: { Authorization: 'Bearer x' } })
    answers.push(response.status)
  }
  check('14 no browser-supplied destination is used — public, private or otherwise', answers.every((status) => status === 410), true)
  check('16–22 localhost, private IPv4, link-local and cloud metadata, IPv6 loopback and private, other schemes, embedded credentials and redirect targets: not one request leaves ABC', outbound, 0)
  const webhook = code('app/api/export/webhook/route.ts')
  check('15 the route reads no contact, profile or owner data at all', /supabase|\.from\(|scanned_contacts|abc_profiles|getUser|user_id|contactIds|req\.json|request\.json/.test(webhook), false)
  check('22b it holds no network call a redirect could steer', /fetch\(|axios|http\.request|https\.request|redirect/.test(webhook), false)
  check('23 nothing is exported, so the approved field set is empty', /JSON\.stringify|payload|contacts/.test(webhook), false)
  check('24 no token, secret or Stripe id can leave through it', /token|secret|stripe|process\.env/i.test(webhook), false)
  const destinationReaders = listFiles('app').concat(listFiles('lib'), listFiles('components')).filter((f) => /\.(ts|tsx)$/.test(f) && /webhook_url|webhookUrl|\/api\/export\/webhook/.test(code(f)))
  check('25 no stored, owner-configured webhook destination exists to honour: only the profile type still names the column', destinationReaders.sort(), ['lib/profile-defaults.ts', 'lib/types.ts'])
  check('26 the retired route fails honestly for every method it had, and nothing else is exported from it', [Object.keys(await import('@/app/api/export/webhook/route')).sort(), outbound], [['POST'], 0])

  globalThis.fetch = realFetch

  const total = passed + failures.length
  if (failures.length) {
    console.log(`\nSecurity: ${passed}/${total} PASS, ${failures.length} FAILED\n`)
    for (const failure of failures) console.log('  FAIL ' + failure)
    process.exit(1)
  }
  console.log(`\nSecurity: ${passed}/${total} PASS`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
