/**
 * Landing truthfulness and search metadata.
 *
 * Run with `npm run test:landing-seo` from the repository root.
 *
 * Keeps the public pages saying only what the product does today (Smart Scan
 * packs not on sale, no price comparison for a Pro that has no price, Planned
 * Events available and Event & Expo Intelligence coming, integrations from
 * configuration), and keeps robots.txt, the sitemap and canonical links on the
 * canonical origin and in step with the signed-in routes middleware protects.
 * Static checks only; nothing here renders a browser.
 */
import fs from 'node:fs'
import path from 'node:path'

import robots from '@/app/robots'
import sitemap from '@/app/sitemap'
import { PUBLIC_PAGES, SITE_URL } from '@/lib/site'

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
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const landingFiles = (dir: string): string[] =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) return landingFiles(rel)
    return /\.tsx?$/.test(entry.name) ? [rel] : []
  })

/* ---------------------------------------------------------- origin */

check('S1 the canonical origin is www', SITE_URL, 'https://www.abccard.io')
check(
  'S2 the landing and /pricing take their canonical base from it',
  [code('app/page.tsx').includes('new URL(SITE_URL)'), code('app/layout.tsx').includes('new URL(SITE_URL)'), code('app/pricing/page.tsx').includes("canonical: '/pricing'")],
  [true, true, true]
)
check('S3 the landing no longer falls back to the apex', /'https:\/\/abccard\.io'/.test(code('app/page.tsx')), false)

/* ---------------------------------------------------------- robots and sitemap */

const middleware = code('middleware.ts')
const protectedBlock = middleware.slice(middleware.indexOf('const protectedRoutes = ['), middleware.indexOf(']', middleware.indexOf('const protectedRoutes = [')))
const protectedRoutes = [...protectedBlock.matchAll(/'([^']+)'/g)].map((m) => m[1])
const rules = robots().rules
const rule = Array.isArray(rules) ? rules[0] : rules
const disallow = ([] as string[]).concat(rule.disallow ?? [])

check('S4 middleware still names its signed-in routes', protectedRoutes.length > 10, true)
check('S5 robots.txt disallows every signed-in route middleware protects', protectedRoutes.filter((route) => !disallow.includes(route)), [])
check('S6 and the API and auth callbacks', [disallow.includes('/api/'), disallow.includes('/auth/')], [true, true])
check('S7 robots.txt allows the site and names the sitemap on the canonical origin', [rule.allow, robots().sitemap], ['/', `${SITE_URL}/sitemap.xml`])
check('S8 public cards are neither blocked nor listed (an owner decision)', [disallow.some((d) => /^\/(u|d|card)\b/.test(d)), PUBLIC_PAGES.some((p) => /^\/(u|d|card)\b/.test(p))], [false, false])

const urls = sitemap().map((entry) => entry.url)
check('S9 every sitemap URL is on the canonical origin', urls.every((url) => url.startsWith(`${SITE_URL}/`)), true)
check(
  'S10 every sitemap page exists as a route',
  PUBLIC_PAGES.filter((page) => !exists(page === '/' ? 'app/page.tsx' : `app${page}/page.tsx`)),
  []
)
check('S11 no sitemap page is a signed-in route', PUBLIC_PAGES.filter((page) => protectedRoutes.some((route) => page.startsWith(route))), [])

/* ---------------------------------------------------------- assets */

const manifest = JSON.parse(read('public/manifest.json')) as { icons: { src: string }[]; description: string }
const layout = code('app/layout.tsx')
const layoutIcons = [...layout.matchAll(/url: '([^']+)'/g)].map((m) => m[1])
check('S12 every manifest icon exists', manifest.icons.map((icon) => icon.src).filter((src) => !exists(`public${src}`)), [])
check('S13 every icon the root layout names exists', layoutIcons.filter((src) => !exists(`public${src}`)), [])
check(
  'S14 no page metadata points at a share image that does not exist',
  ['app/page.tsx', 'app/pricing/page.tsx', 'app/layout.tsx'].filter((file) => /images:/.test(code(file))),
  []
)

/* ---------------------------------------------------------- what the landing claims */

const landing = landingFiles('components/landing').map((file) => code(file)).join('\n')
const pricing = code('components/landing/sections/PricingSection.tsx')
check('C1 Smart Scan packs are marked as not on sale', pricing.includes('Not on sale yet'), true)
check('C2 and nothing invites buying them', [/Buy capture/.test(pricing), /you buy scans/.test(pricing)], [false, false])
check('C3 /pricing describes packs and Pro as coming soon', /Smart Scan Packs and ABC Pro are coming soon/.test(code('app/pricing/page.tsx')), true)
check('C4 no price comparison for a Pro that has no price', [/less than one lunch/i.test(landing), /costs more than ABC/.test(landing)], [false, false])
check('C5 the CRM closing line appears once', (landing.match(/It turns real conversations into CRM-ready context/g) ?? []).length, 1)
check(
  'C6 Planned Events available, Intelligence coming',
  [
    code('components/landing/sections/LifecycleSection.tsx').includes('cine-phase-flag">Available now</span>'),
    code('components/landing/sections/EventIntelligenceSection.tsx').includes('You can plan an event in ABC today.'),
    code('components/landing/sections/EventIntelligenceSection.tsx').includes('Coming soon'),
    /Event Plan for the day/.test(landing),
  ],
  [true, true, true, false]
)
check(
  'C7 landing components import the integrations module as a type only',
  landingFiles('components/landing').filter((file) => /^import (?!type )[^\n]*'@\/lib\/landing\/integrations'/m.test(read(file))),
  []
)
check(
  'C8 what crosses to the client is names and a flag',
  /export type LandingIntegrations = \{\s*crm: string\[\]\s*gmail: boolean\s*\}/.test(code('lib/landing/integrations.ts')),
  true
)
check('C9 the manifest makes no Intelligence claim', /intelligence/i.test(manifest.description), false)

const total = passed + failures.length
if (failures.length) {
  console.log(`\nLanding SEO: ${passed}/${total} PASS, ${failures.length} FAILED\n`)
  for (const failure of failures) console.log('  FAIL ' + failure)
  process.exit(1)
}
console.log(`\nLanding SEO: ${passed}/${total} PASS`)
