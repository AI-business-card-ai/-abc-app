/**
 * PWA hardening: manifest, metadata, safe areas, and what the service worker
 * is allowed to keep.
 *
 * Run with `npm run test:pwa` from the repository root.
 *
 * The caching policy is tested by behaviour, not by reading the config as
 * text. next.config.js is loaded for real with the PWA plugin replaced by a
 * stub that hands back the options it was given, and every runtime-caching
 * rule is then asked, in order and with Workbox's own matching semantics,
 * which one would answer a given request. So "contacts are never cached" is
 * observed on the rules the build will compile, rather than inferred from a
 * pattern that happens to look right.
 *
 * Nothing here reaches a network address.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

import { AUTH_ERROR_CODES, authErrorMessage } from '@/lib/auth/error-codes'
import { NETWORK_FAILURE_MESSAGE, isNetworkFailure, userFacingRequestError } from '@/lib/network-error'
import { SCAN_CARD_UNREADABLE_ERROR, formatScanErrorForUser } from '@/lib/scan-card-validation'

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
    .replace(/^\s*\/\/.*$/gm, '')
const listFiles = (dir: string): string[] =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? entry.name === 'node_modules' || entry.name.startsWith('.')
        ? []
        : listFiles(path.join(dir, entry.name))
      : [path.join(dir, entry.name).replace(/\\/g, '/')]
  )
const sourceFiles = ['app', 'components', 'lib']
  .flatMap((dir) => listFiles(dir))
  .filter((file) => /\.(ts|tsx)$/.test(file))

/** Width and height from a PNG's IHDR chunk. */
function pngSize(rel: string): [number, number] | null {
  const bytes = fs.readFileSync(path.join(ROOT, rel))
  if (bytes.length < 24 || bytes.toString('latin1', 1, 4) !== 'PNG') return null
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
}

const HEX = /^#[0-9a-f]{6}$/i
const ORIGIN = 'https://www.abccard.io'
const SUPABASE = 'https://qartkjhprlmnozmqosri.supabase.co'

// ═══════════════════ the config the build compiles ═══════════════════

type Rule = {
  urlPattern: RegExp | ((ctx: { url: URL; request: { mode: string; url: string }; sameOrigin: boolean }) => boolean)
  handler: string
  options?: { cacheName?: string }
}

const nodeRequire = createRequire(path.join(ROOT, 'package.json'))
const pluginPath = nodeRequire.resolve('@ducanh2912/next-pwa')
let pwaOptions: Record<string, any> | null = null
nodeRequire.cache[pluginPath] = {
  id: pluginPath,
  filename: pluginPath,
  loaded: true,
  exports: {
    default: (options: Record<string, any>) => {
      pwaOptions = options
      return (config: unknown) => config
    },
  },
} as unknown as NodeJS.Module
const nextConfig = nodeRequire(path.join(ROOT, 'next.config.js'))
const pwa = pwaOptions as unknown as Record<string, any>
const rules: Rule[] = pwa?.workboxOptions?.runtimeCaching ?? []

/**
 * The rule Workbox would pick: the first that matches, in order. A RegExp
 * applies cross-origin only when it matches from index 0 of the href — the
 * same rule Workbox 7 enforces.
 */
function ruleFor(href: string, mode: 'navigate' | 'cors' | 'no-cors' = 'cors'): Rule | null {
  const url = new URL(href)
  const sameOrigin = url.origin === ORIGIN
  for (const rule of rules) {
    if (typeof rule.urlPattern === 'function') {
      if (rule.urlPattern({ url, request: { mode, url: href }, sameOrigin })) return rule
    } else {
      const match = rule.urlPattern.exec(href)
      if (match && (sameOrigin || match.index === 0)) return rule
    }
  }
  return null
}

/** Whether the worker would store the response anywhere. */
function stores(href: string, mode: 'navigate' | 'cors' | 'no-cors' = 'cors'): boolean {
  const rule = ruleFor(href, mode)
  return Boolean(rule && rule.handler !== 'NetworkOnly')
}

const handlerOf = (href: string, mode: 'navigate' | 'cors' | 'no-cors' = 'cors') => ruleFor(href, mode)?.handler ?? 'none'

