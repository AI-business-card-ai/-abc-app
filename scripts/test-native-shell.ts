/**
 * Native shell (Task #5B): the iOS and Android apps around ABC.
 *
 * Run with `npm run test:native` from the repository root.
 *
 * The pure seams are exercised directly: runtime detection, the link policy, the
 * deep-link parser, the sealed sign-in flow, file naming, the commerce gate, the
 * store billing seam and the shared sign-in destination. The routes that decide
 * what the app may do are called for real where they run without a network —
 * native sign-in start, return and completion up to the code exchange, the
 * checkout refusal, the connector refusal and the pricing redirect. The generated
 * native projects are read as files: identity, permissions, schemes, backup, file
 * sharing, and a scan for anything secret.
 *
 * Nothing here reaches Supabase, Stripe, Apple or Google. Every file is read with
 * its line endings normalised, so a CRLF working copy on Windows reads the same as
 * the committed blob.
 */
import fs from 'node:fs'
import path from 'node:path'

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

const abs = (rel: string) => path.join(ROOT, rel)
const exists = (rel: string) => fs.existsSync(abs(rel))
const read = (rel: string) => fs.readFileSync(abs(rel), 'utf8').replace(/\r\n/g, '\n')
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const code = (rel: string) => stripComments(read(rel))

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'build', 'DerivedData', 'Pods', 'xcuserdata', '.gradle', '.idea', '.cxx'])
const BINARY = /\.(png|jpe?g|gif|webp|jar|keystore|jks|p12|zip|aab|apk|ttf|otf|ico)$/i

function listFiles(rel: string): string[] {
  if (!exists(rel)) return []
  return fs.readdirSync(abs(rel), { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(rel, entry.name).replace(/\\/g, '/')
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : listFiles(child)
    return [child]
  })
}

async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const { log, error, warn } = console
  console.log = () => undefined
  console.error = () => undefined
  console.warn = () => undefined
  try {
    return await fn()
  } finally {
    console.log = log
    console.error = error
    console.warn = warn
  }
}

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ABCCardNative/ios'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36 ABCCardNative/android'
const SAFARI_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const ORIGIN = 'https://www.abccard.io'

// Configuration the routes read at request time, and keys some modules read at import time.
process.env.NATIVE_AUTH_SECRET = 'native-shell-test-secret-0123456789abcdef'
process.env.NEXT_PUBLIC_APP_URL = ORIGIN
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project-ref.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-anon-key'
process.env.RESEND_API_KEY ??= 're_native_shell_test'
process.env.ANTHROPIC_API_KEY ??= 'native-shell-test'
delete process.env.ABC_NATIVE_ORIGIN

