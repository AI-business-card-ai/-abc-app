/**
 * Production hotfix: the PWA service worker keeps no private data.
 *
 * Run with `npm run test:pwa-private-cache` from the repository root. After a
 * production build, run it again with `-- --require-build` so the checks on the
 * generated worker cannot be skipped. `--worker=<sw.js>` and `--chunks=<dir>`
 * point those checks at another build, such as a copy of what production
 * currently serves.
 *
 * The worker built from 247b679 stored every Supabase response and every page a
 * signed-in person opened in Cache Storage for a day, and served them back
 * whenever the network failed or took longer than three seconds — after
 * sign-out, and to whoever was signed in by then. The policy that replaces it
 * is checked three ways:
 *
 * - next.config.js is loaded for real with the PWA plugin stubbed, and every
 *   runtime-caching rule is asked, in order and with Workbox's own matching
 *   semantics, which one would answer a given request.
 * - The worker the build generated is executed in a sandbox with Workbox
 *   stubbed, and the routes it actually registers are asked the same questions.
 *   Minified text is never pattern-matched for the policy itself.
 * - The cache cleanup script runs in a sandbox that exposes nothing but Cache
 *   Storage, and what it deletes is recorded.
 *
 * Self-contained on purpose: it imports no application code, so it runs on
 * main as it is. Nothing here reaches a network address.
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const ROOT = process.cwd()
const ARGS = process.argv.slice(2)
const option = (name: string) => ARGS.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const REQUIRE_BUILD = ARGS.includes('--require-build')

let passed = 0
const failures: string[] = []
const skipped: string[] = []

function check(label: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    passed++
    return
  }
  failures.push(`${label}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`)
}

const read = (file: string) => fs.readFileSync(path.resolve(ROOT, file), 'utf8').replace(/\r\n/g, '\n')
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const code = (file: string) => stripComments(read(file))
const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).replace(/\r\n/g, '\n').trim()
const listFiles = (dir: string, pattern: RegExp): string[] =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? entry.name === 'node_modules' || entry.name.startsWith('.')
            ? []
            : listFiles(path.join(dir, entry.name), pattern)
          : pattern.test(entry.name)
            ? [path.join(dir, entry.name)]
            : []
      )
    : []

/** The commit this hotfix was cut from: production main when the leak was found. */
const HOTFIX_BASE = '247b6791d00009f1497e024c07cfef00726b8cc1'
const ORIGIN = 'https://www.abccard.io'
const SUPABASE = 'https://qartkjhprlmnozmqosri.supabase.co'

/** Every cache the production worker built from HOTFIX_BASE wrote to, read from its generated sw.js. */
const RETIRED_CACHES = ['image-assets', 'pages', 'start-url', 'static-assets', 'supabase-api']
const APPROVED_CACHES = ['next-static', 'public-images']

// ═══════════════════ routes, and how Workbox picks one ═══════════════════

type Mode = 'navigate' | 'cors' | 'no-cors'
type MatchContext = { url: URL; request: { mode: Mode; url: string }; sameOrigin: boolean }
type Route = {
  matcher: unknown
  handler: string
  cacheName?: string
  /** Whether a failed request falls back to the offline page. */
  fallback: boolean
}

/**
 * Workbox 7's own rules: a string is a full URL resolved against the worker's
 * origin; a RegExp applies cross-origin only when it matches from index 0 of
 * the href; a callback is evaluated as written.
 */
function matches(matcher: unknown, href: string, mode: Mode): boolean {
  const url = new URL(href)
  const sameOrigin = url.origin === ORIGIN
  if (typeof matcher === 'string') return new URL(matcher, ORIGIN).href === url.href
  if (Object.prototype.toString.call(matcher) === '[object RegExp]') {
    const found = (matcher as RegExp).exec(href)
    return Boolean(found && (sameOrigin || found.index === 0))
  }
  if (typeof matcher === 'function') {
    return Boolean((matcher as (ctx: MatchContext) => unknown)({ url, request: { mode, url: href }, sameOrigin }))
  }
  return false
}

const answer = (routes: Route[], href: string, mode: Mode = 'cors') =>
  routes.find((route) => matches(route.matcher, href, mode)) ?? null
