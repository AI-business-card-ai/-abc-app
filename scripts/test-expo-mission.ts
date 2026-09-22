/**
 * Expo Mission preview — regression suite.
 *
 * Run with `npm run test:expo-mission` from the repository root.
 *
 * The dashboard now carries a teaser for a feature that does not exist in this
 * release. Two things have to stay true, and neither is obvious from reading
 * the component:
 *
 *   1. It is a **teaser**. It promises, it does not do. No route into the
 *      unreleased feature, no request, no table, no flag, no checkout — so it
 *      renders on a database that has never seen an Event Intelligence
 *      migration, which is every production database today.
 *   2. It is **honest**. Every claim about Expo Mission is in the future
 *      tense, it says "coming soon" where a person will look, and it names no
 *      real trade fair, because naming one implies an integration nobody has.
 *
 * Static and pure checks. Nothing here renders a browser.
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

const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel))
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
/** Source with comments removed: what ships, not what it says about itself. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const PREVIEW = 'components/expo-mission/ExpoMissionPreview.tsx'
const INFO = 'components/expo-mission/ExpoMissionInfo.tsx'
const DASHBOARD = 'components/dashboard/Dashboard.tsx'
const TEASER_FILES = [PREVIEW, INFO]

function run() {
  // ══════════ A. It is on Home, always ══════════

  check('A1 both teaser components exist', [exists(PREVIEW), exists(INFO)], [true, true])

  const dashboard = code(DASHBOARD)
  check(
    'A2 Home renders the Expo Mission preview',
    [dashboard.includes("from '@/components/expo-mission/ExpoMissionPreview'"), dashboard.includes('<ExpoMissionPreview />')],
    [true, true]
  )
  /*
    Unconditionally. A teaser behind a condition is a teaser somebody will
    find switched off, and this one is for every signed-in account.
  */
  check(
    'A3 nothing gates it: no flag, no environment, no condition around the render',
    [
      /ABC_EVENT_INTELLIGENCE|eventIntelligenceEnabled|process\.env/.test(dashboard),
      /\{[^}]*&&\s*<ExpoMissionPreview|\?\s*<ExpoMissionPreview/.test(dashboard),
    ],
    [false, false]
  )
  check(
    'A4 and it takes no props, so no query can fail and leave the dashboard without it',
    /export default function ExpoMissionPreview\(\)/.test(code(PREVIEW)),
    true
  )

  const preview = code(PREVIEW)

  // ══════════ B. It says it is coming, and what it will do ══════════

  check('B1 the section is titled Expo Mission', /Expo Mission\s*<\/h2>/.test(preview), true)
  check(
    'B2 "Coming soon" is text, not a colour — a screen reader reads it too',
    [/>\s*Coming soon\s*</.test(preview), /aria-hidden[^>]*>\s*Coming soon/.test(preview)],
    [true, false]
  )
  check(
    'B3 the promise is the locked copy: where you are going, what you sell, who you are looking for',
    [
      preview.includes('Tell ABC where you are going, what you sell and who you are looking for.'),
      preview.includes('ABC will help you find the companies worth your time'),
      preview.includes('guide you from the right\n              target to the next business step.') ||
        /guide you from the right\s+target to the next business step\./.test(preview),
    ],
    [true, true, true]
  )
  check('B4 the call to action is "See how it will work"', preview.includes('See how it will work'), true)
  check(
    'B5 and it opens information rather than navigating: a button, not a link',
    [/<Button\s+onClick=\{\(\) => setShowInfo\(true\)\}/.test(preview), /href=/.test(preview)],
    [true, false]
  )

  const info = code(INFO)
  check(
    'B6 the sheet tells the whole story: the headline, the five steps and the closing line',
    [
      info.includes('Your event. Your mission.') && info.includes('ABC guides the next step.'),
      info.includes('Tell ABC where you are going'),
      info.includes('Tell ABC what you sell and what you are looking for'),
      info.includes('ABC will find the companies worth your time'),
      info.includes('Prepare the right conversation'),
      info.includes('Meet. Scan. Remember. Follow up.'),
      info.includes('Find the right company. Show the right product. Start the right conversation.'),
      info.includes('ABC Expo Mission — coming soon'),
    ],
    [true, true, true, true, true, true, true, true]
  )
  check(
    'B7 it names the four kinds of company the mission will look for',
    ['Customers', 'suppliers', 'distributors', 'partners'].filter((word) => !info.toLowerCase().includes(word.toLowerCase())),
    []
  )
  check('B8 it closes with Got it, and nothing else', [info.includes('Got it'), /Build my mission|Start mission|Import exhibitors|Find opportunities/i.test(info)], [true, false])

  // ══════════ C. Honest ══════════

  /*
    Present-tense claims about an unreleased feature. "ABC finds", "ABC knows",
    "automatically", "already" — each of them would say the thing exists.
  */
  check(
    'C1 every claim about Expo Mission is in the future tense',
    TEASER_FILES.filter((file) =>
      /ABC (finds|knows|scrapes|imports|schedules|sends|books|optimi[sz]es)\b|automatically|already (knows|finds|has)|is now available|available now/i.test(code(file))
    ),
    []
  )
  check(
    'C2 "coming soon" appears where a person looks: on the card and in the sheet',
    [/Coming soon/i.test(preview), /coming soon/i.test(info)],
    [true, true]
  )
  check('C3 the sheet says plainly that it is not available yet', info.includes('Expo Mission is not available yet'), true)
  /*
    No real fair. "MEDICA 2026" beside "ABC will find the companies worth your
    time" reads as an integration, and there is none — no organiser has agreed
    to anything, and one of them reserves its exhibitor directory against AI
    crawlers outright.
  */
  check(
    'C4 no real trade fair is named anywhere in the teaser',
    TEASER_FILES.filter((file) => /MEDICA|Ambiente|Hannover Messe|CES\b|Bauma|Anuga|IFA\b/i.test(read(file))),
    []
  )
  check('C5 the example event is invented and reads as one', info.includes('Example Expo 2027'), true)
  check(
    'C6 no invented numbers: no exhibitor counts, no match scores, no fake mission status',
    TEASER_FILES.filter((file) => /\b\d{2,}\s*(exhibitors|companies|matches|leads)\b|\b\d{1,3}%\s*match/i.test(read(file))),
    []
  )

  // ══════════ D. It touches nothing unreleased ══════════

  check(
    'D1 no route into Event Intelligence — not in a link, not in a string',
    TEASER_FILES.filter((file) => /\/events\/intelligence|\/api\/event-intelligence|event-intelligence/i.test(code(file))),
    []
  )
  check(
    'D2 it calls nothing: no fetch, no server action, no Supabase client',
    TEASER_FILES.filter((file) => /fetch\(|createClient|supabase|'use server'/i.test(code(file))),
    []
  )
  check(
    'D3 it reads no Event Intelligence table, so it renders on a database that never had the migrations',
    TEASER_FILES.filter((file) => /intel_[a-z_]+/i.test(code(file))),
    []
  )
  check(
    'D4 no feature flag reaches it — the teaser and the unreleased feature are separate things',
    TEASER_FILES.filter((file) => /ABC_EVENT_INTELLIGENCE|eventIntelligenceEnabled|NEXT_PUBLIC_/.test(code(file))),
    []
  )
  check(
    'D5 nothing about pricing, checkout or a plan',
    TEASER_FILES.filter((file) => /\/pricing|checkout|stripe|upgrade to|per month|€|\$\d/i.test(code(file))),
    []
  )
  /*
    The release this ships in has no Event Intelligence at all: no pages, no
    routes, no library. If any of it ever arrives on this branch, this fails —
    which is the point, because then "the teaser is the only Expo Mission a
    user can reach" would need checking again rather than assuming.
  */
  check(
    'D6 the unreleased feature is absent from this release entirely',
    [exists('app/events/intelligence'), exists('app/api/event-intelligence'), exists('lib/event-intelligence')],
    [false, false, false]
  )

  // ══════════ E. Navigation and the rest of Home ══════════

  const layoutFiles = fs
    .readdirSync(path.join(ROOT, 'components/layout'), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `components/layout/${entry.name}`)
  check(
    'E1 no navigation knows about Expo Mission: no new tab, no new item',
    layoutFiles.filter((file) => /expo[- ]?mission|ExpoMission/i.test(read(file))),
    []
  )
  check(
    'E2 the dashboard still leads with what ABC does today — scan, then the working cards',
    [
      dashboard.indexOf('<ScanActionCard />') < dashboard.indexOf('<ExpoMissionPreview />'),
      dashboard.indexOf('<FollowUpsCard') < dashboard.indexOf('<ExpoMissionPreview />'),
      dashboard.indexOf('<EventsCard') < dashboard.indexOf('<ExpoMissionPreview />'),
    ],
    [true, true, true]
  )

  // ══════════ F. Accessible ══════════

  check(
    'F1 the section is a landmark with a heading, and the heading is one level under the page title',
    [/aria-labelledby="expo-mission-preview-title"/.test(preview), /<h2\s[^>]*id="expo-mission-preview-title"/.test(preview)],
    [true, true]
  )
  check(
    'F2 the sheet is a modal dialog, labelled by its own heading',
    [/role="dialog"/.test(info), /aria-modal="true"/.test(info), /aria-labelledby="expo-mission-info-title"/.test(info), /<h2\s[^>]*id="expo-mission-info-title"/.test(info)],
    [true, true, true, true]
  )
  check(
    'F3 it can be left by keyboard, by Back, by the backdrop and by a labelled button',
    [
      /e\.key === 'Escape'/.test(info),
      /useNativeBackHandler\(true, onClose\)/.test(info),
      /if \(e\.target === e\.currentTarget\) onClose\(\)/.test(info),
      /aria-label="Close"/.test(info),
    ],
    [true, true, true, true]
  )
  check('F4 opening it moves focus into it, and the page behind it does not scroll', [/closeRef\.current\?\.focus\(\)/.test(info), /document\.body\.style\.overflow = 'hidden'/.test(info)], [true, true])
  check(
    'F4a closing it puts focus back on the button that opened it, not at the top of the page',
    [/ctaRef\.current\?\.querySelector\('button'\)\?\.focus\(\)/.test(preview), /onClose=\{close\}/.test(preview)],
    [true, true]
  )
  check(
    'F5 the decorative icon and the step numbers are hidden from screen readers; nothing else is',
    (read(PREVIEW) + read(INFO)).match(/aria-hidden="true"/g)?.length,
    2
  )
  check(
    'F6 every control is a real button and reaches 44px through the shared components',
    [/<button/.test(info), /h-9 w-9/.test(info), /<Button/.test(preview) && /<Button/.test(info)],
    [true, true, true]
  )

  // ── Report ──

  console.log(`\n  Expo Mission preview — ${passed} passed, ${failures.length} failed\n`)
  for (const failure of failures) console.log(`  ✗ ${failure}\n`)
  if (failures.length > 0) process.exit(1)
}

run()
