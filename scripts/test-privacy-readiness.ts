/**
 * Privacy and store-readiness fact suite.
 *
 * Run with `npm run test:privacy-readiness` from the repository root.
 *
 * The store drafts in docs/store and the Privacy page make factual claims about
 * the product. This suite fails when the code stops matching them — so a new
 * Gmail scope, an inbox read, an analytics SDK, a stored scan photo, an
 * automatic sender or a new native permission cannot ship with disclosures that
 * still say otherwise. It checks facts, not legal adequacy.
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
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

function files(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) files(rel, out)
    else if (/\.(tsx?|js)$/.test(entry.name)) out.push(rel)
  }
  return out
}
const sources = [...files('app'), ...files('lib'), ...files('components')]
const everything = sources.map((f) => [f, code(f)] as const)
const matching = (re: RegExp) => everything.filter(([, src]) => re.test(src)).map(([f]) => f)

// ═══════════════════ GOOGLE ═══════════════════

const googleOauth = code('lib/google-oauth.ts')
const signIn = googleOauth.slice(googleOauth.indexOf('export async function signInWithGoogle'), googleOauth.indexOf('export function isGoogleProvider'))
check('G1 Google sign-in requests no extra scopes: identity only', [signIn.length > 0, /scopes|gmail|access_type/i.test(signIn)], [true, false])
check('G2 the Gmail connector asks for gmail.send, and openid email to name the mailbox — nothing else', [googleOauth.includes("GOOGLE_GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send'"), code('lib/google/gmail-connect.ts').includes("['openid', 'email', GOOGLE_GMAIL_SCOPE].join(' ')")], [true, true])
check(
  'G3 no other Google API scope is requested anywhere',
  [...new Set(everything.flatMap(([, src]) => src.match(/https:\/\/www\.googleapis\.com\/auth\/[a-z._]+/g) ?? []))].sort(),
  ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/wallet_object.issuer'].filter((s) => everything.some(([, src]) => src.includes(s))).sort()
)
check(
  'G4 the only Gmail API call is sending a message: no inbox, thread, label or history read',
  [[...new Set(everything.flatMap(([, src]) => src.match(/gmail\.googleapis\.com\/gmail\/v1\/[A-Za-z/{}$.]+/g) ?? []))], matching(/gmail\/v1\/users\/me\/(?!messages\/send['"`])/)],
  [['gmail.googleapis.com/gmail/v1/users/me/messages/send'], []]
)
check('G5 Google Contacts / People are never called', matching(/people\.googleapis\.com|contacts\/feeds|google\.com\/m8\/feeds|auth\/contacts/), [])
check('G6 Gmail connect is started only from the message screen or Settings → Integrations, never from sign-in', [matching(/\/api\/auth\/google-gmail(\?|['"`])/).filter((f) => !f.startsWith('app/api/') && !f.startsWith('lib/')).sort(), /google-gmail/.test(signIn)], [['components/chat/MessageComposer.tsx', 'components/settings/IntegrationsSettingsView.tsx'], false])

// ═══════════════════ NOTHING SENT BY ITSELF, NOTHING TRACKED ═══════════════════

check('A1 no scheduled or background sender exists', [exists('vercel.json') && /crons/.test(read('vercel.json')), matching(/CRON_SECRET|export const config = \{\s*schedule/)], [false, []])
check('A2 Gmail sends only from the two explicit send routes', matching(/sendGmailForContact\(/).sort(), ['app/api/card/send-gmail/route.ts', 'app/api/contact/send-gmail/route.ts', 'lib/gmail-send.ts'].sort())
const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> }
const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
check('A3 no analytics, advertising or crash-reporting SDK is installed or loaded', [deps.filter((d) => /analytics|posthog|segment|mixpanel|amplitude|sentry|datadog|bugsnag|firebase|facebook|gtag|hotjar|appsflyer|adjust|branch/i.test(d)), matching(/googletagmanager|gtag\(|posthog|mixpanel|hotjar|fbq\(/)], [[], []])

// ═══════════════════ PHOTOS ═══════════════════

check(
  'P1 scanned card photos are not stored: the scan and Multi-Card read routes upload nothing',
  ['app/api/card/scan/route.ts', 'app/api/scan/batch/[id]/detect/route.ts', 'app/api/scan/batch/route.ts'].map((f) => /storage\s*\.from\(|\.upload\(/.test(code(f))),
  [false, false, false]
)
check('P2 the only storage writes are the owner’s own card media, under their own folder', matching(/storage\s*\.from\([^)]*\)\s*\.upload\(/), ['app/api/card/media/route.ts'])

// ═══════════════════ NATIVE PERMISSIONS ═══════════════════

const manifest = read('android/app/src/main/AndroidManifest.xml')
check('N1 Android asks for the internet and the camera, nothing else', [...manifest.matchAll(/uses-permission android:name="([^"]+)"/g)].map((m) => m[1]).sort(), ['android.permission.CAMERA', 'android.permission.INTERNET'])
const plist = read('ios/App/App/Info.plist')
check('N2 iOS declares camera and photo-library add, nothing else', [...plist.matchAll(/<key>(NS\w+UsageDescription)<\/key>/g)].map((m) => m[1]).sort(), ['NSCameraUsageDescription', 'NSPhotoLibraryAddUsageDescription'])

// ═══════════════════ PRIVACY PAGE ═══════════════════

const privacy = read('app/privacy/page.tsx')
check(
  'L1 Privacy names every way to create an account, every service a user can choose to send data to, and in-app deletion',
  [/via Google OAuth/.test(privacy), privacy.includes('email sign-up or from Google or Apple sign-in'), ['Gmail', 'Google Wallet', 'Apple', 'HubSpot', 'Salesforce', 'Pipedrive'].every((s) => privacy.includes(s)), privacy.includes('Settings → Profile & Account → Delete account'), privacy.includes('/account-deletion')],
  [false, true, true, true, true]
)
check('L2 Privacy still says nothing is sent automatically, which A1 and A2 keep true', privacy.includes('nothing is ever sent automatically'), true)
check('L3 Terms promise account deletion, which the app provides', [read('app/terms/page.tsx').includes('delete your account at any time'), exists('app/api/account/delete/route.ts')], [true, true])

// ═══════════════════ THE DRAFTS ═══════════════════

const DOCS = ['README', 'data-inventory', 'apple-privacy-label', 'google-play-data-safety', 'account-deletion', 'google-oauth-verification', 'app-review-notes'].map((d) => `docs/store/${d}.md`)
check('D1 every draft exists', DOCS.filter((d) => !exists(d)), [])
const docText = DOCS.filter(exists).map((d) => [d, read(d)] as const)
check('D2 every draft says it is not submitted, and uncertain answers are marked for the owner', docText.filter(([d, t]) => !/not submitted|Nothing here has been submitted/i.test(t) || (!d.endsWith('README.md') && !t.includes('OWNER REVIEW'))).map(([d]) => d), [])
check('D3 no draft invents a retention period or a certification', docText.filter(([, t]) => /\b\d+\s*(day|days|month|months|year|years)\b|ISO 27001|SOC ?2|HIPAA|certified|GDPR[- ]compliant/i.test(t)).map(([d]) => d), [])
const inventory = read('docs/store/data-inventory.md')
check(
  'D4 the inventory states the Google facts explicitly',
  ['identity only', 'gmail.send', 'does not read the Gmail inbox', 'does not read Google Contacts'].map((s) => inventory.includes(s)),
  [true, true, true, true]
)
const deletionDoc = read('docs/store/account-deletion.md')
check('D5 the deletion description matches the app: the same path, the same page', [deletionDoc.includes('Settings → Profile & Account → Delete account'), deletionDoc.includes('/account-deletion'), code('app/account-deletion/page.tsx').includes('Settings, then Profile & Account, then Delete account')], [true, true, true])

const total = passed + failures.length
if (failures.length) {
  console.log(`\nPrivacy readiness: ${passed}/${total} PASS, ${failures.length} FAILED\n`)
  for (const failure of failures) console.log('  FAIL ' + failure)
  process.exit(1)
}
console.log(`\nPrivacy readiness: ${passed}/${total} PASS`)