const handlerFor = (routes: Route[], href: string, mode: Mode = 'cors') => answer(routes, href, mode)?.handler ?? 'none'
const stores = (routes: Route[], href: string, mode: Mode = 'cors') => {
  const route = answer(routes, href, mode)
  return Boolean(route && route.handler !== 'NetworkOnly')
}

const SUPABASE_REQUESTS = [
  `${SUPABASE}/rest/v1/scanned_contacts?select=*`,
  `${SUPABASE}/rest/v1/encounters?select=*&contact_id=eq.7f1c`,
  `${SUPABASE}/rest/v1/abc_profiles?select=*`,
  `${SUPABASE}/rest/v1/followup_sequences?select=*`,
  `${SUPABASE}/rest/v1/subscriptions?select=*`,
  `${SUPABASE}/auth/v1/user`,
  `${SUPABASE}/auth/v1/token?grant_type=refresh_token`,
  `${SUPABASE}/storage/v1/object/public/scans/user/card.jpg`,
  `${SUPABASE}/storage/v1/object/sign/scans/card.png?token=abc`,
]
const PRIVATE_SCREENS = [
  '/home',
  '/dashboard',
  '/contacts',
  '/contacts/7f1c',
  '/scan',
  '/follow-ups',
  '/my-card',
  '/settings',
  '/settings/billing',
  '/chat/7f1c',
  '/pipeline',
  '/onboarding',
  '/pricing/success?session_id=cs_test',
]
const API_NAVIGATIONS = [
  '/api/card/vcard/jane-doe',
  '/api/auth/hubspot/callback?code=x&state=y',
  '/api/stripe/checkout',
  '/api/export/csv',
]
const AUTH_NAVIGATIONS = ['/auth/callback?code=abc&next=%2Fdashboard', '/auth/callback?code=abc&flow=recovery']

/** The caching policy, asked of any set of routes: the config's, or the built worker's. */
function policy(tag: string, routes: Route[]) {
  const names = [...new Set(routes.map((route) => route.cacheName).filter(Boolean))].sort()
  const navigate = (paths: string[]) => paths.map((p) => handlerFor(routes, `${ORIGIN}${p}`, 'navigate'))

  check(`${tag}01 no rule uses the supabase-api cache`, names.includes('supabase-api'), false)
  check(
    `${tag}02 no rule answers any Supabase request`,
    SUPABASE_REQUESTS.flatMap((href) => (['cors', 'no-cors'] as Mode[]).map((mode) => handlerFor(routes, href, mode))).filter((h) => h !== 'none'),
    []
  )
  check(`${tag}03 signed-in pages come from the network only`, navigate(PRIVATE_SCREENS).filter((h) => h !== 'NetworkOnly'), [])
  check(`${tag}03b and nothing about them is stored`, PRIVATE_SCREENS.filter((p) => stores(routes, `${ORIGIN}${p}`, 'navigate')), [])
  check(`${tag}03c a failed page load still reaches the offline page`, PRIVATE_SCREENS.every((p) => answer(routes, `${ORIGIN}${p}`, 'navigate')?.fallback === true), true)
  check(`${tag}04 /api/ navigations bypass the worker`, navigate(API_NAVIGATIONS), API_NAVIGATIONS.map(() => 'none'))
  check(`${tag}05 /auth/ navigations bypass the worker`, navigate(AUTH_NAVIGATIONS), AUTH_NAVIGATIONS.map(() => 'none'))
  check(`${tag}06 no pages cache and no network-first rule remain`, [names.includes('pages'), routes.some((r) => r.handler === 'NetworkFirst')], [false, false])
  check(`${tag}06b client navigation payloads and API reads are not stored`, [stores(routes, `${ORIGIN}/contacts?_rsc=1x2y3`), stores(routes, `${ORIGIN}/api/contacts`)], [false, false])
  check(`${tag}06c the start URL is not stored`, handlerFor(routes, `${ORIGIN}/`, 'navigate'), 'NetworkOnly')
  check(`${tag}07 build output is cache-first on the same origin`, handlerFor(routes, `${ORIGIN}/_next/static/chunks/app/page-3f9a.js`), 'CacheFirst')
  check(
    `${tag}07b and on no other origin`,
    ['https://cdn.example.com/_next/static/chunks/app.js', 'https://cdn.example.com/lib.js', 'https://cdn.example.com/site.css'].map((href) => handlerFor(routes, href)),
    ['none', 'none', 'none']
  )
  check(`${tag}08 public images revalidate on the same origin`, handlerFor(routes, `${ORIGIN}/icons/icon-192.png`), 'StaleWhileRevalidate')
  check(
    `${tag}08b images on other hosts are left alone`,
    ['https://lh3.googleusercontent.com/a/photo.jpg', `${SUPABASE}/storage/v1/object/public/avatars/me.png`].map((href) => handlerFor(routes, href)),
    ['none', 'none']
  )
  check(`${tag}09 image caching skips /api/`, handlerFor(routes, `${ORIGIN}/api/card/qr/jane.png`), 'none')
  check(
    `${tag}10 image caching skips /_next/`,
    [handlerFor(routes, `${ORIGIN}/_next/image?url=%2Favatar.png&w=96&q=75`), handlerFor(routes, `${ORIGIN}/_next/static/media/logo.3c1e.png`)],
    ['none', 'CacheFirst']
  )
  check(
    `${tag}10b background-removal runtime still goes straight to the network`,
    [handlerFor(routes, 'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/resources.json'), handlerFor(routes, `${ORIGIN}/cutout-assets/ort-wasm-simd.wasm`)],
    ['NetworkOnly', 'NetworkOnly']
  )
  check(`${tag}10c only the approved caches exist`, names, APPROVED_CACHES)
}

