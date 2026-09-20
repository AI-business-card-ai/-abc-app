/**
 * Final release blocker suite.
 *
 * Run with `npm run test:release-blockers` from the repository root.
 *
 * The pre-launch rehearsal (docs/launch/launch-contracts.md §6) found three
 * objective code blockers. This suite pins that each stays closed:
 *
 *  B0  Android could not receive the native connector hand-back
 *      (io.abccard.app://connect/callback): no intent filter matched it.
 *  B1  Settings → Plan & Billing → Upgrade opened the legacy /pricing catalog,
 *      which sold Starter / Growth / Pro / Team USD subscriptions and advertised
 *      features ABC does not have.
 *  B1a A legacy Growth checkout could be created although the profile plan
 *      constraint rejects `growth`, so the webhook could not record it.
 *
 * Plus the obsolete scripts/setup-stripe.ts, which created that legacy catalog.
 *
 * Nothing here reaches Stripe, Supabase, Google, a CRM or a device. The Android
 * intent matching is the platform's documented rule (scheme, host and path must
 * each match an intent filter's <data>), applied to the real manifest; physical
 * Android QA remains an owner step.
 */
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

delete process.env.NEXT_PUBLIC_SUPABASE_URL
delete process.env.SUPABASE_SERVICE_ROLE_KEY
delete process.env.STRIPE_SECRET_KEY

import { PRODUCT_KEYS } from '@/lib/billing/catalog'
import { webCheckoutAvailable } from '@/lib/billing/commerce'
import { PRO_ACCESS, SCAN_PACKS } from '@/lib/landing/pricing'
import { parseNativeDeepLink } from '@/lib/native/deep-link'
import { planSummary } from '@/lib/settings/plan-summary'

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

const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel))
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')
const flat = (text: string) => text.replace(/\s+/g, ' ').trim()

function files(dir: string, out: string[] = []): string[] {
  if (!exists(dir)) return out
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) files(rel, out)
    else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(entry.name)) out.push(rel)
  }
  return out
}
const SHIPPED = [...files('app'), ...files('components'), ...files('lib'), 'middleware.ts']

/** Components no route imports (pinned by test:launch-ux W3); they never render. */
const UNUSED = ['components/card/CardEditor.tsx', 'components/contact/EventTagPrompt.tsx']

// ═══════════════════ B0 · ANDROID NATIVE RETURNS ═══════════════════

type DataRule = { scheme: string | null; host: string | null; path: string | null; pathPrefix: string | null; pathPattern: string | null; port: string | null }
type Filter = { actions: string[]; categories: string[]; data: DataRule[] }

function androidFilters(): Filter[] {
  const strings = read('android/app/src/main/res/values/strings.xml')
  const stringValue = (name: string) => strings.match(new RegExp(`<string name="${name}">([^<]*)</string>`))?.[1] ?? null
  const resolve = (value: string | null) => (value && value.startsWith('@string/') ? stringValue(value.slice('@string/'.length)) : value)
  const manifest = read('android/app/src/main/AndroidManifest.xml').replace(/<!--[\s\S]*?-->/g, '')
  const attr = (tag: string, name: string) => resolve(tag.match(new RegExp(`android:${name}="([^"]*)"`))?.[1] ?? null)
  return [...manifest.matchAll(/<intent-filter[^>]*>([\s\S]*?)<\/intent-filter>/g)].map(([, body]) => ({
    actions: [...body.matchAll(/<action android:name="([^"]+)"/g)].map((m) => m[1]),
    categories: [...body.matchAll(/<category android:name="([^"]+)"/g)].map((m) => m[1]),
    data: [...body.matchAll(/<data\b[^>]*\/?>/g)].map(([tag]) => ({
      scheme: attr(tag, 'scheme'),
      host: attr(tag, 'host'),
      path: attr(tag, 'path'),
      pathPrefix: attr(tag, 'pathPrefix'),
      pathPattern: attr(tag, 'pathPattern'),
      port: attr(tag, 'port'),
    })),
  }))
}

/**
 * Android's intent resolution for a browsable VIEW link. The <data> attributes of
 * one filter combine: any listed scheme, with any listed host, with any listed path.
 */