async function main() {
  const { default: capacitorConfig } = await import('../capacitor.config')
  const config = await import('@/lib/native/config')
  const runtime = await import('@/lib/native/runtime')
  const { classifyNavigation } = await import('@/lib/native/navigation')
  const { parseNativeDeepLink, NATIVE_AUTH_CALLBACK_URL } = await import('@/lib/native/deep-link')
  const flow = await import('@/lib/native/auth-flow')
  const { downloadFilename, fallbackDownloadName } = await import('@/lib/native/files')
  const commerce = await import('@/lib/billing/commerce')
  const store = await import('@/lib/billing/native-store')
  const { resolveSignInDestination } = await import('@/lib/auth/sign-in-destination')
  const { refuseNativeConnect, NATIVE_CONNECT_UNAVAILABLE_PATH } = await import('@/lib/native/connect-gate')
  const { NextRequest } = await import('next/server')

  const sourceFiles = ['app', 'components', 'lib']
    .flatMap((dir) => listFiles(dir))
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .concat(['middleware.ts'])

  // ═══════════════════ ARCHITECTURE / RUNTIME ═══════════════════

  check('N01 on the server and on the web there is no native platform', [runtime.getNativePlatform(), runtime.isNativeApp()], [null, false])

  const globalRef = globalThis as unknown as { window?: unknown }
  const withBridge = (bridge: unknown) => {
    globalRef.window = { Capacitor: bridge }
    try {
      return runtime.getNativePlatform()
    } finally {
      delete globalRef.window
    }
  }
  check(
    'N02 inside the shell the bridge names the platform; a web bridge is not native',
    [
      withBridge({ isNativePlatform: () => true, getPlatform: () => 'ios' }),
      withBridge({ isNativePlatform: () => true, getPlatform: () => 'android' }),
      withBridge({ isNativePlatform: () => false, getPlatform: () => 'web' }),
      withBridge(undefined),
    ],
    ['ios', 'android', null, null]
  )
  check(
    'N03 the server reads only the exact user-agent marker',
    [IOS_UA, ANDROID_UA, SAFARI_UA, 'Foo XABCCardNative/ios', 'ABCCardNative/windows', ''].map((ua) => runtime.nativePlatformFromUserAgent(ua)),
    ['ios', 'android', null, null, null, null]
  )

  const staticCapacitor = sourceFiles.filter((file) => /from\s+['"]@capacitor\//.test(code(file)))
  check('N04 only the shell and the file handoff import Capacitor statically', staticCapacitor.sort(), ['lib/native/downloads.ts', 'lib/native/shell.ts'])
  check(
    'N04b and nothing outside those two imports them except on demand',
    sourceFiles
      .filter((file) => !['lib/native/shell.ts', 'lib/native/downloads.ts'].includes(file))
      .filter((file) => /from\s+['"]@\/lib\/native\/(shell|downloads)['"]/.test(code(file))),
    []
  )
  check(
    'N04c no other file inspects window.Capacitor or the native marker',
    sourceFiles.filter((file) => /window\.Capacitor|\.Capacitor\b|ABCCardNative/.test(code(file)) && !['lib/native/runtime.ts', 'lib/native/config.ts'].includes(file)),
    []
  )
  const bridge = code('components/native/NativeShellBridge.tsx')
  check(
    'N05 the bridge is client-only, renders nothing, and checks before loading the shell',
    [read('components/native/NativeShellBridge.tsx').startsWith("'use client'"), bridge.includes('return null'), bridge.indexOf('if (!isNativeApp()) return') < bridge.indexOf("import('@/lib/native/shell')"), code('app/layout.tsx').includes('<NativeShellBridge />')],
    [true, true, true, true]
  )

  // ═══════════════════ IDENTITY / ORIGIN ═══════════════════

  const plist = read('ios/App/App/Info.plist')
  const pbxproj = read('ios/App/App.xcodeproj/project.pbxproj')
  const manifestXml = read('android/app/src/main/AndroidManifest.xml')
  const strings = read('android/app/src/main/res/values/strings.xml')
  const gradle = read('android/app/build.gradle')
  const plistString = (key: string) => (new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(plist) ?? [])[1] ?? null

  check('N06 the app is called ABC Card everywhere', [config.NATIVE_APP_NAME, capacitorConfig.appName, plistString('CFBundleDisplayName'), /<string name="app_name">ABC Card<\/string>/.test(strings)], ['ABC Card', 'ABC Card', 'ABC Card', true])
  check(
    'N06b one app id, in the config and both projects',
    [config.NATIVE_APP_ID, capacitorConfig.appId, (pbxproj.match(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g) ?? []).map((l) => l.split(' = ')[1]), /applicationId "io\.abccard\.app"/.test(gradle), /namespace = "io\.abccard\.app"/.test(gradle), /<string name="package_name">io\.abccard\.app<\/string>/.test(strings)],
    ['io.abccard.app', 'io.abccard.app', ['io.abccard.app;', 'io.abccard.app;'], true, true, true]
  )
  check('N06c the id is marked provisional where it is defined', /PROVISIONAL/.test(read('lib/native/config.ts')) && /PROVISIONAL/.test(read('native-shell/README.md')), true)

  check('N07 the shell loads the canonical origin by default', [capacitorConfig.server?.url, config.DEFAULT_NATIVE_ORIGIN], [ORIGIN, ORIGIN])
  const rejects = (value: string) => {
    try {
      config.resolveNativeOrigin(value)
      return false
    } catch {
      return true
    }
  }
  check(
    'N07b the origin is configurable, https only, bare, and never a Vercel deployment',
    [config.resolveNativeOrigin('https://abccard.io/'), rejects('http://www.abccard.io'), rejects('https://abc-app-git-main.vercel.app'), rejects('https://www.abccard.io/home'), rejects('https://user:pw@www.abccard.io'), rejects('not a url')],
    ['https://abccard.io', true, true, true, true, true]
  )
  const nativeTree = [...listFiles('ios'), ...listFiles('android'), ...listFiles('native-shell/www'), 'capacitor.config.ts', ...listFiles('lib/native')].filter((f) => !BINARY.test(f))
  check('N07c no Vercel deployment hostname anywhere in the native tree', nativeTree.filter((f) => /[a-z0-9-]+\.vercel\.app/i.test(read(f).replace(/\*\.vercel\.app|\\\.vercel\\\.app/g, ''))), [])
  check('N07d the local error page retries the same origin', read('native-shell/www/native-origin.js').includes(`window.ABC_NATIVE_ORIGIN = "${ORIGIN}"`), true)
  check(
    'N08 server configuration: https, no cleartext, no navigation allowlist, a local error page',
    [capacitorConfig.server?.androidScheme, capacitorConfig.server?.cleartext, capacitorConfig.server?.allowNavigation, capacitorConfig.server?.appStartPath, capacitorConfig.server?.errorPath, exists(`${capacitorConfig.webDir}/error.html`)],
    ['https', false, undefined, '/home', 'error.html', true]
  )
  check(
    'N08b platform configuration: user-agent markers, no mixed content, the page\'s own fetch and cookies',
    [capacitorConfig.ios?.appendUserAgent, capacitorConfig.android?.appendUserAgent, capacitorConfig.android?.allowMixedContent, capacitorConfig.ios?.limitsNavigationsToAppBoundDomains, capacitorConfig.plugins?.CapacitorHttp, capacitorConfig.plugins?.CapacitorCookies],
    ['ABCCardNative/ios', 'ABCCardNative/android', false, false, { enabled: false }, { enabled: false }]
  )

  // ═══════════════════ NAVIGATION ═══════════════════

  const nav = (href: string) => classifyNavigation(href, ORIGIN)
  check(
    'N09 ABC pages stay in the app, from either origin',
    [nav('/contacts'), nav(`${ORIGIN}/d/jane-doe?src=qr`), nav('https://abccard.io/d/jane-doe'), nav('/api/card/wallet/google')],
    [{ kind: 'internal', path: '/contacts' }, { kind: 'internal', path: '/d/jane-doe?src=qr' }, { kind: 'internal', path: '/d/jane-doe' }, { kind: 'internal', path: '/api/card/wallet/google' }]
  )
  check(
    'N10 ABC file responses are downloads',
    ['/api/card/vcard/jane-doe', '/api/card/wallet/apple', '/api/card/qr/jane-doe?size=2048', '/api/export/csv'].map((href) => nav(href).kind),
    ['download', 'download', 'download', 'download']
  )
  check(
    'N11 other sites open outside the app',
    [nav('https://www.linkedin.com/in/jane').kind, nav('https://wa.me/420123456789?text=hi').kind, nav('http://example.com').kind],
    ['external', 'external', 'external']
  )
  check('N12 mail, phone and SMS belong to the OS', ['mailto:jane@example.com', 'tel:+420123456789', 'sms:+420123456789'].map((href) => nav(href).kind), ['system', 'system', 'system'])
  check(
    'N13 every other scheme is refused',
    ['javascript:alert(1)', 'file:///etc/passwd', 'intent://scan/#Intent;scheme=zxing;end', 'data:text/html,<b>x</b>', 'io.abccard.app://auth/callback?code=x', 'http://[bad'].map((href) => nav(href).kind),
    ['blocked', 'blocked', 'blocked', 'blocked', 'blocked', 'blocked']
  )
  const shell = code('lib/native/shell.ts')
  check(
    'N14 the shell routes links, new tabs and window.open through the policy, and external sites through the system browser',
    [shell.includes("document.addEventListener('click', onClick, true)"), shell.includes('classifyNavigation(anchor.href, origin)'), shell.includes('window.open = ((url?: string | URL) =>'), (shell.match(/Browser\.open\(\{ url: decision\.url \}\)/g) ?? []).length, shell.includes("anchor.target === '_blank'")],
    [true, true, true, 2, true]
  )

  // ═══════════════════ AUTH ═══════════════════

  const googleButton = code('components/auth/GoogleSignInButton.tsx')
  const appleButton = code('components/auth/AppleSignInButton.tsx')
  const googleLib = code('lib/google-oauth.ts')
  const signIn = googleLib.slice(googleLib.indexOf('export async function signInWithGoogle'), googleLib.indexOf('export function isGoogleProvider'))
  check('N15 web Google sign-in is unchanged: identity only, same helper, native path only behind the seam', [/scopes|access_type|prompt/.test(signIn), googleButton.includes('signInWithGoogle(supabase, nextPath, connectUserId)'), googleButton.indexOf('if (isNativeApp())') < googleButton.indexOf('createClientComponent()')], [false, true, true])
  check('N16 web Apple sign-in is unchanged the same way', [appleButton.includes('signInWithApple(supabase, nextPath, connectUserId)'), appleButton.indexOf('if (isNativeApp())') < appleButton.indexOf('createClientComponent()'), code('lib/apple-oauth.ts').includes('redirectTo: getOAuthCallbackUrl(nextPath, connectUserId)')], [true, true, true])
  const callback = code('app/auth/callback/route.ts')
  check(
    'N17 the web callback still exchanges its own PKCE code, stops for recovery first, and shares only the destination',
    [callback.includes('exchangeCodeForSession(code)'), callback.indexOf('if (isRecovery)') < callback.indexOf('resolveSignInDestination('), /requirePro|lib\/entitlements/.test(callback), callback.includes("from('abc_profiles')")],
    [true, true, false, false]
  )

  const { POST: nativeStart } = await import('@/app/api/auth/native/start/route')
  const { GET: nativeReturn } = await import('@/app/auth/native/return/route')
  const { POST: nativeComplete } = await import('@/app/api/auth/native/complete/route')

  const post = (url: string, body: unknown, ua = IOS_UA) =>
    new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'user-agent': ua } })

  const nonce = 'n'.repeat(43).replace(/n/g, () => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'[Math.floor(Math.random() * 64)])
  const nonceHash = flow.hashNativeNonce(nonce)

  const startRes = await quietly(() => nativeStart(post(`${ORIGIN}/api/auth/native/start`, { provider: 'google', next: '//evil.example', nonceHash, connect: 'not-a-uuid' })))
  const started = (await startRes.json()) as { authorizeUrl: string }
  const authorize = new URL(started.authorizeUrl)
  const redirectTo = new URL(authorize.searchParams.get('redirect_to') ?? 'about:blank')
  const sealed = redirectTo.searchParams.get('flow') ?? ''
  const opened = flow.openNativeAuthFlow(sealed)
  check(
    'N18 native sign-in start returns Supabase\'s PKCE authorize URL pointing back at the return page',
    [startRes.status, startRes.headers.get('cache-control'), `${authorize.origin}${authorize.pathname}`, authorize.searchParams.get('provider'), authorize.searchParams.get('code_challenge_method'), `${redirectTo.origin}${redirectTo.pathname}`],
    [200, 'no-store', 'https://project-ref.supabase.co/auth/v1/authorize', 'google', 's256', `${ORIGIN}/auth/native/return`]
  )
  check(
    'N18b the flow is sealed: the verifier never appears in the URL, the challenge is its S256, the destination and connect are sanitised',
    opened.ok ? [started.authorizeUrl.includes(opened.flow.verifier), authorize.searchParams.get('code_challenge') === require('node:crypto').createHash('sha256').update(opened.flow.verifier).digest('base64url'), opened.flow.nonceHash === nonceHash, opened.flow.next, opened.flow.connect] : ['flow did not open'],
    [false, true, true, '/dashboard', null]
  )
  const refusedStart = await quietly(async () => {
    const badProvider = await nativeStart(post(`${ORIGIN}/api/auth/native/start`, { provider: 'github', nonceHash }))
    const badNonce = await nativeStart(post(`${ORIGIN}/api/auth/native/start`, { provider: 'apple', nonceHash: 'short' }))
    const secret = process.env.NATIVE_AUTH_SECRET
    delete process.env.NATIVE_AUTH_SECRET
    const unconfigured = await nativeStart(post(`${ORIGIN}/api/auth/native/start`, { provider: 'apple', nonceHash }))
    process.env.NATIVE_AUTH_SECRET = secret
    return [badProvider.status, badNonce.status, unconfigured.status]
  })
  check('N18c start refuses unknown providers, malformed nonces, and runs nothing unconfigured', refusedStart, [400, 400, 503])

  const returnPage = async (query: string) => {
    const res = await quietly(() => nativeReturn(new NextRequest(`${ORIGIN}/auth/native/return?${query}`)))
    return { status: res.status, html: await res.text(), headers: res.headers }
  }
  const goodReturn = await returnPage(`flow=${encodeURIComponent(sealed)}&code=0b2c7a14-4f5e-4d7a-9d3b-8a1e2c3d4e5f`)
  check(
    'N19 the return page hands code and flow to the app scheme and nothing else',
    [goodReturn.html.includes(`${NATIVE_AUTH_CALLBACK_URL}?code=0b2c7a14-4f5e-4d7a-9d3b-8a1e2c3d4e5f&amp;flow=`), goodReturn.headers.get('cache-control'), goodReturn.headers.get('referrer-policy')],
    [true, 'no-store', 'no-referrer']
  )
  /*
    The forgery alters the first character of the auth tag, not the last. The
    tag is 16 bytes in 22 base64url characters, so its last character carries
    four padding bits: whenever the tag happened to end in 'A', swapping it for
    'B' decoded to the very same bytes, the "forged" flow opened, and this check
    failed on roughly one run in four without anything being wrong. The first
    character is six significant bits, so changing it always changes the tag.
  */
  const forgedSealed = (() => {
    const parts = sealed.split('.')
    const tag = parts[parts.length - 1] ?? ''
    parts[parts.length - 1] = (tag.startsWith('A') ? 'B' : 'A') + tag.slice(1)
    return parts.join('.')
  })()
  const forgedReturn = await returnPage(`flow=${encodeURIComponent(forgedSealed)}&code=0b2c7a14-4f5e-4d7a-9d3b-8a1e2c3d4e5f`)
  const cancelledReturn = await returnPage(`flow=${encodeURIComponent(sealed)}&error=access_denied`)
  const injectedReturn = await returnPage(`flow=${encodeURIComponent(sealed)}&code=${encodeURIComponent('</script><script>alert(1)</script>')}`)
  check(
    'N19b a forged flow fails, a cancel says so, and an injected code never reaches the page',
    [forgedReturn.html.includes('auth/callback?error=failed'), cancelledReturn.html.includes('auth/callback?error=cancelled'), injectedReturn.html.includes('auth/callback?error=failed'), injectedReturn.html.includes('alert(1)')],
    [true, true, true, false]
  )

  check(
    'N20 the deep-link parser accepts only the app scheme callback and ABC\'s own verified links',
    [
      parseNativeDeepLink(`io.abccard.app://auth/callback?code=0b2c7a14-4f5e&flow=${sealed}`)?.kind,
      parseNativeDeepLink(`${ORIGIN}/auth/native/return?code=0b2c7a14-4f5e&flow=${sealed}`)?.kind,
      parseNativeDeepLink('io.abccard.app://auth/callback?error=cancelled')?.kind,
      parseNativeDeepLink('io.abccard.app://auth/callback?code=x&flow=y')?.kind,
      parseNativeDeepLink('io.abccard.app://evil/callback?code=0b2c7a14-4f5e&flow=' + sealed),
      parseNativeDeepLink('evilapp://auth/callback?code=0b2c7a14-4f5e&flow=' + sealed),
      parseNativeDeepLink('https://evil.example/auth/native/return?code=0b2c7a14-4f5e&flow=' + sealed),
      parseNativeDeepLink('https://abccard.io/d/jane-doe'),
    ],
    ['auth-callback', 'auth-callback', 'auth-cancelled', 'auth-failed', null, null, null, { kind: 'open-path', path: '/d/jane-doe' }]
  )

  const env = { NATIVE_AUTH_SECRET: 'another-secret-another-secret-0123456789' }
  const sampleFlow = { provider: 'apple' as const, verifier: flow.createPkcePair().verifier, nonceHash, next: '/home', connect: null, expiresAt: Math.floor(Date.now() / 1000) + 60 }
  const sealedSample = flow.sealNativeAuthFlow(sampleFlow)
  const parts = sealedSample.split('.')
  const flipped = [parts[0], parts[1], parts[2].slice(0, -2) + (parts[2].endsWith('AA') ? 'BB' : 'AA'), parts[3]].join('.')
  check(
    'N21 the sealed flow opens only unaltered, unexpired, under the same secret',
    [
      flow.openNativeAuthFlow(sealedSample).ok,
      flow.openNativeAuthFlow(flipped).ok ? 'opened' : (flow.openNativeAuthFlow(flipped) as { reason: string }).reason,
      (flow.openNativeAuthFlow([parts[0], parts[1], parts[2], parts[3].slice(0, 8)].join('.')) as { reason?: string }).reason,
      (flow.openNativeAuthFlow(sealedSample, Date.now() + 120_000) as { reason?: string }).reason,
      (flow.openNativeAuthFlow(sealedSample, Date.now(), env) as { reason?: string }).reason,
      (flow.openNativeAuthFlow(sealedSample, Date.now(), {}) as { reason?: string }).reason,
      (flow.openNativeAuthFlow('v2.a.b.c') as { reason?: string }).reason,
      (flow.openNativeAuthFlow(flow.sealNativeAuthFlow({ ...sampleFlow, next: '//evil.example' })) as { reason?: string }).reason,
    ],
    [true, 'forged', 'forged', 'expired', 'forged', 'not_configured', 'malformed', 'malformed']
  )
  check(
    'N22 the nonce must be the one behind the hash',
    [flow.nativeNonceMatches(nonce, nonceHash), flow.nativeNonceMatches(nonce.replace(/.$/, nonce.endsWith('a') ? 'b' : 'a'), nonceHash), flow.nativeNonceMatches(42, nonceHash), flow.nativeNonceMatches('short', nonceHash)],
    [true, false, false, false]
  )

  const realFetch = globalThis.fetch
  const fetchCalls: { url: string; body: string }[] = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    fetchCalls.push({ url: String(input), body: String(init?.body ?? '') })
    return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  try {
    const complete = async (body: unknown) => {
      const res = await quietly(() => nativeComplete(post(`${ORIGIN}/api/auth/native/complete`, body)))
      return { status: res.status, body: (await res.json()) as { code?: string; redirect?: string }, cookie: res.headers.get('set-cookie') }
    }
    const badCode = await complete({ code: '<x>', flow: sealed, nonce })
    const forged = await complete({ code: '0b2c7a14-4f5e', flow: flipped, nonce })
    const wrongNonce = await complete({ code: '0b2c7a14-4f5e', flow: sealed, nonce: nonce.replace(/.$/, nonce.endsWith('a') ? 'b' : 'a') })
    check(
      'N23 completion refuses a bad code, a forged flow and a wrong nonce before anything reaches Supabase',
      [badCode.status, badCode.body.code, forged.status, forged.body.code, wrongNonce.status, wrongNonce.body.code, fetchCalls.length],
      [400, 'oauth_missing_code', 400, 'oauth_exchange_failed', 400, 'oauth_exchange_failed', 0]
    )
    const rightNonce = await complete({ code: '0b2c7a14-4f5e', flow: sealed, nonce })
    const sent = fetchCalls[0] ? JSON.parse(fetchCalls[0].body) : null
    check(
      'N23b with the right nonce it exchanges the code with the sealed verifier, and a refused exchange sets no session',
      [fetchCalls.length, fetchCalls[0]?.url, opened.ok ? sent?.code_verifier === opened.flow.verifier : false, sent?.auth_code, rightNonce.status, rightNonce.body.code, rightNonce.cookie, rightNonce.body.redirect],
      [1, 'https://project-ref.supabase.co/auth/v1/token?grant_type=pkce', true, '0b2c7a14-4f5e', 400, 'oauth_exchange_failed', null, undefined]
    )
  } finally {
    globalThis.fetch = realFetch
  }

  const exchanged = await flow.exchangeNativeAuthCode({
    supabaseUrl: 'https://project-ref.supabase.co/',
    anonKey: 'k',
    code: 'c',
    verifier: 'v',
    fetchImpl: (async () => new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r' }), { status: 200 })) as typeof fetch,
  })
  const halfExchanged = await flow.exchangeNativeAuthCode({
    supabaseUrl: 'https://project-ref.supabase.co',
    anonKey: 'k',
    code: 'c',
    verifier: 'v',
    fetchImpl: (async () => new Response(JSON.stringify({ access_token: 'a' }), { status: 200 })) as typeof fetch,
  })
  check('N24 the exchange accepts only a complete token pair', [exchanged, halfExchanged], [{ ok: true, accessToken: 'a', refreshToken: 'r' }, { ok: false, status: 200 }])
  check(
    'N25 the return origin comes from configuration: https, or localhost in development',
    [flow.nativeAuthReturnOrigin('https://www.abccard.io/'), flow.nativeAuthReturnOrigin('http://localhost:3000'), flow.nativeAuthReturnOrigin('http://www.abccard.io'), flow.nativeAuthReturnOrigin(undefined)],
    ['https://www.abccard.io', 'http://localhost:3000', null, null]
  )
  const authClient = code('lib/native/auth-client.ts')
  check(
    'N26 the app keeps the nonce, ignores a return it did not start, and closes the browser before completing',
    [authClient.includes('const pending = takePending()\n  if (!pending) return'), authClient.includes('window.localStorage.removeItem(PENDING_KEY)'), authClient.indexOf('Browser.close()') < authClient.indexOf("fetch('/api/auth/native/complete'"), authClient.includes('nonce: pending.nonce'), /nonce:\s*nonce\b/.test(authClient.slice(authClient.indexOf("fetch('/api/auth/native/start'"), authClient.indexOf('writePending(')))],
    [true, true, true, true, false]
  )

  // ═══════════════════ CONNECTORS ═══════════════════

  const callbacks = ['google-gmail', 'hubspot', 'salesforce', 'pipedrive'].map((p) => code(`app/api/auth/${p}/callback/route.ts`))
  const starts = ['google-gmail', 'hubspot', 'salesforce', 'pipedrive'].map((p) => code(`app/api/auth/${p}/route.ts`))
  check(
    'N27 connector callbacks still consume the signed state and require the session owner to match it',
    callbacks.map((src) => src.includes('consumeOAuthState(') && /user\.id !== \w+\.ownerId/.test(src)),
    [true, true, true, true]
  )
  check(
    'N27b connector starts still bind the state to the session user, and decline the app first',
    starts.map((src) => /createOAuthState\(\{\s*ownerId: user\.id/.test(src) && src.indexOf('refuseNativeConnect(request)') < src.indexOf('createRouteHandlerClient()')),
    [true, true, true, true]
  )
  const nativeRefusal = refuseNativeConnect(new NextRequest(`${ORIGIN}/api/auth/hubspot`, { headers: { 'user-agent': ANDROID_UA } }))
  check(
    'N28 the app is sent back to Integrations; a browser is not refused',
    [nativeRefusal?.status, nativeRefusal?.headers.get('location'), refuseNativeConnect(new NextRequest(`${ORIGIN}/api/auth/hubspot`, { headers: { 'user-agent': SAFARI_UA } }))],
    [307, `${ORIGIN}${NATIVE_CONNECT_UNAVAILABLE_PATH}`, null]
  )
  const integrations = code('components/settings/IntegrationsSettingsView.tsx')
  check(
    'N29 Integrations explains in the app and offers no connect button there',
    [integrations.includes('{nativeApp ? null : pro ? ('), integrations.includes('isn’t available in the app yet'), code('app/settings/integrations/page.tsx').includes('nativeApp={nativePlatformFromHeaders(headers()) !== null}')],
    [true, true, true]
  )

  // ═══════════════════ SIGN-IN DESTINATION ═══════════════════

  type Args = Parameters<typeof resolveSignInDestination>[0]
  const reader = (result: { data: unknown; error: unknown }) =>
    ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }) }) as unknown as Args['supabase']
  const inserted: unknown[] = []
  let serviceCreated = 0
  const service = (error: unknown) => () => {
    serviceCreated++
    return { from: () => ({ insert: async (row: unknown) => (inserted.push(row), { error }) }) } as unknown as Args['supabase']
  }
  const destination = (supabase: Args['supabase'], createService: Args['createService']) =>
    quietly(() => resolveSignInDestination({ supabase, createService, user: { id: 'u1', email: 'a@b.c' }, next: '/contacts', googleLogin: true, logPrefix: '[test]' }))
  const outcomes = [
    await destination(reader({ data: { id: 'u1', onboarding_completed: true }, error: null }), service(null)),
    await destination(reader({ data: { id: 'u1', onboarding_completed: false }, error: null }), service(null)),
  ]
  const createdBeforeInsert = serviceCreated
  outcomes.push(
    await destination(reader({ data: null, error: null }), service(null)),
    await destination(reader({ data: null, error: null }), service({ code: '23505', message: 'duplicate' })),
    await destination(reader({ data: null, error: null }), service({ code: '42501', message: 'denied' })),
    await destination(reader({ data: null, error: { code: '42501', message: 'rls' } }), service(null))
  )
  check(
    'N30 one destination rule for web and native sign-in',
    outcomes,
    [
      { ok: true, destination: '/contacts' },
      { ok: true, destination: '/onboarding' },
      { ok: true, destination: '/onboarding' },
      { ok: true, destination: '/onboarding' },
      { ok: false, code: 'oauth_profile_failed', detail: 'denied' },
      { ok: false, code: 'oauth_profile_failed', detail: 'rls' },
    ]
  )
  check(
    'N30b the service role is used only for a new profile, and the new profile carries no mailbox',
    [createdBeforeInsert, (inserted[0] as Record<string, unknown>)?.google_connected, (inserted[0] as Record<string, unknown>)?.google_refresh_token, (inserted[0] as Record<string, unknown>)?.onboarding_completed],
    [0, false, null, false]
  )

  // ═══════════════════ CAMERA / FILES / PERMISSIONS ═══════════════════

  check('N31 iOS says truthfully why it needs the camera', /business cards/i.test(plistString('NSCameraUsageDescription') ?? '') && /QR codes/i.test(plistString('NSCameraUsageDescription') ?? ''), true)
  check(
    'N32 iOS asks for nothing else it does not use',
    [/NSMicrophoneUsageDescription|NSLocation\w*UsageDescription|NSContactsUsageDescription|NSPhotoLibraryUsageDescription|NSCalendarsUsageDescription|NSBluetooth\w*UsageDescription/.test(plist), Boolean(plistString('NSPhotoLibraryAddUsageDescription'))],
    [false, true]
  )
  const permissions = [...manifestXml.matchAll(/<uses-permission android:name="([^"]+)"/g)].map((m) => m[1]).sort()
  check('N33 Android permissions are the network and the camera', permissions, ['android.permission.CAMERA', 'android.permission.INTERNET'])
  check('N33b a device without a camera can still install', manifestXml.includes('<uses-feature android:name="android.hardware.camera" android:required="false" />'), true)
  check('N34 no storage or media permission of any kind', /EXTERNAL_STORAGE|MANAGE_EXTERNAL|READ_MEDIA_|ACCESS_MEDIA_LOCATION/.test(manifestXml), false)
  const filePaths = read('android/app/src/main/res/xml/file_paths.xml')
  check('N35 the FileProvider exposes only the cache and the app\'s own Pictures folder', [/<external-path\b/.test(filePaths), /<cache-path name="abc_files" path="\." \/>/.test(filePaths), /<external-files-path name="captured_photos" path="Pictures\/" \/>/.test(filePaths), /<root-path\b|<files-path\b/.test(filePaths)], [false, true, true, false])
  check(
    'N36 the web camera is still the camera: no native camera plugin, getUserMedia and the immersive Multi-Card surface unchanged',
    [Object.keys(JSON.parse(read('package.json')).dependencies).includes('@capacitor/camera'), code('lib/scan/useCamera.ts').includes("facingMode: { ideal: 'environment' }"), code('components/scan/MultiCardClient.tsx').includes("'fixed inset-0 z-[200] h-[100dvh] w-full touch-none overflow-hidden overscroll-none'")],
    [false, true, true]
  )

  // ═══════════════════ SHARE ═══════════════════

  check(
    'N37 inside the app Web Share goes to the native sheet, and a dismissed sheet stays an AbortError',
    [shell.includes("Object.defineProperty(navigator, 'share'"), shell.includes('await Share.share({ title: data?.title, text: data?.text, url: data?.url'), shell.includes("new DOMException('Share canceled', 'AbortError')")],
    [true, true, true]
  )
  check(
    'N38 every share button keeps Web Share first and the clipboard behind it',
    ['components/my-card/MyCardView.tsx', 'components/card/DigitalCardView.tsx', 'components/dashboard/MyCardCard.tsx'].map((f) => code(f).includes("if (typeof navigator !== 'undefined' && navigator.share)") && code(f).includes('navigator.clipboard.writeText(')),
    [true, true, true]
  )

  // ═══════════════════ FILES / WALLET ═══════════════════

  const unsafe = downloadFilename('attachment; filename="../../etc/passwd"', 'x')
  check(
    'N39 downloaded files are named from the server, made safe, with a sensible fallback',
    [downloadFilename('attachment; filename="jane-doe.vcf"', 'x'), downloadFilename("attachment; filename*=UTF-8''J%C3%A1n.vcf", 'x'), /[\\/]/.test(unsafe) || unsafe.startsWith('.'), downloadFilename(null, 'contact.vcf'), ['/api/card/vcard/jane', '/api/card/wallet/apple', '/api/card/qr/jane?size=2048', '/api/export/csv', '/api/other'].map(fallbackDownloadName)],
    ['jane-doe.vcf', 'Ján.vcf', false, 'contact.vcf', ['contact.vcf', 'abc-card.pkpass', 'abc-card-qr.png', 'abc-contacts.csv', 'download']]
  )
  const downloads = code('lib/native/downloads.ts')
  check(
    'N40 files go to the app cache and the system share sheet, fetched with the session',
    [downloads.includes('directory: Directory.Cache'), downloads.includes("credentials: 'same-origin'"), downloads.includes('files: [written.uri]')],
    [true, true, true]
  )
  check('N41 the vCard button uses the shared handoff; the web still navigates to the file', [code('components/card/DigitalCardView.tsx').includes('openDownload(`/api/card/vcard/${encodeURIComponent(card.slug)}`)'), code('lib/native/open-download.ts').includes('window.location.href = path')], [true, true])
  check(
    'N42 the CSV (a blob link) and the QR image (a download link) are caught by the shell',
    [shell.includes("download !== null && /^(blob|data):/i.test(anchor.href)"), shell.includes('nativeSaveBlobUrl(anchor.href, download)'), nav('/api/card/qr/jane-doe?size=2048').kind, code('components/card/CardQrModal.tsx').includes('download={`${slug}-qr.png`}')],
    [true, true, 'download', true]
  )
  check(
    'N43 the Apple Wallet pass is a download handed to the system; the pass is still built and signed on the server',
    [nav('/api/card/wallet/apple').kind, code('app/api/card/wallet/apple/route.ts').includes("'Content-Disposition': `attachment; filename=\"${applePassFilename(result.payload)}\"`")],
    ['download', true]
  )
  check('N44 Google Wallet stays a server redirect the WebView hands to the system', [nav('/api/card/wallet/google').kind, code('app/api/card/wallet/google/route.ts').includes('NextResponse.redirect(saveUrl')], ['internal', true])

  // ═══════════════════ PAYMENTS ═══════════════════

  check(
    'N45 the web and PWA sell through Stripe; the store apps do not offer it',
    [commerce.webCheckoutAvailable(null), commerce.webCheckoutAvailable('ios'), commerce.webCheckoutAvailable('android'), commerce.commerceChannelFor('ios'), commerce.commerceChannelFor('android'), commerce.commerceChannelFor(null)],
    [true, false, false, 'app_store', 'google_play', 'stripe_web']
  )
  const { POST: billingCheckout } = await import('@/app/api/billing/checkout/route')
  const refusedCheckout = await billingCheckout(post(`${ORIGIN}/api/billing/checkout`, { productKey: 'pro_monthly' }, IOS_UA))
  check('N46 the checkout route refuses the app before anything else', [refusedCheckout.status, ((await refusedCheckout.json()) as { code?: string }).code], [403, commerce.NATIVE_PURCHASES_UNAVAILABLE_CODE])
  const { middleware } = await import('@/middleware')
  const pricing = await Promise.all(['/pricing', '/pricing/success?session_id=cs_x'].map((p) => middleware(new NextRequest(`${ORIGIN}${p}`, { headers: { 'user-agent': ANDROID_UA } }))))
  check('N47 the pricing pages send the app to Plan & Billing', pricing.map((res) => [res.status, res.headers.get('location')]), [[307, `${ORIGIN}/settings/billing`], [307, `${ORIGIN}/settings/billing`]])
  check(
    'N48 the legacy pricing checkout and the billing portal are called only from screens the app never shows',
    [
      sourceFiles.filter((f) => code(f).includes("'/api/stripe/checkout'")),
      sourceFiles.filter((f) => code(f).includes("'/api/stripe/portal'")),
      code('middleware.ts').includes("(requestedPath === '/pricing' || requestedPath.startsWith('/pricing/'))"),
    ],
    [['app/pricing/page.tsx'], ['components/settings/BillingSettingsView.tsx'], true]
  )
  const billingView = code('components/settings/BillingSettingsView.tsx')
  check(
    'N49 Plan & Billing shows no purchase in the app and points nowhere else to buy',
    [billingView.includes('{pro.active ? null : !webCheckout ? ('), billingView.includes('{!webCheckout ? ('), code('app/settings/billing/page.tsx').includes('webCheckout={webCheckoutAvailable(nativePlatformFromHeaders(headers()))}'), /abccard\.io|https?:\/\//.test(commerce.NATIVE_PURCHASES_UNAVAILABLE_MESSAGE)],
    [true, true, true, false]
  )
  check(
    'N50 the web checkout itself is unchanged',
    [billingView.includes("fetch('/api/billing/checkout'"), billingView.includes("fetch('/api/stripe/portal'"), code('app/pricing/page.tsx').includes("fetch('/api/stripe/checkout'"), code('app/api/billing/checkout/route.ts').includes('createCheckoutSession(')],
    [true, true, true, true]
  )
  const storeClaim = await store.verifyStorePurchase({ platform: 'app_store', storeProductId: 'anything', purchaseToken: 'anything' })
  check(
    'N51 the store billing seam sells nothing and grants nothing',
    [store.STORE_PRODUCT_MAPPINGS, store.storeBillingAvailable('app_store'), store.storeBillingAvailable('google_play'), storeClaim, /grant|insert\(|upsert\(|rpc\(|billing_entitlements'|scan_credit_ledger'/.test(code('lib/billing/native-store.ts'))],
    [{ app_store: [], google_play: [] }, false, false, { ok: false, reason: 'store_billing_not_available' }, false]
  )
  const productIdLike = /io\.abccard\.app\.(?!fileprovider)[a-z0-9_.]+|\b(scan_pack_\d+|pro_(event|monthly|annual))_(ios|android|apple|google|iap|play)\b/i
  check('N52 no store product id is invented anywhere', [...nativeTree, ...sourceFiles].filter((f) => !BINARY.test(f) && productIdLike.test(read(f))), [])
  const nativeSources = [...listFiles('ios/App/App'), ...listFiles('android/app/src/main/java')].filter((f) => /\.(swift|java|kt)$/.test(f))
  check('N53 native code holds no entitlement or billing logic', nativeSources.filter((f) => /entitlement|billing|scan_credit|\bpro\b/i.test(read(f))), [])

  // ═══════════════════ DEEP LINKS ═══════════════════

  check(
    'N54 both apps accept the sign-in return, and the shell listens for it',
    [/<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>io\.abccard\.app<\/string>/.test(plist), /<data android:scheme="@string\/custom_url_scheme" android:host="auth" android:path="\/callback" \/>/.test(manifestXml), shell.includes("App.addListener('appUrlOpen'"), shell.includes('App.getLaunchUrl()'), read('ios/App/App/SceneDelegate.swift').includes('openURLContexts')],
    [true, true, true, true, true]
  )
  const repoFiles = listFiles('.').filter((f) => !f.startsWith('node_modules/'))
  check(
    'N55 no apple-app-site-association and no Associated Domains entitlement with made-up values',
    [repoFiles.filter((f) => /apple-app-site-association/.test(f)), repoFiles.filter((f) => /\.entitlements$/.test(f)), nativeTree.filter((f) => /TEAMID|YOUR_TEAM|ABCDE12345/.test(read(f)))],
    [[], [], []]
  )
  check(
    'N56 no assetlinks.json, no certificate fingerprints and no unverifiable auto-verify filter',
    [repoFiles.filter((f) => /assetlinks\.json$/.test(f)), nativeTree.filter((f) => /sha256_cert_fingerprints/.test(read(f))), /android:autoVerify="true"/.test(manifestXml)],
    [[], [], false]
  )

  // ═══════════════════ SECRETS / HARDENING ═══════════════════

  const SECRETS: Array<[string, RegExp]> = [
    ['Supabase service role', /SUPABASE_SERVICE_ROLE_KEY|sb_secret_/],
    ['Stripe secret', /STRIPE_SECRET_KEY|\bsk_(live|test)_[A-Za-z0-9]/],
    ['Stripe webhook secret', /STRIPE_WEBHOOK_SECRET|\bwhsec_[A-Za-z0-9]/],
    ['private key material', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ['Apple Wallet signing', /APPLE_PASS_(PRIVATE_KEY|CERTIFICATE)|APPLE_WWDR_CERTIFICATE/],
    ['Google Wallet service account', /GOOGLE_WALLET_SERVICE_ACCOUNT|"private_key"\s*:/],
    ['OAuth and CRM client secrets', /CLIENT_SECRET|client_secret/],
    ['CRM token key', /CRM_TOKEN_ENCRYPTION_KEY/],
    ['server-only keys', /NATIVE_AUTH_SECRET|EXCHANGE_RATE_LIMIT_SALT|ANTHROPIC_API_KEY|RESEND_API_KEY|PERPLEXITY_API_KEY/],
  ]
  const shipped = [...listFiles('ios'), ...listFiles('android'), ...listFiles('native-shell/www'), 'capacitor.config.ts', 'lib/native/config.ts'].filter((f) => !BINARY.test(f))
  check(
    'N57 nothing secret in either native project, the local pages or the native configuration',
    SECRETS.flatMap(([label, pattern]) => shipped.filter((f) => pattern.test(read(f))).map((f) => `${label}: ${f}`)),
    []
  )
  const clientNative = ['lib/native/config.ts', 'lib/native/runtime.ts', 'lib/native/navigation.ts', 'lib/native/deep-link.ts', 'lib/native/files.ts', 'lib/native/downloads.ts', 'lib/native/shell.ts', 'lib/native/auth-client.ts', 'lib/native/open-download.ts', 'components/native/NativeShellBridge.tsx']
  check('N58 the native client modules read no environment at all', clientNative.filter((f) => /process\.env/.test(code(f))), [])
  const gitignore = read('.gitignore')
  check(
    'N59 no signing material is in the tree, and git ignores it',
    [repoFiles.filter((f) => /\.(jks|keystore|p12|p8|mobileprovision|provisionprofile)$/.test(f) || /(^|\/)(local\.properties|keystore\.properties)$/.test(f)), ['*.jks', '*.keystore', '*.p12', '*.p8', '*.mobileprovision', '/android/local.properties'].every((p) => gitignore.includes(p)), read('android/.gitignore').includes('local.properties'), read('ios/.gitignore').includes('xcuserdata')],
    [[], true, true, true]
  )
  check(
    'N60 Android keeps the session on the device and the network encrypted',
    [manifestXml.includes('android:allowBackup="false"'), manifestXml.includes('android:dataExtractionRules="@xml/data_extraction_rules"'), /usesCleartextTraffic="true"|cleartextTrafficPermitted="true"/.test(manifestXml + listFiles('android/app/src/main/res/xml').map(read).join('')), (read('android/app/src/main/res/xml/data_extraction_rules.xml').match(/<exclude domain="root" \/>/g) ?? []).length],
    [true, true, false, 2]
  )
  const nextConfig = read('next.config.js')
  check(
    'N61 the PWA private-cache protection is still in place',
    [nextConfig.includes('reloadOnOnline: false'), nextConfig.includes('dynamicStartUrl: false'), nextConfig.includes("importScripts: ['/sw-cache-cleanup.js']"), /cacheName: 'supabase-api'|cacheName: 'pages'/.test(nextConfig), exists('scripts/test-pwa-private-cache-hotfix.ts')],
    [true, true, true, false, true]
  )

  // ═══════════════════ PLATFORM ═══════════════════

  check(
    'N62 no portrait lock anywhere: iPhone allows landscape, Android and the web manifest set no orientation',
    [plist.includes('<string>UIInterfaceOrientationLandscapeLeft</string>') && plist.includes('<string>UIInterfaceOrientationLandscapeRight</string>'), /screenOrientation/.test(manifestXml), 'orientation' in JSON.parse(read('public/manifest.json'))],
    [true, false, false]
  )
  check(
    'N63 safe areas stay the page\'s job and nothing pads twice',
    [capacitorConfig.ios?.contentInset, (capacitorConfig.plugins?.SystemBars as { insetsHandling?: string } | undefined)?.insetsHandling, code('components/layout/AppHeader.tsx').includes('paddingTop: SAFE_TOP'), code('components/layout/MobileNav.tsx').includes("paddingBottom: 'env(safe-area-inset-bottom)'"), code('app/layout.tsx').includes("viewportFit: 'cover'")],
    ['never', 'native', true, true, true]
  )
  check(
    'N64 the app never reloads on resume, reconnect or anything else',
    [/addListener\(\s*'(resume|appStateChange|pause)'/.test(shell), /location\.reload\(/.test(shell + bridge + authClient + downloads), /addEventListener\(\s*['"](online|visibilitychange)['"]/.test(shell)],
    [false, false, false]
  )
  check(
    'N64b Android back walks history before leaving the app',
    shell.includes("App.addListener('backButton', ({ canGoBack }) => {") && shell.includes('if (canGoBack) window.history.back()') && shell.includes('else void App.minimizeApp()'),
    true
  )
  const scripts = JSON.parse(read('package.json')).scripts as Record<string, string>
  check(
    'N65 native tooling touches nothing in production',
    [Object.entries(scripts).filter(([name]) => name.startsWith('native:')).filter(([, cmd]) => /vercel|deploy|supabase|db push|migrat|stripe/i.test(cmd)), scripts['native:sync'], ['@capacitor/core', '@capacitor/cli', '@capacitor/ios', '@capacitor/android'].map((p) => ({ ...JSON.parse(read('package.json')).dependencies, ...JSON.parse(read('package.json')).devDependencies })[p])],
    [[], 'npm run native:prepare && cap sync', ['8.5.2', '8.5.2', '8.5.2', '8.5.2']]
  )

  // ═══════════════════ STORE READINESS ═══════════════════

  const readme = read('native-shell/README.md')
  const accountDeletionExists = sourceFiles.some((f) => /auth\.admin\.deleteUser\(/.test(code(f)))
  check(
    'N66 the handoff records what stands between this foundation and the stores',
    ['PROVISIONAL', 'NOT STORE ASSET READY', 'Account deletion — MISSING', 'Team ID', 'SHA-256', 'In-App Purchase', 'Play Billing', '3.1.3(b)', 'NATIVE_AUTH_SECRET', '/auth/native/return'].filter((phrase) => !readme.includes(phrase)),
    []
  )
  check('N67 account deletion: still absent in code, and still recorded as a blocker', [accountDeletionExists, readme.includes('Account deletion — MISSING')], [false, true])
  check(
    'N68 the icons are still Capacitor\'s placeholders, and the handoff says so',
    [exists('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'), exists('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png'), /Capacitor's default icon and splash/.test(readme)],
    [true, true, true]
  )

  // ═══════════════════ RESULT ═══════════════════

  const total = passed + failures.length
  console.log(`\nNative shell: ${passed}/${total} PASS${failures.length ? `, ${failures.length} FAILED` : ''}\n`)
  for (const failure of failures) console.log(`  FAIL ${failure}\n`)
  if (failures.length > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