// ═══════════════════ the config the build compiles ═══════════════════

const nodeRequire = createRequire(path.join(ROOT, 'package.json'))
const pluginPath = nodeRequire.resolve('@ducanh2912/next-pwa')
let captured: Record<string, any> | null = null
nodeRequire.cache[pluginPath] = {
  id: pluginPath,
  filename: pluginPath,
  loaded: true,
  exports: {
    default: (options: Record<string, any>) => {
      captured = options
      return (config: unknown) => config
    },
  },
} as unknown as NodeJS.Module
nodeRequire(path.join(ROOT, 'next.config.js'))
const pwa = (captured ?? {}) as unknown as Record<string, any>

const configRoutes: Route[] = (pwa.workboxOptions?.runtimeCaching ?? []).map((rule: Record<string, any>) => ({
  matcher: rule.urlPattern,
  handler: rule.handler,
  cacheName: rule.options?.cacheName,
  // The plugin attaches its offline fallback to every rule that carries options.
  fallback: Boolean(pwa.fallbacks?.document) && rule.options !== undefined,
}))

// ═══════════════════ the worker the build generated ═══════════════════

/**
 * Runs a generated sw.js with Workbox replaced by a recorder.
 *
 * The generated file defines itself through an AMD-style `define` that loads
 * Workbox with importScripts. Supplying `define` up front skips that loader and
 * hands the worker's factory a stand-in whose strategies and plugins are plain
 * records, so every `registerRoute` call is captured with its real matcher.
 */
function loadBuiltWorker(source: string) {
  const routes: Route[] = []
  const imported: string[] = []
  const precached: string[] = []
  const recorder = (name: string) =>
    function (options?: Record<string, any>) {
      return { strategy: name, options }
    }
  const workbox = new Proxy(
    {},
    {
      get: (_target, name) => {
        if (typeof name !== 'string') return undefined
        if (name === 'registerRoute') {
          return (matcher: unknown, handler: { strategy?: string; options?: Record<string, any> }) => {
            routes.push({
              matcher,
              handler: handler?.strategy ?? 'unknown',
              cacheName: handler?.options?.cacheName,
              fallback: Boolean(handler?.options?.plugins?.some((plugin: object) => 'handlerDidError' in plugin)),
            })
          }
        }
        if (name === 'precacheAndRoute') {
          return (entries: ({ url: string } | string)[]) => {
            precached.push(...entries.map((entry) => (typeof entry === 'string' ? entry : entry.url)))
          }
        }
        return recorder(name)
      },
    }
  )
  const sandbox: Record<string, unknown> = {
    importScripts: (...urls: string[]) => {
      imported.push(...urls)
    },
    skipWaiting: () => undefined,
    addEventListener: () => undefined,
  }
  sandbox.self = sandbox
  sandbox.define = (_deps: unknown, factory: (wb: unknown) => void) => factory(workbox)
  vm.runInNewContext(source, sandbox)
  return { routes, imported, precached }
}

