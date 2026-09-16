/**
 * Error surface regression suite.
 *
 * Run with `npm run test:error-surface` from the repository root.
 *
 * What a browser is told when something fails. Unexpected failures answer one
 * sentence of ours and log only the error's kind (lib/api/errors.ts); expected
 * outcomes keep their codes and words. Routes run for real where they can: called
 * outside a Next request, `cookies()` throws a genuine internal message inside
 * each route's try block, which is exactly the kind of text that must not reach
 * a client. Nothing here reaches a network; keys are placeholders for this run.
 */
import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'

process.env.RESEND_API_KEY ??= 're_placeholder_for_tests'
process.env.ANTHROPIC_API_KEY ??= 'sk-ant-placeholder-for-tests'
process.env.STRIPE_SECRET_KEY ??= 'sk_test_placeholderplaceholder'

import { GENERIC_SERVER_ERROR, errorKind, serverErrorResponse } from '@/lib/api/errors'
import { NETWORK_FAILURE_MESSAGE, userFacingRequestError } from '@/lib/network-error'
import { SCAN_CARD_UNREADABLE_ERROR, SCAN_NOT_COMPLETED_ERROR, formatScanErrorForUser } from '@/lib/scan-card-validation'

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

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) out.push(...routeFiles(rel))
    else if (entry.name === 'route.ts' || entry.name === 'route.tsx') out.push(rel)
  }
  return out
}

const logs: string[] = []
const original = { error: console.error, log: console.log, warn: console.warn }
function capture() {
  logs.length = 0
  const sink = (...args: unknown[]) => logs.push(args.map((a) => (typeof a === 'string' ? a : a instanceof Error ? `${a.name}: ${a.message}` : JSON.stringify(a))).join(' '))
  console.error = sink
  console.log = sink
  console.warn = sink
}
function release() {
  console.error = original.error
  console.log = original.log
  console.warn = original.warn
}

// Raw messages of the kinds that used to reach browsers.
const RAW = [
  'duplicate key value violates unique constraint "abc_profiles_pkey" Key (id)=(11111111-1111-4111-8111-111111111111)',
  'invalid_grant: Token has been expired or revoked. ya29.a0AfB_secret',
  'SUPABASE_SERVICE_ROLE_KEY is not configured',
  'relation "public.scanned_contacts" does not exist',
]
const LEAK = /constraint|violates|ya29|invalid_grant|SUPABASE_|relation "|does not exist|cookies|request scope|outside|stack|\bat\s+\w+\s*\(|Error:/

