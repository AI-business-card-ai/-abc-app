/**
 * Launch UX regression suite.
 *
 * Run with `npm run test:launch-ux` from the repository root.
 *
 * The failure states fixed in the launch audit, kept fixed: no unstyled blank
 * page on a render error or an unknown address, no browser wording ("Load
 * failed", "Unexpected token '<'") or bare "Unauthorized" in the screens that
 * report a failed request, no false "address taken" when the availability check
 * itself fails, full-screen card overlays clear of a landscape notch, and every
 * literal in-app link pointing at a route that exists. Static and pure checks
 * only; nothing here renders a browser or claims device QA.
 */
import fs from 'node:fs'
import path from 'node:path'

import {
  NETWORK_FAILURE_MESSAGE,
  SESSION_ENDED_MESSAGE,
  userFacingRequestError,
} from '@/lib/network-error'

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

function files(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) files(rel, ext, out)
    else if (ext.test(entry.name)) out.push(rel)
  }
  return out
}

// ═══════════════════ NO BLANK SCREENS ═══════════════════

const appError = code('app/error.tsx')
const globalError = code('app/global-error.tsx')
const notFound = code('app/not-found.tsx')
check(
  'B1 a render error anywhere keeps the app, says what happened, and offers try-again and home — never the error text',
  [exists('app/error.tsx'), appError.startsWith("'use client'"), appError.includes('onClick={reset}'), appError.includes('href="/home"'), /\{error\.message\}|error\.stack/.test(appError)],
  [true, true, true, true, false]
)
check(
  'B2 a failure in the root layout still renders a document of its own, with try-again',
  [exists('app/global-error.tsx'), globalError.includes('<html') && globalError.includes('<body'), globalError.includes('onClick={reset}'), /\{error\.message\}|error\.stack/.test(globalError)],
  [true, true, true, false]
)
check('B3 an unknown address has a way back into the app', [exists('app/not-found.tsx'), notFound.includes('href="/home"')], [true, true])

// ═══════════════════ REQUEST FAILURES IN PLAIN WORDS ═══════════════════