/** Runs the cleanup script where Cache Storage is the only thing it can reach. */
async function runCleanup(source: string) {
  const deleted: string[] = []
  const listeners: Record<string, ((event: unknown) => void)[]> = {}
  const sandbox = {
    self: {
      addEventListener: (type: string, listener: (event: unknown) => void) => {
        ;(listeners[type] = listeners[type] ?? []).push(listener)
      },
    },
    caches: {
      delete: async (name: string) => {
        deleted.push(name)
        return true
      },
    },
  }
  vm.runInNewContext(source, sandbox)
  const pending: PromiseLike<unknown>[] = []
  for (const listener of listeners.activate ?? []) {
    listener({ waitUntil: (work: PromiseLike<unknown>) => pending.push(work) })
  }
  await Promise.all(pending)
  return { deleted: deleted.sort(), events: Object.keys(listeners).sort() }
}

function sinceHotfixBase(): number {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', HOTFIX_BASE, 'HEAD'], { cwd: ROOT, stdio: 'ignore' })
    return Number(git('rev-list', '--count', `${HOTFIX_BASE}..HEAD`))
  } catch {
    return -1
  }
}

async function main() {
  // ═══════════════════ CACHING POLICY (config) ═══════════════════

  check('P00 the config loads with the plugin options captured', configRoutes.length > 0, true)
  policy('P', configRoutes)

  // ═══════════════════ START URL / RELOAD FLAGS ═══════════════════

  check('F11 cacheStartUrl is off', pwa.cacheStartUrl, false)
  check('F12 dynamicStartUrl is off — the flag that actually registers the start-url route in next-pwa 10.x', pwa.dynamicStartUrl, false)
  check('F13 no reload when the connection returns', pwa.reloadOnOnline, false)
  check('F13b the offline page is still the fallback document', pwa.fallbacks?.document, '/offline')
  check('F13c client-side navigations are not cached either', [pwa.cacheOnFrontEndNav, pwa.aggressiveFrontEndNavCaching].some((v) => v === true), false)
  check('F13d the worker still registers and takes over without a prompt', [pwa.register, pwa.skipWaiting], [true, true])

  // ═══════════════════ CLEANUP OF WHAT THE OLD WORKER STORED ═══════════════════

  const cleanupFile = 'public/sw-cache-cleanup.js'
  const cleanupExists = fs.existsSync(path.join(ROOT, cleanupFile))
  check('C14 the cleanup script exists', cleanupExists, true)
  check('C14b the worker config loads it', pwa.workboxOptions?.importScripts, ['/sw-cache-cleanup.js'])
  let ignored = true
  try {
    execFileSync('git', ['check-ignore', '-q', cleanupFile], { cwd: ROOT, stdio: 'ignore' })
  } catch {
    ignored = false
  }
  check('C14c it is committed source, not ignored as build output', ignored, false)
  if (cleanupExists) {
    const cleanup = await runCleanup(read(cleanupFile))
    check('C15 on activation it deletes exactly the caches the production worker wrote', cleanup.deleted, RETIRED_CACHES)
    check('C15b it listens for nothing else, so it intercepts no request', cleanup.events, ['activate'])
    check(
      'C16 it touches no cookies, web storage, IndexedDB, clients, registration or other caches',
      /cookie|localStorage|sessionStorage|indexedDB|clients\.|registration|caches\.(keys|open|match)/i.test(stripComments(read(cleanupFile))),
      false
    )
  }
  check('C15c no current rule writes to a retired cache', configRoutes.map((r) => r.cacheName ?? '').filter((n) => RETIRED_CACHES.includes(n)), [])

  // ═══════════════════ MIDDLEWARE ═══════════════════

  const middleware = code('middleware.ts')
  const matcherSource = (middleware.match(/matcher:\s*\[\s*'([^']+)'/) ?? [])[1] ?? ''
  const matcher = new RegExp(`^${matcherSource}$`)
  check('M17 middleware skips the cleanup script', matcher.test('/sw-cache-cleanup.js'), false)
  check('M18 middleware skips the offline fallback script', matcher.test('/fallback-ce627215c0e4a9af.js'), false)
  check('M19 middleware skips the worker helper scripts', matcher.test('/swe-worker-5a2b9c.js'), false)
  check('M19b the worker, Workbox, manifest and offline page are still skipped', ['/sw.js', '/workbox-5976b224.js', '/manifest.json', '/offline'].map((p) => matcher.test(p)), [false, false, false, false])
  check(
    'M19c every app screen still goes through middleware',
    ['/', '/home', '/contacts', '/scan', '/settings', '/onboarding', '/login', '/d/jane-doe'].map((p) => matcher.test(p)),
    [true, true, true, true, true, true, true, true]
  )

  // ═══════════════════ OFFLINE PAGE ═══════════════════

  const offline = code('app/offline/page.tsx')
  const retry = fs.existsSync(path.join(ROOT, 'app/offline/RetryButton.tsx')) ? code('app/offline/RetryButton.tsx') : ''
  check(
    'O21 the offline page promises nothing ABC does not do',
    /odešl|až budeš|will be sent|be sent (later|when|once)|queued|sync(ed)? (later|when)|once you.?re back|when you.?re back online|available offline|works offline/i.test(offline + retry),
    false
  )
  check('O21b it says a connection is needed', /needs an internet connection/i.test(offline), true)
  check('O22 retry is a real button the person presses', retry.includes("'use client'") && /<button\s+type="button"\s+onClick=\{retry\}/.test(retry) && offline.includes('<RetryButton />'), true)
  check('O22b and it retries the page that failed', retry.includes('window.location.reload()'), true)
  check('O22c it no longer sends people to /scan', /href="\/scan"/.test(offline), false)

  // ═══════════════════ DEPENDENCIES / APP CODE ═══════════════════

  const pkg = JSON.parse(read('package.json'))
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  check('D23 one PWA library, the one already in use', Object.keys(deps).filter((d) => /pwa|workbox|serwist/i.test(d)), ['@ducanh2912/next-pwa'])
  check('D23b the hotfix test is registered', pkg.scripts?.['test:pwa-private-cache'], 'tsx scripts/test-pwa-private-cache-hotfix.ts')
  const sourceFiles = ['app', 'components', 'lib'].flatMap((dir) => listFiles(path.join(ROOT, dir), /\.(ts|tsx)$/))
  check(
    'D23c no app code reloads on reconnect or on a worker change',
    sourceFiles.filter((file) => /addEventListener\(\s*['"](online|controllerchange)['"]/.test(stripComments(read(file)))).map((f) => path.relative(ROOT, f)),
    []
  )

  // ═══════════════════ HOTFIX SCOPE (pins for review) ═══════════════════

  const since = sinceHotfixBase()
  if (since === 0 || since === 1) {
    const changed = [
      ...new Set([...git('diff', '--name-only', HOTFIX_BASE).split('\n'), ...git('ls-files', '--others', '--exclude-standard').split('\n')].filter(Boolean)),
    ].sort()
    const allowed = [
      'app/offline/RetryButton.tsx',
      'app/offline/page.tsx',
      'middleware.ts',
      'next.config.js',
      'package.json',
      'public/sw-cache-cleanup.js',
      'scripts/test-pwa-private-cache-hotfix.ts',
    ]
    check('S24 no manifest file was modified', changed.filter((f) => /manifest/i.test(f)), [])
    check('S25 only the hotfix files changed', changed.filter((f) => !allowed.includes(f)), [])
    check(
      'S25b no auth, CRM, billing, wallet, event, scan, component, lib or migration file changed',
      changed.filter((f) => /^(app\/(api|auth|\(auth\)|events|pricing|settings|scan|contacts|home)\/|lib\/|components\/|supabase\/)/.test(f)),
      []
    )

    const baseMiddleware = stripComments(git('show', `${HOTFIX_BASE}:middleware.ts`))
    const logic = (source: string) => source.slice(0, source.indexOf('export const config')).replace(/\n\s*\n+/g, '\n').trim()
    check('S20 middleware logic is untouched — no /events or any other Berlin route', logic(middleware) === logic(baseMiddleware) && !middleware.includes("'/events'"), true)
    const alternatives = (source: string) => ((source.match(/matcher:\s*\[\s*'\/\(\(\?!([^)]*)\)/) ?? [])[1] ?? '').split('|')
    const added = alternatives(middleware).filter((a) => !alternatives(baseMiddleware).includes(a)).sort()
    const removed = alternatives(baseMiddleware).filter((a) => !alternatives(middleware).includes(a))
    check('S20b the matcher gains exactly the three worker-script exclusions', [added, removed], [['fallback-', 'sw-cache-cleanup.js', 'swe-worker-'], []])

    const basePkg = JSON.parse(git('show', `${HOTFIX_BASE}:package.json`))
    check('S23 dependencies are exactly those on main', [pkg.dependencies, pkg.devDependencies], [basePkg.dependencies, basePkg.devDependencies])
    check('S23b the only script change is the hotfix test', Object.keys(pkg.scripts).filter((k) => pkg.scripts[k] !== basePkg.scripts?.[k]), ['test:pwa-private-cache'])
  } else {
    skipped.push(
      since < 0
        ? `scope pins: ${HOTFIX_BASE.slice(0, 7)} is not an ancestor of HEAD`
        : `scope pins: HEAD is ${since} commits past the hotfix base, so its diff is no longer the hotfix alone`
    )
  }

  // ═══════════════════ BUILT WORKER ═══════════════════

  const configMtime = fs.statSync(path.join(ROOT, 'next.config.js')).mtimeMs
  const workerPath = option('worker') ?? path.join(ROOT, 'public/sw.js')
  const buildId = path.join(ROOT, '.next/BUILD_ID')
  const workerFresh = fs.existsSync(workerPath) && (option('worker') !== undefined || fs.statSync(workerPath).mtimeMs >= configMtime)

  if (workerFresh) {
    const source = read(workerPath)
    let built: ReturnType<typeof loadBuiltWorker> | null = null
    try {
      built = loadBuiltWorker(source)
    } catch (err) {
      failures.push(`W00 the built worker could not be evaluated: ${err instanceof Error ? err.message : String(err)}`)
    }
    if (built) {
      check('W00 the built worker registered its routes', built.routes.length > 0, true)
      policy('W', built.routes)
      check('W11 no route is registered for the start URL', built.routes.some((route) => typeof route.matcher === 'string'), false)
      check('W12 the worker loads the cleanup script', built.imported.includes('/sw-cache-cleanup.js'), true)
      check('W13 the cleanup script and the offline page are precached', ['/sw-cache-cleanup.js', '/offline'].map((u) => built.precached.includes(u)), [true, true])
      check('W14 no retired cache name appears anywhere in the worker', RETIRED_CACHES.filter((name) => source.includes(`"${name}"`)), [])
    }
  } else {
    const reason = `built worker: ${fs.existsSync(workerPath) ? 'public/sw.js predates next.config.js' : 'no public/sw.js'} — run a production build`
    if (REQUIRE_BUILD) failures.push(`W00 ${reason}`)
    else skipped.push(reason)
  }

  const chunksDir = option('chunks') ?? path.join(ROOT, '.next/static/chunks')
  const chunksFresh =
    fs.existsSync(chunksDir) && (option('chunks') !== undefined || (fs.existsSync(buildId) && fs.statSync(buildId).mtimeMs >= configMtime))
  if (chunksFresh) {
    const chunks = listFiles(chunksDir, /\.js$/).map((file) => fs.readFileSync(file, 'utf8'))
    check('R00 the scan found the worker registration code', chunks.some((s) => /["']serviceWorker["']\s*in\s*navigator/.test(s)), true)
    check(
      'R01 nothing reloads the page when the connection returns',
      chunks.filter((s) => /addEventListener\(\s*["']online["']\s*,\s*\(\)\s*=>\s*(window\.)?location\.reload\(\)\s*\)/.test(s)).length,
      0
    )
    check('R02 no client hook stores the start URL', chunks.filter((s) => /caches\.open\(\s*["']start-url["']\s*\)|__START_URL_CACHE__/.test(s)).length, 0)
  } else {
    const reason = 'built client chunks: no .next build newer than next.config.js — run a production build'
    if (REQUIRE_BUILD) failures.push(`R00 ${reason}`)
    else skipped.push(reason)
  }

  // ═══════════════════ RESULT ═══════════════════

  console.log(`\nPWA private-cache hotfix: ${passed} passed, ${failures.length} failed, ${skipped.length} group(s) skipped\n`)
  for (const reason of skipped) console.log(`  – skipped ${reason}`)
  for (const failure of failures) console.log(`  ✗ ${failure}\n`)
  if (failures.length > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