function androidOpensApp(filters: Filter[], href: string): boolean {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return false
  }
  const scheme = url.protocol.replace(/:$/, '')
  return filters.some((filter) => {
    if (!filter.actions.includes('android.intent.action.VIEW') || !filter.categories.includes('android.intent.category.BROWSABLE')) return false
    const schemes = filter.data.map((d) => d.scheme).filter(Boolean)
    const hosts = filter.data.map((d) => d.host).filter(Boolean)
    const paths = filter.data.map((d) => d.path).filter(Boolean) as string[]
    const prefixes = filter.data.map((d) => d.pathPrefix).filter(Boolean) as string[]
    // PatternMatcher: `.` any character, `*` zero or more of the preceding character, `.*` anything.
    const patterns = (filter.data.map((d) => d.pathPattern).filter(Boolean) as string[]).map(
      (p) => new RegExp(`^${p.replace(/[\\^$+?()[\]{}|]/g, '\\$&')}$`)
    )
    if (!schemes.includes(scheme)) return false
    if (hosts.length === 0) return true
    if (!hosts.includes(url.hostname)) return false
    if (paths.length === 0 && prefixes.length === 0 && patterns.length === 0) return true
    return paths.includes(url.pathname) || prefixes.some((p) => url.pathname.startsWith(p)) || patterns.some((re) => re.test(url.pathname))
  })
}