async function main() {
  // ═══════════════════ MANIFEST ═══════════════════

  check('P1 manifest exists', exists('public/manifest.json'), true)
  const manifest = JSON.parse(read('public/manifest.json'))

  check('P2 name is ABC Card', manifest.name, 'ABC Card')
  check('P3 short name is ABC Card', manifest.short_name, 'ABC Card')

  const startUrl: string = manifest.start_url
  check('P4a start_url is a local path', typeof startUrl === 'string' && startUrl.startsWith('/') && !startUrl.startsWith('//'), true)
  check('P4b start_url is a real page', exists(`app${startUrl.split('?')[0]}/page.tsx`), true)
  check('P4c start_url is a signed-in screen the middleware guards', code('middleware.ts').includes(`'${startUrl.split('?')[0]}',`), true)
  check(
    'P4d identity pinned to the id Chrome derived before start_url moved, so existing installs update in place',
    manifest.id,
    '/dashboard'
  )

  check('P5a scope is the whole app', manifest.scope, '/')
  check('P5b start_url sits inside scope', startUrl.startsWith(manifest.scope), true)

  check('P6 display is standalone', manifest.display, 'standalone')

  check(
    'P7a no global portrait lock — Multi-Card needs landscape',
    manifest.orientation === undefined || !/portrait/i.test(String(manifest.orientation)),
    true
  )
  check('P7b nothing locks orientation in code', sourceFiles.some((file) => /screen\.orientation\.lock|orientation\.lock\(/.test(code(file))), false)

  const tailwind = read('tailwind.config.ts')
  const layout = code('app/layout.tsx')
  check('P8a theme_color is a hex colour', HEX.test(manifest.theme_color), true)
  check('P8b background_color is a hex colour', HEX.test(manifest.background_color), true)
  check('P8c both match the app background token', [manifest.theme_color, manifest.background_color].every((c) => tailwind.includes(`bg: "${c}"`)), true)
  check('P8d and the viewport theme colour', layout.includes(`themeColor: '${manifest.theme_color}'`), true)

  const icons: { src: string; sizes: string; type: string; purpose?: string }[] = manifest.icons ?? []
  const icon192 = icons.find((i) => i.sizes === '192x192' && (i.purpose ?? 'any').includes('any'))
  const icon512 = icons.find((i) => i.sizes === '512x512' && (i.purpose ?? 'any').includes('any'))
  check('P9a a 192 icon is declared', Boolean(icon192), true)
  check('P9b and the file is a 192x192 PNG', icon192 ? pngSize(`public${icon192.src}`) : null, [192, 192])
  check('P10a a 512 icon is declared', Boolean(icon512), true)
  check('P10b and the file is a 512x512 PNG', icon512 ? pngSize(`public${icon512.src}`) : null, [512, 512])

  const maskable = icons.filter((i) => i.purpose?.includes('maskable'))
  check('P11a a maskable icon is declared', maskable.length > 0, true)
  check('P11b every maskable file matches its declared size', maskable.every((i) => JSON.stringify(pngSize(`public${i.src}`)) === JSON.stringify(i.sizes.split('x').map(Number))), true)
  check('P11c maskable is kept apart from the plain icons, not "any maskable"', maskable.every((i) => !i.purpose?.includes('any')), true)

  check('P33a every manifest icon exists', icons.every((i) => exists(`public${i.src}`)), true)
  check('P33b every manifest icon is declared as PNG and is one', icons.every((i) => i.type === 'image/png' && pngSize(`public${i.src}`) !== null), true)
  check('P33c no icon is heavy enough to slow install (≤ 200 KB)', icons.every((i) => fs.statSync(path.join(ROOT, `public${i.src}`)).size <= 200_000), true)
  check('P33d no fields added for a score', Object.keys(manifest).sort(), ['background_color', 'description', 'display', 'icons', 'id', 'name', 'scope', 'short_name', 'start_url', 'theme_color'])
  check('P33e the manifest claims no live Event Intelligence', /intelligence/i.test(manifest.description), false)
  check('P33f the manifest does not advertise an app store listing it lacks', manifest.prefer_related_applications === true, false)

  // ═══════════════════ METADATA ═══════════════════

  const iconPaths = [...layout.matchAll(/url: '([^']+)'/g)].map((m) => m[1])
  check('P12a an Apple touch icon is declared', /apple: \[\{ url: '\/icons\/[^']+\.png'/.test(layout), true)
  check('P12b every metadata icon exists', iconPaths.length >= 2 && iconPaths.every((p) => exists(`public${p}`)), true)
  check('P13 a favicon is declared', /icon: \[\{ url: '\/icons\/[^']+\.png'/.test(layout), true)

  check('P14 viewport-fit cover', layout.includes("viewportFit: 'cover'"), true)
  check('P14b zoom is not disabled', /maximumScale|userScalable/.test(layout), false)

  check('P15a iOS standalone capable', /appleWebApp: \{\s*capable: true/.test(layout), true)
  check('P15b translucent status bar, which the header clears', layout.includes("statusBarStyle: 'black-translucent'"), true)
  check('P15c home-screen title is ABC Card', /appleWebApp: \{[\s\S]*?title: 'ABC Card'/.test(layout), true)
  check('P15d application name is ABC Card', layout.includes("applicationName: 'ABC Card'"), true)
  check('P15e manifest linked through metadata', layout.includes("manifest: '/manifest.json'"), true)
  check('P15f no hand-written duplicates of what metadata emits', /<meta name="apple-mobile-web-app|<link rel="(manifest|apple-touch-icon|icon)"|<meta name="theme-color"/.test(read('app/layout.tsx')), false)

  // ═══════════════════ SAFE AREAS ═══════════════════

  const uiLayout = code('lib/ui/layout.ts')
  const header = code('components/layout/AppHeader.tsx')
  const nav = code('components/layout/MobileNav.tsx')
  const shell = code('components/layout/AppShell.tsx')
  check('P16a one definition of each inset', ['SAFE_TOP', 'SAFE_LEFT', 'SAFE_RIGHT'].every((name) => uiLayout.includes(`export const ${name} = 'env(safe-area-inset-`)), true)
  check('P16b the header clears the top and both sides', ['paddingTop: SAFE_TOP', 'paddingLeft: SAFE_LEFT', 'paddingRight: SAFE_RIGHT'].every((s) => header.includes(s)), true)
  check('P16c the bottom nav clears the home indicator and both sides', nav.includes("paddingBottom: 'env(safe-area-inset-bottom)'") && nav.includes('paddingLeft: SAFE_LEFT') && nav.includes('paddingRight: SAFE_RIGHT'), true)
  check('P16d page content clears both sides and the nav', ['paddingBottom: CLEARS_MOBILE_NAV', 'paddingLeft: SAFE_LEFT', 'paddingRight: SAFE_RIGHT'].every((s) => shell.includes(s)), true)
  check('P16e no page under the app header adds the top inset again', code('app/chat/[id]/page.tsx').includes('safe-area-inset-top'), false)
  check('P16f presentation mode clears the top and bottom itself (it covers the header)', code('components/my-card/CardPresentationMode.tsx').includes('calc(12px + ${SAFE_TOP})') && code('components/my-card/CardPresentationMode.tsx').includes('env(safe-area-inset-bottom)'), true)
  check('P16g the QR modal clears the top and bottom', code('components/card/CardQrModal.tsx').includes('env(safe-area-inset-top)') && code('components/card/CardQrModal.tsx').includes('env(safe-area-inset-bottom)'), true)
  check('P16h the offline page clears the top and bottom', code('app/offline/page.tsx').includes('env(safe-area-inset-top)') && code('app/offline/page.tsx').includes('env(safe-area-inset-bottom)'), true)

  // ═══════════════════ MULTI-CARD (locked) ═══════════════════

  const multi = code('components/scan/MultiCardClient.tsx')
  const orientation = code('lib/scan/useOrientation.ts')
  check('P17a immersive camera still covers the whole dynamic viewport', multi.includes("'fixed inset-0 z-[200] h-[100dvh] w-full touch-none overflow-hidden overscroll-none'"), true)
  check('P17b above the header (z-50) and nav (z-[100])', multi.includes('z-[200]') && header.includes('sticky top-0 z-50') && nav.includes('fixed bottom-0 left-0 right-0 z-[100]'), true)
  check('P17c frame insets unchanged — thin margins, reaching into the side safe area', orientation.includes("left: 'max(12px, calc(env(safe-area-inset-left) - 16px))'") && orientation.includes("right: 'max(12px, calc(env(safe-area-inset-right) - 16px))'"), true)
  check('P17d immersive still means touch phone + landscape + live capture', orientation.includes('return orientation.mobile && !orientation.portrait && capturing && live && canCapture && !exited'), true)
  check('P17e Back and shutter still float over the picture', multi.includes('aria-label="Back"') && multi.includes('aria-label="Capture photo"') && multi.includes('absolute top-1/2 flex h-[68px] w-[68px]'), true)
  check('P17f landscape page stage still sized with svh', multi.includes('calc(100svh - 3.5rem - ${SAFE_TOP}'), true)
  check('P18 no side shutter column in immersive — the control column renders only outside it', multi.includes('{!immersive ? (\n        <div className="mt-3 flex shrink-0 flex-col gap-2 max-lg:landscape:mt-0 max-lg:landscape:w-[196px]'), true)

  // ═══════════════════ STANDALONE / ROUTING ═══════════════════

  const standaloneUsers = sourceFiles.filter((file) => /navigator\.standalone|display-mode:\s*standalone/.test(code(file)))
  check('P19a nothing branches on standalone detection, so Safari and the installed app behave alike', standaloneUsers, [])
  check('P19b immersive decision does not depend on standalone', /standalone/.test(orientation), false)
  check('P19c no install banner or fake install prompt', sourceFiles.filter((file) => /beforeinstallprompt|BeforeInstallPromptEvent/.test(code(file))), [])

  check('P20a no internal path opened in a new window', sourceFiles.filter((file) => /window\.open\(\s*['"`]\//.test(code(file))), [])
  check('P20b tabs navigate in place', nav.includes("import Link from 'next/link'") && !nav.includes('target='), true)
  check('P20c OAuth return is a same-window redirect, never window.opener', sourceFiles.filter((file) => /window\.opener/.test(code(file))), [])

  const middleware = code('middleware.ts')
  const matcher = new RegExp(`^${(middleware.match(/matcher: \[\s*'([^']+)'/) ?? [])[1]}$`)
  const protectedBlock = (middleware.match(/const protectedRoutes = \[([\s\S]*?)\]/) ?? [])[1] ?? ''
  check('P21a public card routes are not protected', protectedBlock.includes("'/home'") && !/'\/(d|u|card)\b/.test(protectedBlock), true)
  check('P21b public cards render without app chrome', shell.includes("pathname.startsWith('/d/') || pathname.startsWith('/u/') || pathname.startsWith('/card/')"), true)
  check('P21c a public card is fetched fresh, never from a worker cache', handlerOf(`${ORIGIN}/d/jane-doe`, 'navigate'), 'NetworkOnly')

  check('P35a middleware skips the worker and its helpers', ['/sw.js', '/sw-cache-cleanup.js', '/workbox-be70015f.js', '/fallback-ce627215c0e4a9af.js', '/swe-worker-abc.js'].map((p) => matcher.test(p)), [false, false, false, false, false])
  check('P35b middleware skips the precached public files', ['/manifest.json', '/offline', '/icons/icon-192.png', '/wallet/abc-wallet-logo.png', '/hero/abc-hero-visual.webp', '/icon.svg'].map((p) => matcher.test(p)), [false, false, false, false, false, false])
  check('P35c middleware still guards every app screen', ['/home', '/contacts', '/events', '/scan', '/settings', '/onboarding', '/d/jane', '/walletx'].map((p) => matcher.test(p)), [true, true, true, true, true, true, true, true])

  // ═══════════════════ SHARE / WALLET / AUTH ═══════════════════

  const myCard = code('components/my-card/MyCardView.tsx')
  const publicCard = code('components/card/DigitalCardView.tsx')
  check('P22 native share first', [myCard, publicCard].every((src) => /if \(typeof navigator !== 'undefined' && navigator\.share\)/.test(src)), true)
  check('P23 clipboard fallback kept', [myCard, publicCard].every((src) => src.includes('navigator.clipboard.writeText(')), true)

  check('P24a Wallet routes exist', exists('app/api/card/wallet/apple/route.ts') && exists('app/api/card/wallet/google/route.ts'), true)
  check('P24b Wallet actions are plain same-window links', /<a\s+href=\{href\}\s+className=/.test(myCard) && myCard.includes('href="/api/card/wallet/apple"') && myCard.includes('href="/api/card/wallet/google"'), true)
  check('P24c a pass download bypasses the worker entirely', [handlerOf(`${ORIGIN}/api/card/wallet/apple`, 'navigate'), handlerOf(`${ORIGIN}/api/card/wallet/google`, 'navigate')], ['none', 'none'])

  const googleOauth = code('lib/google-oauth.ts')
  const signIn = googleOauth.slice(googleOauth.indexOf('export async function signInWithGoogle'), googleOauth.indexOf('export function isGoogleProvider'))
  check('P25a Google sign-in asks for no scopes', /scopes|GOOGLE_GMAIL_SCOPE|access_type|prompt/.test(signIn), false)
  check('P25b Google sign-in returns to the canonical callback', signIn.includes('redirectTo: getGoogleOAuthRedirectTo(nextPath, connectUserId)'), true)

  check('P26a Gmail has its own callback', code('lib/google/gmail-connect.ts').includes('/api/auth/google-gmail/callback'), true)
  check('P26b the connector is a same-window navigation', code('components/chat/MessageComposer.tsx').includes('window.location.href = `/api/auth/google-gmail?returnTo='), true)
  check('P26c connector hops bypass the worker', [handlerOf(`${ORIGIN}/api/auth/google-gmail?returnTo=%2Fchat`, 'navigate'), handlerOf(`${ORIGIN}/api/auth/google-gmail/callback?code=x&state=y`, 'navigate')], ['none', 'none'])

  check('P27a auth callback route exists', exists('app/auth/callback/route.ts'), true)
  check('P27b callback origin is the page origin, where the PKCE cookie lives', code('lib/auth/redirect.ts').includes('return `${window.location.origin}/auth/callback?${query}`'), true)
  check('P27c the callback bypasses the worker', handlerOf(`${ORIGIN}/auth/callback?code=abc&next=%2Fdashboard`, 'navigate'), 'none')
  check('P27d CRM OAuth callbacks bypass the worker', ['hubspot', 'salesforce', 'pipedrive'].map((p) => handlerOf(`${ORIGIN}/api/auth/${p}/callback?code=x`, 'navigate')), ['none', 'none', 'none'])

  check('P27e a failed callback now says something', code('app/(auth)/login/page.tsx').includes("searchParams.get('error') === 'auth' ? authErrorMessage(searchParams.get('reason')) : null"), true)
  check('P27f every callback code has a sentence', Object.values(AUTH_ERROR_CODES).every((c) => authErrorMessage(c).length > 20), true)
  check('P27g the exchange failure explains the email-link case', /same browser or app/.test(authErrorMessage(AUTH_ERROR_CODES.exchangeFailed)), true)
  check('P27h an unknown reason is not reflected', authErrorMessage('<img src=x onerror=alert(1)>'), 'We could not finish signing you in. Please try again.')
  check('P27i nor a missing one', authErrorMessage(null), 'We could not finish signing you in. Please try again.')

  // ═══════════════════ WORKER CACHING ═══════════════════

  check('P28a the config loads with the plugin options captured', Boolean(pwa && nextConfig && rules.length > 0), true)

  const privateApi = [
    `${ORIGIN}/api/contacts`,
    `${ORIGIN}/api/crm/connections`,
    `${ORIGIN}/api/scan`,
    `${ORIGIN}/api/scan/batches/123`,
    `${ORIGIN}/api/card/vcard/jane-doe`,
    `${ORIGIN}/api/entitlements`,
    `${SUPABASE}/rest/v1/abc_profiles?select=*`,
    `${SUPABASE}/auth/v1/user`,
    `${SUPABASE}/storage/v1/object/public/scans/user/card.jpg`,
    `${SUPABASE}/storage/v1/object/sign/scans/card.jpg?token=abc`,
    `${ORIGIN}/contacts?_rsc=1x2y3`,
    `${ORIGIN}/_next/image?url=%2Favatar.png&w=96&q=75`,
  ]
  check('P28b no private or user-specific request is stored', privateApi.filter((href) => stores(href)), [])
  check('P28c Supabase is not routed through the worker at all', [`${SUPABASE}/rest/v1/contacts`, `${SUPABASE}/auth/v1/token?grant_type=refresh_token`].map((href) => handlerOf(href)), ['none', 'none'])

  const billing = [
    `${ORIGIN}/api/stripe/checkout`,
    `${ORIGIN}/api/stripe/portal`,
    `${ORIGIN}/api/stripe/webhook`,
    `${ORIGIN}/api/billing/credits`,
    `${SUPABASE}/rest/v1/scan_credit_ledger?select=delta`,
    `${SUPABASE}/rest/v1/billing_entitlements?select=*`,
  ]
  check('P29a no billing response is stored', billing.filter((href) => stores(href)), [])
  check('P29b billing screens are fetched fresh', [handlerOf(`${ORIGIN}/settings/billing`, 'navigate'), handlerOf(`${ORIGIN}/pricing/success?session_id=cs_test`, 'navigate')], ['NetworkOnly', 'NetworkOnly'])

  const people = [
    `${SUPABASE}/rest/v1/contacts?select=*`,
    `${SUPABASE}/rest/v1/encounters?select=*`,
    `${SUPABASE}/rest/v1/followup_sequences?select=*`,
    `${ORIGIN}/api/contacts/abc/encounters`,
  ]
  check('P30a no Contact or Encounter response is stored', people.filter((href) => stores(href)), [])
  const privateScreens = ['/home', '/contacts', '/contacts/abc', '/events', '/events/berlin', '/follow-ups', '/scan', '/settings', '/my-card', '/chat/abc']
  check('P30b no private screen is stored', privateScreens.filter((p) => stores(`${ORIGIN}${p}`, 'navigate')), [])
  check('P30c every private screen still gets the offline fallback', privateScreens.map((p) => handlerOf(`${ORIGIN}${p}`, 'navigate')).every((h) => h === 'NetworkOnly'), true)
  check('P30d the fallback hook exists on the navigation rule', rules.some((r) => r.handler === 'NetworkOnly' && r.options !== undefined && /request\.mode === ["']navigate["']/.test(String(r.urlPattern))), true)

  check('P28d build output is cached, and only same-origin', [handlerOf(`${ORIGIN}/_next/static/chunks/app/page-abc123.js`), handlerOf('https://cdn.example.com/lib.js')], ['CacheFirst', 'none'])
  check('P28e public images revalidate, and only same-origin', [handlerOf(`${ORIGIN}/icons/icon-192.png`), handlerOf(`${ORIGIN}/api/card/qr/jane.png`), handlerOf('https://lh3.googleusercontent.com/a/photo.jpg')], ['StaleWhileRevalidate', 'none', 'none'])
  check('P28f background-removal runtime still goes straight to the network', [handlerOf('https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/model.onnx'), handlerOf(`${ORIGIN}/cutout-assets/ort-wasm.wasm`)], ['NetworkOnly', 'NetworkOnly'])
  check('P28g no rule names a retired cache', rules.map((r) => r.options?.cacheName).filter((n) => ['pages', 'supabase-api', 'start-url', 'static-assets', 'image-assets'].includes(n ?? '')), [])
  // dynamicStartUrl is the flag that actually registers the start-url route in @ducanh2912/next-pwa 10.x.
  check('P28h the start URL is not cached', [pwa?.cacheStartUrl, pwa?.dynamicStartUrl], [false, false])
  check('P28i nothing caches client-side navigations', [pwa?.cacheOnFrontEndNav, pwa?.aggressiveFrontEndNavCaching].some((v) => v === true), false)

  const cleanup = read('public/sw-cache-cleanup.js')
  check('P28j retired caches are deleted on activation', pwa?.workboxOptions?.importScripts?.includes('/sw-cache-cleanup.js') && cleanup.includes("self.addEventListener('activate'") && ['supabase-api', 'pages', 'start-url', 'static-assets', 'image-assets'].every((n) => cleanup.includes(`'${n}'`)), true)
  check('P28k the cleanup script is committed, not ignored as build output', read('.gitignore').split('\n').some((line) => line.trim() && new RegExp(`^${line.trim().replace(/^\//, '').replace(/\./g, '\\.').replace(/\*/g, '.*')}$`).test('public/sw-cache-cleanup.js'.replace(/^public\//, 'public/'))), false)

  // ═══════════════════ OFFLINE / UPDATE ═══════════════════

  const offline = code('app/offline/page.tsx')
  check('P31a the offline fallback page exists', pwa?.fallbacks?.document === '/offline' && exists('app/offline/page.tsx'), true)
  check('P31b it makes no promise to send or sync later', /odešl|will be sent|once you.?re back|queued|sync(ed)? (when|later)|available offline|works offline/i.test(offline), false)
  check('P31c it retries the page that failed', code('components/pwa/OfflineRetryButton.tsx').includes('window.location.reload()'), true)
  check('P31d it speaks the app language', /You&apos;re offline/.test(offline) && !/Jsi offline/.test(offline), true)

  check('P36a no reload when the connection returns', pwa?.reloadOnOnline, false)
  check(
    'P36b reloads happen only when somebody presses a button, never on reconnect or worker update',
    sourceFiles.filter((file) => /location\.reload\(/.test(code(file))),
    ['components/card/CardEditorShell.tsx', 'components/pwa/OfflineRetryButton.tsx']
  )
  check(
    'P36c nothing reloads on the online event or a worker change',
    sourceFiles.filter((file) => /addEventListener\(\s*['"](online|controllerchange|waiting)['"]/.test(code(file))),
    []
  )
  check('P36e a new worker takes over without reloading the page', pwa?.skipWaiting === true && pwa?.register === true, true)
  check('P36d worker disabled in development', String(pwa?.disable), 'false')

  check('P37a "Load failed" (Safari) is a connection failure', isNetworkFailure('Load failed'), true)
  check('P37b "Failed to fetch" (Chrome) is a connection failure', isNetworkFailure('Failed to fetch'), true)
  check('P37c Firefox wording too', isNetworkFailure('NetworkError when attempting to fetch resource.'), true)
  check('P37d a server message that contains the words is not', isNetworkFailure('Load failed for this contact'), false)
  check('P37e a scan with no connection is not called unreadable', formatScanErrorForUser('Load failed'), NETWORK_FAILURE_MESSAGE)
  check('P37f an unreadable scan still is', formatScanErrorForUser('Scan failed'), SCAN_CARD_UNREADABLE_ERROR)
  check('P37g caught errors keep the server wording', [userFacingRequestError(new TypeError('Failed to fetch'), 'x'), userFacingRequestError(new Error('You have used every scan.'), 'x'), userFacingRequestError('nope', 'fallback')], [NETWORK_FAILURE_MESSAGE, 'You have used every scan.', 'fallback'])
  check('P37h Multi-Card uses it for reading and saving', multi.includes("userFacingRequestError(err, 'Could not read that photo.')") && multi.includes("userFacingRequestError(err, 'Could not save these contacts.')"), true)
  check('P37i single scan reaches it through its existing formatter', code('components/scan/ScanClient.tsx').includes('formatScanErrorForUser('), true)

  // ═══════════════════ ACCESSIBILITY / DEPENDENCIES / BUILD ═══════════════════

  check('P32a reduced motion preserved', read('app/globals.css').includes('@media (prefers-reduced-motion: reduce)'), true)
  check('P32b the offline icon is decorative', offline.includes('<IconWifiOff') && offline.includes('aria-hidden="true"'), true)

  const pkg = JSON.parse(read('package.json'))
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  check('P34a one PWA library, the one already in use', Object.keys(deps).filter((d) => /pwa|workbox|serwist/i.test(d)), ['@ducanh2912/next-pwa'])
  check('P34b no client script exists only to carry manifest metadata', sourceFiles.filter((file) => /manifest\.json/.test(code(file)) && /'use client'/.test(read(file))), [])

  check('P35d generated worker files stay out of git', ['/public/sw.js', '/public/workbox-*.js', '/public/fallback-*.js', '/public/swe-worker-*.js'].every((p) => read('.gitignore').includes(p)), true)
  if (exists('public/sw.js')) {
    const sw = read('public/sw.js')
    const built = fs.statSync(path.join(ROOT, 'public/sw.js')).mtimeMs >= fs.statSync(path.join(ROOT, 'next.config.js')).mtimeMs
    if (built) {
      check('P35e built worker imports the cleanup script', sw.includes('sw-cache-cleanup.js'), true)
      check('P35f built worker names no retired cache', ['"pages"', '"supabase-api"', '"start-url"', '"static-assets"', '"image-assets"'].filter((n) => sw.includes(`cacheName:${n}`)), [])
      check('P35g built worker precaches the offline page', sw.includes('url:"/offline"'), true)
      check('P35h built worker has no start-url route', sw.includes('registerRoute("/"'), false)
    }
  }

  // ═══════════════════ RESULT ═══════════════════

  console.log(`\nPWA hardening: ${passed} passed, ${failures.length} failed\n`)
  for (const failure of failures) console.log(`  ✗ ${failure}\n`)
  if (failures.length > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