async function run() {
  // ═══════════════════ THE HELPER ═══════════════════

  capture()
  const responses = await Promise.all(
    [new Error(RAW[0]), Object.assign(new Error(RAW[1]), { code: 'invalid_grant' }), { message: RAW[3], code: '42P01', details: 'x', hint: 'y' }, RAW[2]].map(async (err, i) => {
      const res = serverErrorResponse('test/scope', err, i === 3 ? undefined : 'Could not do that. Try again.', i === 1 ? 502 : 500)
      return { status: res.status, body: await res.json() }
    })
  )
  release()
  check(
    'H1 the browser gets our sentence and nothing else, whatever was thrown',
    responses,
    [
      { status: 500, body: { error: 'Could not do that. Try again.' } },
      { status: 502, body: { error: 'Could not do that. Try again.' } },
      { status: 500, body: { error: 'Could not do that. Try again.' } },
      { status: 500, body: { error: GENERIC_SERVER_ERROR } },
    ]
  )
  check('H2 the log records the kind and a short code, never the message', [logs, logs.some((l) => RAW.some((raw) => l.includes(raw.slice(0, 20))))], [['[test/scope] failed: Error', '[test/scope] failed: Error code=invalid_grant', '[test/scope] failed: code=42P01', '[test/scope] failed: string'], false])
  check('H3 a code that is not short, plain vocabulary is not logged either', [errorKind({ code: 'x'.repeat(80) }), errorKind({ code: 'has spaces and a token ya29.abc' }), errorKind(null), errorKind(new TypeError('Load failed'))], ['object', 'object', 'object', 'TypeError'])

  // ═══════════════════ ROUTES, FOR REAL ═══════════════════

  type Handler = (req: NextRequest, ctx?: { params: Record<string, string> }) => Promise<Response>
  const json = (url: string, body: unknown) => new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
  const cases: { route: string; method: 'GET' | 'POST'; req: () => NextRequest; ctx?: { params: Record<string, string> }; want: string }[] = [
    { route: 'app/api/card/send-gmail/route', method: 'POST', req: () => json('https://www.abccard.io/api/card/send-gmail', { contactId: 'c', subject: 's', body: 'b' }), want: 'The email could not be sent. Try again.' },
    { route: 'app/api/contact/send-gmail/route', method: 'POST', req: () => json('https://www.abccard.io/api/contact/send-gmail', { contactId: 'c', subject: 's', body: 'b' }), want: 'The email could not be sent. Try again.' },
    { route: 'app/api/card/context/route', method: 'POST', req: () => json('https://www.abccard.io/api/card/context', { contactId: 'c' }), want: 'Could not save the meeting context. Try again.' },
    { route: 'app/api/contact/update/route', method: 'POST', req: () => json('https://www.abccard.io/api/contact/update', { contactId: 'c', updates: {} }), want: 'Could not update this contact. Try again.' },
    { route: 'app/api/contact/message-sent/route', method: 'POST', req: () => json('https://www.abccard.io/api/contact/message-sent', { contactId: 'c' }), want: 'Could not log the message. Try again.' },
    { route: 'app/api/contact/deal-outcome/route', method: 'POST', req: () => json('https://www.abccard.io/api/contact/deal-outcome', { contactId: 'c' }), want: 'Could not update the deal outcome. Try again.' },
    { route: 'app/api/pipeline/update/route', method: 'POST', req: () => json('https://www.abccard.io/api/pipeline/update', { contactId: 'c' }), want: GENERIC_SERVER_ERROR },
    { route: 'app/api/pipeline/action/route', method: 'POST', req: () => json('https://www.abccard.io/api/pipeline/action', { contactId: 'c' }), want: GENERIC_SERVER_ERROR },
    { route: 'app/api/enrich/queue/route', method: 'POST', req: () => json('https://www.abccard.io/api/enrich/queue', { contactId: 'c' }), want: 'Intelligence research failed. Try again.' },
    { route: 'app/api/card/followup/route', method: 'POST', req: () => json('https://www.abccard.io/api/card/followup', { contactId: 'c' }), want: GENERIC_SERVER_ERROR },
    { route: 'app/api/card/send/route', method: 'POST', req: () => json('https://www.abccard.io/api/card/send', { contactId: 'c' }), want: GENERIC_SERVER_ERROR },
    { route: 'app/api/scan/contact/route', method: 'POST', req: () => json('https://www.abccard.io/api/scan/contact', { fields: {} }), want: 'Could not save this contact.' },
    { route: 'app/api/card/status/[id]/route', method: 'GET', req: () => new NextRequest('https://www.abccard.io/api/card/status/c'), ctx: { params: { id: 'c' } }, want: 'Could not check this contact. Try again.' },
    { route: 'app/api/pipeline/insights/route', method: 'GET', req: () => new NextRequest('https://www.abccard.io/api/pipeline/insights'), want: 'Could not load insights. Try again.' },
    { route: 'app/api/stripe/portal/route', method: 'POST', req: () => json('https://www.abccard.io/api/stripe/portal', {}), want: 'Could not open the billing portal. Try again.' },
  ]
  const observed: unknown[] = []
  const expected: unknown[] = []
  capture()
  for (const c of cases) {
    const mod = (await import(`@/${c.route}`)) as Record<string, Handler>
    let outcome: unknown
    try {
      const res = await mod[c.method](c.req(), c.ctx)
      const text = await res.text()
      outcome = [c.route, res.status, JSON.parse(text), LEAK.test(text)]
    } catch (err) {
      outcome = [c.route, 'threw', err instanceof Error ? err.name : 'unknown']
    }
    observed.push(outcome)
    expected.push([c.route, 500, { error: c.want }, false])
  }
  const routeLogs = [...logs]
  release()
  check('R1 a raw internal exception inside each route answers our sentence, status 500, with nothing of the exception in the body', observed, expected)
  check('R2 and the logs of those failures carry kinds, not the exception text', routeLogs.filter((l) => /request scope|was called outside/.test(l)), [])

  // ═══════════════════ NO NEW RAW MESSAGES ═══════════════════

  const files = [...routeFiles('app/api'), ...routeFiles('app/auth')]
  const offenders: string[] = []
  for (const file of files) {
    const src = code(file)
    const responses = src.match(/NextResponse\.json\(\s*\{[^;]*?\}\s*(,\s*\{[^}]*\})?\s*\)/g) ?? []
    for (const r of responses) {
      const flatR = r.replace(/\s+/g, ' ')
      const reconnect = /error: err\.message, code: GOOGLE_RECONNECT_CODE/.test(flatR)
      if (!reconnect && /\b(err|error|e|exchangeError|updateError|insertError)\??\.message\b/.test(flatR)) offenders.push(`${file}: ${flatR.slice(0, 90)}`)
      if (/error: String\((err|error|e)\)|formatSupabaseError\(|JSON\.stringify\((err|error)\)/.test(flatR)) offenders.push(`${file}: ${flatR.slice(0, 90)}`)
    }
    // `{ error: message }` is allowed only where `message` was compared to one of our own sentences first.
    if (/\{ ?(success: false, )?error: message ?\}/.test(src) && !/if \(message === 'Contact email not found'\) \{\s*return NextResponse\.json\(\{ error: message \}, \{ status: 404 \}\)/.test(src)) {
      offenders.push(`${file}: { error: message }`)
    }
  }
  check('G1 no route or auth handler answers with an exception, provider or database message', offenders, [])
  check('G2 the audit actually covered the routes', files.length > 80, true)

  // ═══════════════════ EXPECTED OUTCOMES KEEP THEIR CODES ═══════════════════

  const gmailRoutes = ['app/api/card/send-gmail/route.ts', 'app/api/contact/send-gmail/route.ts'].map(code)
  check(
    'E1 Gmail: Pro refusal passes through, reconnect keeps its code and product sentence, a missing address is a 404, a bad address a 400',
    gmailRoutes.map((src) => [src.includes('NextResponse.json(gate.body, { status: gate.status })'), /error: err\.message,\s*code: GOOGLE_RECONNECT_CODE,\s*\},\s*\{ status: 403 \}/.test(src), src.includes("if (message === 'Contact email not found')"), src.includes("{ status: 400 }")]),
    [[true, true, true, true], [true, true, true, true]]
  )
  const reconnectMessages = read('lib/google-gmail-auth.ts').match(/new GoogleReconnectRequiredError\('([^']*)'\)/g) ?? []
  check('E2 every reconnect message is a product sentence written in ABC, not relayed from Google', reconnectMessages.length > 0 && reconnectMessages.every((m) => !/error_description|data\.error/.test(m)), true)
  const scan = code('app/api/card/scan/route.ts')
  check(
    'E3 Smart Scan keeps its limit, owner-profile and unreadable-card answers, and charging is untouched',
    [scan.includes("{ error: 'SCAN_LIMIT_REACHED', plan, used, limit }"), scan.includes("code: 'OWNER_PROFILE_MATCH'"), scan.includes('return unreadableCardResponse(502)'), scan.includes('chargeAcceptedCards('), scan.includes('ledgerKeys.singleScan(')],
    [true, true, true, true, true]
  )
  check('E4 pro_required still comes from the shared Pro refusal', /code: 'pro_required'|'pro_required'/.test(read('lib/billing/pro-features.ts')), true)
  check('E5 checkout keeps its codes', code('app/api/billing/checkout/route.ts').includes('{ error: MESSAGES[result.code], code: result.code }'), true)
  check(
    'E6 account deletion and native connectors answer codes only',
    [code('app/api/account/delete/route.ts').includes("refuse('active_subscription', 409)"), code('app/api/connectors/native/start/route.ts').includes('{ code: outcome.code'), code('app/api/connectors/native/claim/route.ts').includes('{ code: outcome.code')],
    [true, true, true]
  )
  check('E7 insufficient Smart Scan credits keep their code', fs.readdirSync(path.join(ROOT, 'lib/scan')).some((f) => read(`lib/scan/${f}`).includes('insufficient')) || read('lib/billing/ledger.ts').includes("'insufficient'"), true)

  // ═══════════════════ SINGLE SCAN, AS SEEN ═══════════════════

  check(
    'S1 a lost connection reads as a lost connection in every browser’s wording, never as "Load failed"',
    ['Load failed', 'Failed to fetch', 'NetworkError when attempting to fetch resource.'].map(formatScanErrorForUser),
    [NETWORK_FAILURE_MESSAGE, NETWORK_FAILURE_MESSAGE, NETWORK_FAILURE_MESSAGE]
  )
  check(
    'S2 a server failure is said as one, not as an unreadable card; an unreadable card still is',
    [formatScanErrorForUser(SCAN_NOT_COMPLETED_ERROR), formatScanErrorForUser('Scan failed'), (SCAN_NOT_COMPLETED_ERROR as string) === (SCAN_CARD_UNREADABLE_ERROR as string)],
    [SCAN_NOT_COMPLETED_ERROR, SCAN_CARD_UNREADABLE_ERROR, false]
  )
  check('S3 saving a scanned contact offline says so in plain words', [userFacingRequestError(new TypeError('Load failed'), 'Could not save this contact.'), userFacingRequestError('x', 'Could not save this contact.')], [NETWORK_FAILURE_MESSAGE, 'Could not save this contact.'])
  const scanClient = code('components/scan/ScanClient.tsx')
  check(
    'S4 the scan screen never parses a non-JSON reply into the browser’s own error words, and both save paths use the plain-words mapping',
    [scanClient.includes('const data = await res.json().catch(() => null)'), scanClient.includes('if (!data) throw new Error(SCAN_NOT_COMPLETED_ERROR)'), scanClient.includes('await identityRes.json().catch(() => ({}))'), scanClient.includes("userFacingRequestError(err, 'Could not save this contact.')"), scanClient.includes("userFacingRequestError(err, 'Could not add this meeting.')"), /setError\(err instanceof Error \? err\.message/.test(scanClient)],
    [true, true, true, true, true, false]
  )
  check('S5 the scan route answers a server failure with the same sentence the screen shows', scan.includes('{ success: false, error: SCAN_NOT_COMPLETED_ERROR }'), true)

  // ═══════════════════ LOGS THAT USED TO CARRY PROVIDER TEXT ═══════════════════

  check(
    'L1 the Gmail callback and native sign-in completion log kinds and statuses, not provider or Supabase messages',
    [/err instanceof Error \? err\.message/.test(code('app/api/auth/google-gmail/callback/route.ts')), /error\?\.message|err instanceof Error \? err\.message/.test(code('app/api/auth/native/complete/route.ts'))],
    [false, false]
  )

  const total = passed + failures.length
  if (failures.length) {
    console.log(`\nError surface: ${passed}/${total} PASS, ${failures.length} FAILED\n`)
    for (const failure of failures) console.log('  FAIL ' + failure)
    process.exit(1)
  }
  console.log(`\nError surface: ${passed}/${total} PASS`)
}

run().catch((err) => {
  release()
  console.error(err)
  process.exit(1)
})