function b0() {
  const filters = androidFilters()
  const links = filters.filter((f) => f.actions.includes('android.intent.action.VIEW'))
  check(
    'B0.1 Android declares exactly two custom-scheme returns, each exact: io.abccard.app://auth/callback and io.abccard.app://connect/callback',
    links.map((f) => f.data.map((d) => `${d.scheme}://${d.host}${d.path}`)).sort(),
    [['io.abccard.app://auth/callback'], ['io.abccard.app://connect/callback']]
  )
  check(
    'B0.2 neither filter is broadened: one <data> each, no path prefix or pattern, no port, no http(s), both browsable',
    links.map((f) => [f.data.length, f.data.some((d) => d.pathPrefix || d.pathPattern || d.port), f.data.some((d) => /^https?$/.test(d.scheme ?? '')), f.categories.includes('android.intent.category.BROWSABLE'), f.categories.includes('android.intent.category.DEFAULT')]),
    [[1, false, false, true, true], [1, false, false, true, true]]
  )
  check('B0.3 no App Link auto-verification was added without real assetlinks', /android:autoVerify=/.test(read('android/app/src/main/AndroidManifest.xml')), false)

  const AUTH = 'io.abccard.app://auth/callback?code=abcdefgh12345678&flow=v1.flowflowflowflowflow'
  const CONNECT = 'io.abccard.app://connect/callback?attempt=5b1f0c2e-8a4d-4c6b-9e3f-2a7d1c0b9e8f&handoff=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde'
  const CANCELLED = 'io.abccard.app://connect/callback?attempt=5b1f0c2e-8a4d-4c6b-9e3f-2a7d1c0b9e8f&result=cancelled'
  const OUTSIDE = [
    'io.abccard.app://connect/other',
    'io.abccard.app://connect/callback/extra',
    'io.abccard.app://auth/callbacks',
    'io.abccard.app://settings/callback',
    'io.abccard.app://callback',
    'io.abccard.app.evil://connect/callback',
    'evil://connect/callback',
    'intent://connect/callback#Intent;scheme=io.abccard.app;end',
    'javascript:alert(1)',
    'https://evil.example/connect/callback',
  ]
  check(
    'B0.4 Android opens the app for the sign-in return and the connector return (including a cancelled connection)',
    [AUTH, CONNECT, CANCELLED].map((href) => androidOpensApp(filters, href)),
    [true, true, true]
  )
  check('B0.5 Android does not open the app for any other io.abccard.app path or any other scheme', OUTSIDE.filter((href) => androidOpensApp(filters, href)), [])

  check(
    'B0.6 the parser accepts both returns, and nothing from the link beyond its shape',
    [parseNativeDeepLink(AUTH), parseNativeDeepLink(CONNECT), parseNativeDeepLink(`${CONNECT}&userId=11111111-1111-4111-8111-111111111111&owner=x`)],
    [
      { kind: 'auth-callback', code: 'abcdefgh12345678', flow: 'v1.flowflowflowflowflow' },
      { kind: 'connect-callback', attemptId: '5b1f0c2e-8a4d-4c6b-9e3f-2a7d1c0b9e8f', handoff: 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde' },
      { kind: 'connect-callback', attemptId: '5b1f0c2e-8a4d-4c6b-9e3f-2a7d1c0b9e8f', handoff: 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde' },
    ]
  )
  check(
    'B0.7 the parser rejects every unrelated path and scheme, and a malformed connector return is never a claimable one',
    [
      OUTSIDE.map((href) => parseNativeDeepLink(href)),
      parseNativeDeepLink('io.abccard.app://connect/callback?attempt=../../x&handoff=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde')?.kind,
      parseNativeDeepLink('io.abccard.app://connect/callback?attempt=5b1f0c2e-8a4d-4c6b-9e3f-2a7d1c0b9e8f&handoff=short')?.kind,
      parseNativeDeepLink('http://www.abccard.io/auth/native/return?code=abcdefgh12345678&flow=v1.flowflowflowflowflow'),
    ],
    [OUTSIDE.map(() => null), 'connect-ended', 'connect-ended', null]
  )

  const client = flat(code('lib/native/connect-client.ts'))
  const claimSql = flat(read('supabase/migrations/20260917120000_native_connector_attempts.sql'))
  check(
    'B0.8 the one-time claim protections are unchanged: pending attempt and nonce on the device, session owner on the server, single-use authorized row',
    [
      client.includes('const pending = readPending() if (!pending) return'),
      client.includes('if (link.attemptId && link.attemptId !== pending.attemptId) return'),
      flat(code('app/api/connectors/native/claim/route.ts')).includes('{ identity: user ?? null, attemptId: body?.attemptId, nonce: body?.nonce, handoff: body?.handoff }'),
      claimSql.includes("where a.id = p_attempt_id and a.user_id = p_user_id and a.nonce_hash = p_nonce_hash and a.handoff_hash = p_handoff_hash and a.status = 'authorized' and a.expires_at > now() for update;"),
      claimSql.includes("set status = 'claimed', claimed_at = now(), result_encrypted = null, handoff_hash = null"),
    ],
    [true, true, true, true, true]
  )

  const plist = read('ios/App/App/Info.plist')
  const shell = code('lib/native/shell.ts')
  check(
    'B0.9 iOS and the shell are unchanged: iOS registers the scheme; the shell hands every link to the parser',
    [
      [...plist.matchAll(/<key>CFBundleURLSchemes<\/key>\s*<array>([\s\S]*?)<\/array>/g)].map((m) => [...m[1].matchAll(/<string>([^<]+)<\/string>/g)].map((s) => s[1])),
      shell.includes("App.addListener('appUrlOpen', ({ url }) => void openDeepLink(url))"),
      flat(shell).includes('const link = parseNativeDeepLink(raw) if (!link) return'),
    ],
    [[['io.abccard.app']], true, true]
  )
}

// ═══════════════════ B1 · NO LEGACY CATALOG ═══════════════════

const LEGACY_CLAIMS = /Priority enrichment|Shared contacts|Team pipeline/i
const LEGACY_PLAN_NAMES = /\b(Starter|Growth)\b|\bTeam plan\b|\bTEAM\b/

/*
  What /pricing is allowed to link to.

  The invariant B1.4 enforces is that this page offers no way to pay: no Stripe
  checkout, no billing screen, no external payment host. It enforces it by
  allowlist rather than by blocklist, so a purchase link nobody thought of still
  fails the check.

  The anchor grammar used to be `/#[a-z]+`, which only ever matched a single
  lowercase word. That was fine while every section id was one word and wrong
  the moment the page gained `#follow-up`, `#how-it-works` and
  `#event-intelligence` — legitimate same-page navigation, rejected for its
  punctuation. The grammar below is the slug the ids actually use: lowercase
  words and digits joined by single hyphens, with no leading, trailing or
  doubled hyphen.

  `$` in JavaScript also matches before a trailing newline, so "/#pricing\n"
  would satisfy the pattern alone. Anything with whitespace in it is refused
  before the pattern is consulted.
*/
const PUBLIC_ANCHOR = /^\/#[a-z0-9]+(?:-[a-z0-9]+)*$/
const PUBLIC_ROUTES = new Set(['/', '/register', '/login', '/privacy', '/terms', '/account-deletion'])
const SUPPORT_MAILTO = 'mailto:support@abccard.io'

function isPublicHref(href: string): boolean {
  if (/\s/.test(href)) return false
  return PUBLIC_ROUTES.has(href) || href === SUPPORT_MAILTO || PUBLIC_ANCHOR.test(href)
}

async function renderPage(modulePath: string): Promise<string> {
  // tsx compiles JSX with the classic runtime (tsconfig keeps `jsx: preserve` for Next), which needs React in scope.
  ;(globalThis as { React?: typeof React }).React = React
  const mod = (await import(modulePath)) as { default: () => React.ReactElement }
  return renderToStaticMarkup(React.createElement(mod.default))
}

async function b1() {
  const html = await renderPage('@/app/pricing/page')
  const text = html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ')
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])

  check(
    'B1.1 /pricing names no legacy plan, no USD price and no feature ABC does not have',
    [LEGACY_PLAN_NAMES.test(text), LEGACY_CLAIMS.test(text), /\$\s?\d|\bUSD\b/.test(text)],
    [false, false, false]
  )
  check(
    'B1.2 /pricing shows the current architecture: free card, Smart Scan Packs at the locked prices, one-time, never expiring, and ABC Pro as Event Pass, Monthly and Annual',
    ['Free', '€8', '€17', '€28', 'One-time purchase', 'Credits never expire', 'ABC Pro', 'Event Pass', 'Monthly', 'Annual'].filter((s) => !text.includes(s)),
    []
  )
  check(
    'B1.3 /pricing invents nothing: no scan count, no Pro price, no placeholder figure; undecided prices say "Pricing coming soon"',
    [/\d+\s*Smart Scans/i.test(text), (text.match(/€\s?\d+/g) ?? []).sort(), /\bTBD\b|\bTBC\b|\bXX\b|€\s?0\b/.test(text), text.includes('Pricing coming soon')],
    [false, ['€17', '€28', '€8'], false, true]
  )
  check(
    'B1.4 /pricing offers no purchase: its only calls to action are the free card, sign-in and public pages',
    [...new Set(hrefs.filter((h) => !isPublicHref(h)))],
    []
  )
  /*
    The allowlist itself, pinned. B1.4 can only be as good as this predicate,
    and a predicate widened to admit a hyphen is exactly the kind of change that
    quietly admits a payment link too — so the grammar is stated here as a table
    of what it must accept and what it must still refuse.
  */
  check(
    'B1.4a the allowlist accepts public pages and hyphenated same-page anchors',
    [
      '/',
      '/#pricing',
      '/#follow-up',
      '/#how-it-works',
      '/#event-intelligence',
      '/register',
      '/login',
      '/privacy',
      '/terms',
      '/account-deletion',
      'mailto:support@abccard.io',
    ].filter((href) => !isPublicHref(href)),
    []
  )
  check(
    'B1.4b the allowlist still refuses every way to pay, leave the site or smuggle a link past it',
    [
      // Paying, in every shape this repository could produce one.
      '/pricing/checkout',
      '/settings/billing',
      '/api/stripe/checkout',
      '/api/billing/portal',
      'https://checkout.stripe.com/c/pay/cs_test_123',
      'https://buy.stripe.com/test_123',
      // Leaving the site, including the protocol-relative and scripted forms.
      'https://abccard.io/#pricing',
      '//evil.example/#pricing',
      'javascript:alert(1)',
      'mailto:sales@evil.example',
      // Anchors that are not the slug grammar.
      '/#',
      '/#Pricing',
      '/#follow--up',
      '/#-follow-up',
      '/#follow-up-',
      '/#follow_up',
      '/#follow-up?utm=x',
      '/#follow-up/checkout',
      '/#pricing\n',
      '/#pricing ',
      // Nearly-right routes.
      '/registerx',
      '/login/',
      '/account-deletion#x',
    ].filter((href) => isPublicHref(href)),
    []
  )
  check(
    'B1.5 the page is a server page with no client request of its own',
    [/^\s*['"]use client['"]/.test(read('app/pricing/page.tsx')), /fetch\(|api\/stripe|api\/billing/.test(code('app/pricing/page.tsx'))],
    [false, false]
  )
  check(
    'B1.6 the landing data behind it holds no decided quantity or price (update when the owner decides them)',
    [SCAN_PACKS.map((p) => [p.price, p.scans]), PRO_ACCESS.map((p) => [p.id, p.price, p.includedScans, p.durationDays])],
    [[[8, null], [17, null], [28, null]], [['event', null, null, null], ['monthly', null, null, null], ['annual', null, null, null]]]
  )

  // Success and cancel send everybody to Plan & Billing.
  const redirects: unknown[] = []
  for (const page of ['@/app/pricing/success/page', '@/app/pricing/cancel/page']) {
    const mod = (await import(page)) as { default: () => unknown }
    try {
      mod.default()
      redirects.push('rendered')
    } catch (err) {
      redirects.push(String((err as { digest?: string }).digest ?? err).split(';').slice(0, 3).join(';'))
    }
  }
  check('B1.7 the legacy success and cancel screens redirect to Plan & Billing', redirects, ['NEXT_REDIRECT;replace;/settings/billing', 'NEXT_REDIRECT;replace;/settings/billing'])

  const view = flat(code('components/settings/BillingSettingsView.tsx'))
  check(
    'B1.8 Plan & Billing has no Upgrade button to a catalog: a free web account is told packs cannot be bought here and may read how pricing works',
    [
      />\s*Upgrade\s*</.test(view),
      view.includes('Smart Scan Packs can’t be bought here yet.'),
      view.includes('<Link href="/pricing" className="font-medium text-abc-gold-accent abc-focus-ring"> How pricing works </Link>'),
      (view.match(/href="\/pricing"/g) ?? []).length,
    ],
    [false, true, true, 1]
  )
  check(
    'B1.9 native commerce policy is unchanged: no checkout in the apps, /pricing redirected there, Pro purchase only for configured products',
    [
      webCheckoutAvailable('ios'),
      webCheckoutAvailable('android'),
      webCheckoutAvailable(null),
      view.includes('{!webCheckout ? ('),
      view.includes('{pro.active ? null : !webCheckout ? ('),
      view.includes('buyable.length > 0 ?'),
      flat(code('middleware.ts')).includes("(requestedPath === '/pricing' || requestedPath.startsWith('/pricing/')) && !webCheckoutAvailable(nativePlatformFromHeaders(req.headers))"),
    ],
    [false, false, true, true, true, true, true]
  )

  const reachable = SHIPPED.filter((f) => !UNUSED.includes(f))
  // Comments are stripped: the retired routes explain what they no longer sell.
  check('B1.10 no shipped screen or library claims Priority enrichment, Shared contacts or Team pipeline', reachable.filter((f) => LEGACY_CLAIMS.test(code(f))), [])
  check(
    'B1.11 legacy plan names are used only to label an existing legacy subscriber’s plan, never offered',
    [
      reachable.filter((f) => /PLAN_LABELS/.test(code(f))).sort(),
      planSummary({ plan: 'free' }).planLabel,
      planSummary({ plan: 'starter', stripe_customer_id: 'cus_x' }).planLabel,
    ],
    [['lib/settings/plan-summary.ts', 'lib/stripe-prices.ts'], 'Free', 'Starter']
  )
  check(
    'B1.12 the scan limit no longer tells anybody to upgrade to a plan that cannot be bought',
    ['components/scan/ScanClient.tsx', 'components/scan/MultiCardClient.tsx'].filter((f) => /Upgrade to/.test(code(f))),
    []
  )
}

// ═══════════════════ B1a · NO LEGACY GROWTH CHECKOUT ═══════════════════

async function b1a() {
  const { POST } = (await import('@/app/api/stripe/checkout/route')) as { POST: (req?: Request) => Promise<Response> }
  const responses = []
  for (const plan of ['starter', 'growth', 'pro', 'team']) {
    const res = await POST(new Request('https://www.abccard.io/api/stripe/checkout', { method: 'POST', body: JSON.stringify({ plan }) }))
    responses.push([plan, res.status, (await res.json()) as unknown, res.headers.get('cache-control')])
  }
  const retired = { error: 'This plan is no longer offered.', code: 'legacy_plans_retired' }
  check(
    'B1a.1 the legacy checkout creates nothing for any legacy plan, Growth included: 410, no-store',
    responses,
    ['starter', 'growth', 'pro', 'team'].map((plan) => [plan, 410, retired, 'no-store'])
  )
  const { GET } = (await import('@/app/api/stripe/session/route')) as { GET: () => Promise<Response> }
  const session = await GET()
  check('B1a.2 the legacy session lookup is retired too', [session.status, ((await session.json()) as { code?: string }).code], [410, 'legacy_plans_retired'])

  const checkoutRoute = code('app/api/stripe/checkout/route.ts')
  check(
    'B1a.3 the retired routes import no Stripe client and read no legacy price',
    [/from 'stripe'|STRIPE_|stripe-prices|sessions\.create/.test(checkoutRoute + code('app/api/stripe/session/route.ts'))],
    [false]
  )
  check(
    'B1a.4 the only code that creates a Checkout Session is the current catalog checkout, and no shipped code sells a legacy plan',
    [
      SHIPPED.filter((f) => /checkout\.sessions\.create\(/.test(code(f))),
      SHIPPED.filter((f) => /api\/stripe\/checkout/.test(code(f))),
      SHIPPED.filter((f) => /getStripePriceId|PLAN_PRICES_USD/.test(code(f))),
      SHIPPED.filter((f) => /STRIPE_PRICE_GROWTH/.test(code(f))),
    ],
    [['lib/billing/checkout.ts'], [], [], ['lib/stripe-prices.ts']]
  )
  check(
    'B1a.5 Growth is not reintroduced: the catalog sells exactly the six current products, and no migration re-allows growth after 20260712',
    [
      [...PRODUCT_KEYS],
      fs.readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f > '20260712160000' && /'growth'/.test(read(`supabase/migrations/${f}`))),
    ],
    [['scan_pack_8', 'scan_pack_17', 'scan_pack_28', 'pro_event', 'pro_monthly', 'pro_annual'], []]
  )
  const webhook = flat(code('lib/billing/webhook.ts'))
  check(
    'B1a.6 existing customers are still served: legacy completion and cancellation, the billing portal, and the current checkout, ledger and entitlements',
    [
      webhook.includes('await deps.store.legacyPlanActivated({ userId: legacyUserId, plan, customerId, subscriptionId })'),
      webhook.includes('await deps.store.legacyPlanCanceled(customerId)'),
      exists('app/api/stripe/portal/route.ts') && /billingPortal\.sessions\.create|portal/.test(code('app/api/stripe/portal/route.ts')),
      code('app/api/billing/checkout/route.ts').includes('createCheckoutSession('),
      ['20260912120000_smart_scan_credit_ledger.sql'].every((f) => exists(`supabase/migrations/${f}`)),
      ['scan_credit_ledger', 'billing_entitlements', 'stripe_webhook_events'].every((t) => read('supabase/migrations/20260912120000_smart_scan_credit_ledger.sql').includes(`create table if not exists public.${t}`)),
    ],
    [true, true, true, true, true, true]
  )
}

// ═══════════════════ OBSOLETE STRIPE SETUP ═══════════════════

function stripeScript() {
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> }
  const allScripts = [...files('scripts'), ...SHIPPED]
  check(
    'S.1 the obsolete legacy Stripe catalog script is gone and nothing can invoke it',
    [
      exists('scripts/setup-stripe.ts'),
      Object.entries(pkg.scripts).filter(([name, cmd]) => /setup-stripe/.test(name + cmd)),
      allScripts.filter((f) => f !== 'scripts/test-release-blockers.ts' && /setup-stripe/.test(read(f))),
    ],
    [false, [], []]
  )
  check(
    'S.2 no script or shipped code creates Stripe products or prices',
    allScripts.filter((f) => /\.products\.create\(|\.prices\.create\(/.test(code(f))),
    []
  )
}

async function main() {
  b0()
  await b1()
  await b1a()
  stripeScript()

  const total = passed + failures.length
  if (failures.length) {
    console.log(`\nRelease blockers: ${passed}/${total} PASS, ${failures.length} FAILED\n`)
    for (const failure of failures) console.log('  FAIL ' + failure)
    process.exit(1)
  }
  console.log(`\nRelease blockers: ${passed}/${total} PASS`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