class PlainError extends Error {}
check(
  'W1 a lost connection, a lapsed session and an unparseable reply are each said plainly; a server sentence is kept',
  [
    userFacingRequestError(new TypeError('Load failed'), 'x'),
    userFacingRequestError(new TypeError('Failed to fetch'), 'x'),
    userFacingRequestError(new Error('Unauthorized'), 'x'),
    userFacingRequestError(new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"), 'Could not save.'),
    userFacingRequestError(new SyntaxError('The string did not match the expected pattern.'), 'Could not save.'),
    userFacingRequestError(new PlainError('That email address is not valid. Check it and try again.'), 'x'),
    userFacingRequestError(null, 'fallback'),
  ],
  [NETWORK_FAILURE_MESSAGE, NETWORK_FAILURE_MESSAGE, SESSION_ENDED_MESSAGE, 'Could not save.', 'Could not save.', 'That email address is not valid. Check it and try again.', 'fallback']
)

/*
  Components with no importer anywhere, kept out of the guard below rather than
  edited: they cannot render. If one of them is ever imported again, W3 fails
  and it must be brought up to the same rule first.
*/
// ContactCrmDetail and ScanContextSheet were here until #8B removed them outright.
const UNUSED = ['components/card/CardEditor.tsx', 'components/contact/EventTagPrompt.tsx']
const clientFiles = [...files('components', /\.tsx$/), ...files('app', /\.tsx$/)].filter((f) => read(f).startsWith("'use client'"))
const raw = clientFiles
  .filter((f) => !UNUSED.includes(f))
  .filter((f) => /(setError|setProError|setLoadError|showToast)\(\s*\w+ instanceof Error \? \w+\.message/.test(code(f)))
check('W2 no screen that can render shows a caught error’s own text', raw, [])
const sources = [...files('app', /\.tsx?$/), ...files('components', /\.tsx?$/), ...files('lib', /\.tsx?$/)]
check(
  'W3 the excluded components really are unused',
  UNUSED.map((f) => {
    const name = path.basename(f, '.tsx')
    return sources.filter((s) => s !== f && new RegExp(`from '[^']*/${name}'`).test(read(s)))
  }),
  UNUSED.map(() => [])
)
check(
  'W4 the screens fixed in the audit use the shared wording',
  [
    ['app/(auth)/login/page.tsx', "userFacingRequestError(err, 'Sign in failed.')"],
    ['app/(auth)/register/page.tsx', "userFacingRequestError(err, 'Registration failed.')"],
    ['app/pricing/page.tsx', "userFacingRequestError(err, 'Checkout failed')"],
    ['components/settings/BillingSettingsView.tsx', "userFacingRequestError(err, 'Could not open the billing portal.')"],
    ['components/chat/MessageComposer.tsx', "userFacingRequestError(e, 'Email send failed')"],
    ['components/scan/BatchExportPanel.tsx', "userFacingRequestError(err, 'Could not push this batch.')"],
    ['components/card/CardExchangeModal.tsx', "userFacingRequestError(err, 'That did not send. Try again.')"],
  ].map(([file, call]) => code(file).includes(call)),
  Array(7).fill(true)
)

// ═══════════════════ NO FALSE PROMISES ═══════════════════

const editor = code('components/card/CardEditorShell.tsx')
const slugEffect = editor.slice(editor.indexOf("fetch(`/api/card/slug-check"), editor.indexOf("fetch(`/api/card/slug-check") + 900)
check(
  'F1 a slug check that fails is unknown, not "taken" — so it no longer blocks publishing — and a real clash still is',
  [slugEffect.includes('if (!res.ok) {'), /if \(!res\.ok\) \{\s*setSlugStatus\('idle'\)/.test(slugEffect), slugEffect.includes("} else if (json.available === false) {"), /!res\.ok \|\| json\.available === false/.test(slugEffect), editor.includes("if (form.card_published && slugStatus === 'bad')")],
  [true, true, true, false, true]
)
check('F2 the slug check’s own failure reason is in English', /Kontrola|selhala/.test(read('app/api/card/slug-check/route.ts')), false)

// ═══════════════════ LANDSCAPE AND THE NOTCH ═══════════════════

check(
  'L1 the full-screen card and QR overlays pad by the side insets, so the close button is never under a sideways notch',
  ['components/my-card/CardPresentationMode.tsx', 'components/card/CardQrModal.tsx'].map((f) => /paddingLeft: SAFE_LEFT, paddingRight: SAFE_RIGHT/.test(code(f))),
  [true, true]
)

// ═══════════════════ NO DEAD LINKS ═══════════════════

const routes: string[][] = []
;(function walk(dir: string, segs: string[]) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) walk(rel, entry.name.startsWith('(') ? segs : [...segs, entry.name])
    else if (/^(page|route)\.tsx?$/.test(entry.name)) routes.push(segs)
  }
})('app', [])
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const patterns = routes.map((segs) => new RegExp('^/' + segs.map((s) => (s.startsWith('[') ? '[^/]+' : escapeRe(s))).join('/') + '/?$'))
const routeExists = (p: string) => p === '/' || patterns.some((r) => r.test(p))
const dead: string[] = []
const linkRe = /(?:href=\{?|href:\s*|push\(|replace\(|redirect\(|assign\(|location\.href\s*=\s*)\s*['"](\/[A-Za-z0-9_\-/]*)(?:[?#'"])/g
for (const file of sources) {
  const src = read(file)
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(src))) {
    const target = m[1].replace(/\/$/, '') || '/'
    if (target.startsWith('/api/') || target.startsWith('/_next')) continue
    if (!routeExists(target)) dead.push(`${file} -> ${target}`)
  }
}
check('D1 every literal in-app link and redirect points at a route that exists', dead, [])
check('D2 the check actually saw the app’s routes', routes.length > 100, true)

// ═══════════════════ CAMERA AND NATIVE STATES ═══════════════════

const camera = code('lib/scan/useCamera.ts')
check(
  'N1 camera permission denied and camera unavailable are distinct states, not a spinner',
  [camera.includes("setStatus('denied')"), camera.includes("setStatus('unavailable')"), camera.includes("setStatus('error')")],
  [true, true, true]
)

const total = passed + failures.length
if (failures.length) {
  console.log(`\nLaunch UX: ${passed}/${total} PASS, ${failures.length} FAILED\n`)
  for (const failure of failures) console.log('  FAIL ' + failure)
  process.exit(1)
}
console.log(`\nLaunch UX: ${passed}/${total} PASS`)
