/**
 * Wallet regression suite.
 *
 * Run with `npm run test:wallet` from the repository root.
 *
 * There is no test framework here, and this deliberately does not introduce
 * one: the repository's existing convention is a standalone TypeScript file
 * executed by `tsx` (see `scripts/setup-stripe.ts`), and a second toolchain
 * added for one feature is a cost every future contributor pays.
 *
 * Two kinds of assertion, mixed on purpose:
 *
 *   - Behavioural, where the code can be called. The owner-loading function is
 *     driven against a stub client, and the Google save token is signed for
 *     real with a throwaway key and decoded back.
 *   - Source-level, where it cannot. Whether a Wallet button exists on the
 *     public card is a fact about a React tree that only a browser could
 *     execute, so it is asserted against the file. Every such assertion runs
 *     against comment-stripped source, so a claim written in prose can never
 *     satisfy a test about code.
 *
 * What this protects is mostly negative: that the public card grows no Wallet
 * button, that no route ever accepts a card address from its caller, and that
 * provider identity never drifts onto the mutable slug. Those are the three
 * ways this feature would quietly become wrong.
 */
import fs from 'node:fs'
import path from 'node:path'
import { generateKeyPairSync } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

import { CARD_VIEW_SOURCES, sanitizeCardViewSource } from '@/lib/card/view-source'
import {
  appleSerialNumber,
  googleObjectSuffix,
  loadOwnWalletPayload,
  walletCardIdentity,
  walletQrUrl,
  walletSubtitle,
  WALLET_QR_SOURCE,
  type WalletCardPayload,
} from '@/lib/card/wallet-payload'
import {
  APPLE_OPTIONAL,
  WALLET_REQUIREMENTS,
  walletAvailability,
  walletCapabilities,
} from '@/lib/card/wallet'
import {
  APPLE_ORGANIZATION_NAME,
  APPLE_PASS_CONTENT_TYPE,
  applePassFilename,
  readAppleWalletConfig,
} from '@/lib/card/wallet-apple'
import { APPLE_PASS_IMAGES } from '@/lib/card/wallet-apple-assets'
import {
  buildGoogleObject,
  buildSaveJwt,
  googleObjectId,
  readGoogleWalletConfig,
  saveUrlFromJwt,
  GOOGLE_WALLET_ORIGIN,
  type GoogleWalletConfig,
} from '@/lib/card/wallet-google'

/* npm scripts run from the package root, which is what the reads below assume. */
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
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel))

/** Source with comments removed, so prose cannot satisfy a code assertion. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

/** PNG dimensions live in the IHDR at bytes 16..24. */
const pngSize = (buf: Buffer) => [buf.readUInt32BE(16), buf.readUInt32BE(20)]

const APPLE_ROUTE = 'app/api/card/wallet/apple/route.ts'
const GOOGLE_ROUTE = 'app/api/card/wallet/google/route.ts'

const appleRoute = code(APPLE_ROUTE)
const googleRoute = code(GOOGLE_ROUTE)
const appleLib = code('lib/card/wallet-apple.ts')
const googleLib = code('lib/card/wallet-google.ts')
const payloadLib = code('lib/card/wallet-payload.ts')
const cardView = code('components/card/DigitalCardView.tsx')
const publicClient = code('components/card/PublicCardClient.tsx')
const publicPage = code('app/d/[slug]/page.tsx')
const presentation = code('components/my-card/CardPresentationMode.tsx')
const myCard = code('components/my-card/MyCardView.tsx')
const dashboard = code('components/dashboard/MyCardCard.tsx')

const payload: WalletCardPayload = {
  cardId: '11111111-2222-3333-4444-555555555555',
  slug: 'david-bures',
  fullName: 'David Bures',
  jobTitle: 'Founder',
  companyName: 'ABC',
  publicUrl: 'https://abccard.io/d/david-bures',
}

/** Minimal stand-in for the single query `loadOwnWalletPayload` makes. */
function stubClient(row: Record<string, unknown> | null, capture?: { eq?: [string, unknown] }) {
  return {
    from() {
      return {
        select() {
          return {
            eq(column: string, value: unknown) {
              if (capture) capture.eq = [column, value]
              return { maybeSingle: async () => ({ data: row, error: null }) }
            },
          }
        },
      }
    },
  } as unknown as SupabaseClient
}

async function run() {
  // ───────────────────────────── SECURITY ─────────────────────────────

  check('1  old slug wallet route removed', exists('app/api/card/wallet/[provider]'), false)
  check('2a Apple route exists', exists(APPLE_ROUTE), true)
  check('2b Apple route names no slug', /\[slug\]|params\.slug|card\.slug/.test(appleRoute), false)
  check('3a Google route exists', exists(GOOGLE_ROUTE), true)
  check('3b Google route names no slug', /\[slug\]|params\.slug|card\.slug/.test(googleRoute), false)
  check('4a Apple route requires auth', appleRoute.includes('auth.getUser()'), true)
  check('4b Google route requires auth', googleRoute.includes('auth.getUser()'), true)
  check('4c Apple 401s an anonymous caller', /if \(!user\)[\s\S]{0,140}status: 401/.test(appleRoute), true)
  check('4d Google 401s an anonymous caller', /if \(!user\)[\s\S]{0,140}status: 401/.test(googleRoute), true)
  check('5a Apple derives the owner from the session', appleRoute.includes('loadOwnWalletPayload(supabase, user.id)'), true)
  check('5b Google derives the owner from the session', googleRoute.includes('loadOwnWalletPayload(supabase, user.id)'), true)

  const captured: { eq?: [string, unknown] } = {}
  const owned = await loadOwnWalletPayload(stubClient({
    id: payload.cardId,
    card_slug: 'David-Bures',
    card_published: true,
    full_name: 'David Bures',
    role: 'Founder',
    company: 'ABC',
  }, captured), payload.cardId)

  check('6a the profile query is keyed on id', captured.eq, ['id', payload.cardId])
  check('6b the loader never queries by slug', /eq\(['"]card_slug['"]/.test(payloadLib), false)
  check('6c a published owner resolves', owned.ok, true)
  check('6d the slug is normalized', owned.ok && owned.payload.slug, 'david-bures')

  const unpublished = await loadOwnWalletPayload(
    stubClient({ id: payload.cardId, card_slug: 'x', card_published: false }),
    payload.cardId
  )
  check('7  an unpublished card fails closed', unpublished, { ok: false, reason: 'not_published' })

  const noSlug = await loadOwnWalletPayload(
    stubClient({ id: payload.cardId, card_slug: null, card_published: true }),
    payload.cardId
  )
  check('8a a missing slug fails closed', noSlug, { ok: false, reason: 'no_slug' })

  const blankSlug = await loadOwnWalletPayload(
    stubClient({ id: payload.cardId, card_slug: '   ', card_published: true }),
    payload.cardId
  )
  check('8b a blank slug fails closed', blankSlug, { ok: false, reason: 'no_slug' })
  check('8c an absent profile fails closed', await loadOwnWalletPayload(stubClient(null), payload.cardId), {
    ok: false,
    reason: 'no_profile',
  })

  // 9. Nothing a caller sends can select a card: neither handler reads request
  //    input of any kind, and the loader takes no card address.
  const callerInput = /params|searchParams|nextUrl\.searchParams|req\.json\(\)|request\.json\(\)/
  check('9a Apple reads no caller input', callerInput.test(appleRoute), false)
  check('9b Google reads no caller input', callerInput.test(googleRoute), false)
  check('9c the loader accepts no slug argument', /loadOwnWalletPayload\([\s\S]{0,160}slug/.test(payloadLib), false)

  // 10. The env-name list sits behind both the session check and the card
  //     check, so an anonymous caller cannot probe this deployment's internals.
  for (const [name, src] of [['Apple', appleRoute], ['Google', googleRoute]] as const) {
    const authAt = src.indexOf('status: 401')
    const ownerAt = src.indexOf('loadOwnWalletPayload')
    const missingAt = src.indexOf('missing: capability.missing')
    check(`10a ${name}: the env list comes after the 401`, authAt > -1 && missingAt > authAt, true)
    check(`10b ${name}: the owner is resolved before configuration`, ownerAt > -1 && ownerAt < missingAt, true)
  }

  // 11. No secret is ever interpolated into a response.
  const secretNames = [
    'APPLE_PASS_CERTIFICATE',
    'APPLE_PASS_PRIVATE_KEY',
    'APPLE_PASS_PRIVATE_KEY_PASSPHRASE',
    'APPLE_WWDR_CERTIFICATE',
    'GOOGLE_WALLET_SERVICE_ACCOUNT_KEY',
  ]
  for (const src of [appleRoute, googleRoute, appleLib, googleLib]) {
    for (const name of secretNames) {
      check(
        `11a ${name} never reaches a response body`,
        new RegExp(`(NextResponse|error|message|json)[^\\n]*${name}`).test(src),
        false
      )
    }
  }
  check('11b google failures log a status, not a body', googleLib.includes('res.status'), true)

  // ───────────────────────────── PAYLOAD ─────────────────────────────

  check('12 the stable card id is the profile id', walletCardIdentity(payload.cardId), `card-${payload.cardId}`)
  check('13 the apple serial is not the slug', appleSerialNumber(payload).includes(payload.slug), false)
  check('14 the google suffix is not the slug', googleObjectSuffix(payload).includes(payload.slug), false)
  const renamed = { ...payload, slug: 'renamed-address', jobTitle: null }
  check('15a a slug rename leaves the apple serial alone', appleSerialNumber(renamed), appleSerialNumber(payload))
  check('15b a slug rename leaves the google object alone', googleObjectSuffix(renamed), googleObjectSuffix(payload))
  check('15c identity derives from the card id only', /walletCardIdentity\(cardId: string\)[\s\S]{0,80}card-\$\{cardId\}/.test(payloadLib), true)
  check('15d role and company join into one subtitle', walletSubtitle(payload), 'Founder · ABC')
  check('15e an empty subtitle is null, not blank', walletSubtitle({ ...payload, jobTitle: null, companyName: null }), null)

  // ────────────────────── SOURCE SANITIZATION ──────────────────────

  check('16 qr allowed', sanitizeCardViewSource('qr'), 'qr')
  check('17 vcard allowed', sanitizeCardViewSource('vcard'), 'vcard')
  check('18 scan allowed', sanitizeCardViewSource('scan'), 'scan')
  check('19 wallet_apple allowed', sanitizeCardViewSource('wallet_apple'), 'wallet_apple')
  check('20 wallet_google allowed', sanitizeCardViewSource('wallet_google'), 'wallet_google')
  check('20a the allowlist is exactly the five real sources', [...CARD_VIEW_SOURCES].sort(), [
    'qr',
    'scan',
    'vcard',
    'wallet_apple',
    'wallet_google',
  ])
  check('21a an invented source is dropped', sanitizeCardViewSource('drop-table'), null)
  check('21b markup is dropped', sanitizeCardViewSource('<script>'), null)
  check('21c a non-string is dropped', sanitizeCardViewSource({ a: 1 }), null)
  check('21d undefined is dropped', sanitizeCardViewSource(undefined), null)
  check('22a an oversized value is dropped', sanitizeCardViewSource('q'.repeat(5000)), null)
  check('22b an oversized value with a real prefix is dropped', sanitizeCardViewSource(`qr${'x'.repeat(500)}`), null)
  check('22c the public card sanitizes before recording', publicPage.includes('sanitizeCardViewSource(searchParams?.src)'), true)
  check('22d the raw parameter no longer reaches the insert', /searchParams\?\.src \|\| null/.test(publicPage), false)

  // ───────────────────────────── APPLE ─────────────────────────────

  check('23 the pass is a generic pass', appleLib.includes("pass.type = 'generic'"), true)
  check('24 formatVersion is 1', appleLib.includes('formatVersion: 1'), true)
  check('25a passkit-generator is the signer', appleLib.includes("from 'passkit-generator'"), true)
  check('25b a PKPass is constructed', appleLib.includes('new PKPass('), true)
  check('25c the signature is not hand-rolled', /pkcs7|createSignedData|manifest\.json/.test(appleLib), false)
  check('26 the pass carries no update-service plumbing', /apns|pushToken|registerDevice/i.test(appleLib), false)
  check('27 no webServiceURL', appleLib.includes('webServiceURL'), false)
  check('28 no authenticationToken', appleLib.includes('authenticationToken'), false)
  check('29a the barcode is declared natively', appleLib.includes("format: 'PKBarcodeFormatQR'"), true)
  check('29b messageEncoding is set', appleLib.includes("messageEncoding: 'iso-8859-1'"), true)
  check('29c our PNG endpoint is not embedded', appleLib.includes('/api/card/qr'), false)
  check('30a the apple barcode url', walletQrUrl(payload, 'apple'), 'https://abccard.io/d/david-bures?src=wallet_apple')
  check('30b the apple marker is in the allowlist', sanitizeCardViewSource(WALLET_QR_SOURCE.apple), 'wallet_apple')
  check('31a an absent role is omitted', appleLib.includes('if (payload.jobTitle) {'), true)
  check('31b an absent company is omitted', appleLib.includes('if (payload.companyName) {'), true)
  check('31c no field is emitted with an empty value', /value: ['"]{2}/.test(appleLib), false)

  // 32-33. Apple's Human Interface Guidelines put the pass icon at 38pt square
  //        and the logo in a 160x50pt box. The archived guide's 29pt is stale.
  check('32a icon.png is 38x38', pngSize(APPLE_PASS_IMAGES['icon.png']), [38, 38])
  check('32b icon@2x.png is 76x76', pngSize(APPLE_PASS_IMAGES['icon@2x.png']), [76, 76])
  check('32c icon@3x.png is 114x114', pngSize(APPLE_PASS_IMAGES['icon@3x.png']), [114, 114])
  check('32d the icons are square', pngSize(APPLE_PASS_IMAGES['icon.png'])[0] === pngSize(APPLE_PASS_IMAGES['icon.png'])[1], true)
  check('32e the obsolete 29pt icon is gone', pngSize(APPLE_PASS_IMAGES['icon.png'])[0] === 29, false)
  check('33a logo.png is 160x50', pngSize(APPLE_PASS_IMAGES['logo.png']), [160, 50])
  check('33b logo@2x.png is 320x100', pngSize(APPLE_PASS_IMAGES['logo@2x.png']), [320, 100])
  check('33c logo@3x.png is 480x150', pngSize(APPLE_PASS_IMAGES['logo@3x.png']), [480, 150])

  check('34a exactly the six expected files', Object.keys(APPLE_PASS_IMAGES).sort(), [
    'icon.png',
    'icon@2x.png',
    'icon@3x.png',
    'logo.png',
    'logo@2x.png',
    'logo@3x.png',
  ])
  for (const [name, buf] of Object.entries(APPLE_PASS_IMAGES)) {
    check(`34b ${name} is a real PNG`, buf.subarray(1, 4).toString('ascii'), 'PNG')
  }
  check('34c the images are handed to PKPass', /new PKPass\(\s*\{ \.\.\.APPLE_PASS_IMAGES \}/.test(appleLib), true)
  check('34d the google logo is committed', exists('public/wallet/abc-wallet-logo.png'), true)

  check('35a the apple route pins the node runtime', appleRoute.includes("export const runtime = 'nodejs'"), true)
  check('35b the google route pins the node runtime', googleRoute.includes("export const runtime = 'nodejs'"), true)
  check('36a the pkpass MIME type', APPLE_PASS_CONTENT_TYPE, 'application/vnd.apple.pkpass')
  check('36b the route sends that MIME type', appleRoute.includes('APPLE_PASS_CONTENT_TYPE'), true)
  check('36c the pass is sent as an attachment', appleRoute.includes('Content-Disposition'), true)
  check('36d the filename is sanitized', applePassFilename({ ...payload, slug: '../../etc/passwd' }), 'abc-card-etcpasswd.pkpass')
  check('36e the organization name', APPLE_ORGANIZATION_NAME, 'ABC Card')

  check('37a an unconfigured deployment 501s', /not_configured[\s\S]{0,220}status: 501/.test(appleRoute), true)
  check('37b google does the same', /not_configured[\s\S]{0,220}status: 501/.test(googleRoute), true)
  check('37c nothing ever falls back to a vCard', /vcard/i.test(appleRoute + googleRoute + appleLib + googleLib), false)

  // 38-39. The certificate contract matches what passkit-generator consumes:
  //        three separate PEMs, with the passphrase belonging to the key.
  check('38a the required apple names', [...WALLET_REQUIREMENTS.apple].sort(), [
    'APPLE_PASS_CERTIFICATE',
    'APPLE_PASS_PRIVATE_KEY',
    'APPLE_PASS_TYPE_IDENTIFIER',
    'APPLE_TEAM_IDENTIFIER',
    'APPLE_WWDR_CERTIFICATE',
  ])
  check('38b the passphrase is optional', [...APPLE_OPTIONAL], ['APPLE_PASS_PRIVATE_KEY_PASSPHRASE'])
  check('38c the passphrase is not required', WALLET_REQUIREMENTS.apple.includes('APPLE_PASS_PRIVATE_KEY_PASSPHRASE' as never), false)
  check('38d it is omitted rather than blank', appleLib.includes('...(signerKeyPassphrase ? { signerKeyPassphrase } : {})'), true)
  check('39 the obsolete certificate-password name is gone', /APPLE_PASS_CERTIFICATE_PASSWORD/.test(code('lib/card/wallet.ts') + appleLib), false)

  // ───────────────────────────── GOOGLE ─────────────────────────────

  const gConfig: GoogleWalletConfig = {
    issuerId: '3388000000022125777',
    serviceAccountEmail: 'abc@abc.iam.gserviceaccount.com',
    serviceAccountKey: 'replaced-below',
    classId: '3388000000022125777.abc_card_v1',
  }
  const gObject = buildGoogleObject(payload, gConfig)

  check('40a the class id is deterministic', gObject.classId, '3388000000022125777.abc_card_v1')
  check('40b one class serves the whole product', googleLib.includes('body: { id: config.classId }'), true)
  check('40c the class is not per-owner', /classId: `\$\{config\.issuerId\}\.\$\{payload/.test(googleLib), false)
  check('41a the object id is deterministic', googleObjectId(payload, gConfig), `3388000000022125777.card-${payload.cardId}`)
  check('41b the object id survives a slug rename', googleObjectId(renamed, gConfig), googleObjectId(payload, gConfig))
  check('41c the object id uses a legal charset', /^[A-Za-z0-9._-]+$/.test(gObject.id), true)
  check('42a cardTitle is a LocalizedString', gObject.cardTitle, { defaultValue: { language: 'en-US', value: 'ABC Card' } })
  check('42b header carries the person', gObject.header, { defaultValue: { language: 'en-US', value: 'David Bures' } })
  check('42c subheader is a LocalizedString', gObject.subheader, { defaultValue: { language: 'en-US', value: 'Founder · ABC' } })
  check('42d an empty subheader is omitted', Object.prototype.hasOwnProperty.call(buildGoogleObject({ ...payload, jobTitle: null, companyName: null }, gConfig), 'subheader'), false)
  check('43a the barcode is native', gObject.barcode.type, 'QR_CODE')
  check('43b our PNG endpoint is not embedded', googleLib.includes('/api/card/qr'), false)
  check('44a the google barcode url', gObject.barcode.value, 'https://abccard.io/d/david-bures?src=wallet_google')
  check('44b the google marker is in the allowlist', sanitizeCardViewSource(WALLET_QR_SOURCE.google), 'wallet_google')
  check('45a the public card link is present', gObject.linksModuleData.uris[0].uri, payload.publicUrl)
  check('45b that link carries no tracking marker', gObject.linksModuleData.uris[0].uri.includes('?src='), false)
  check('45c the pass ground is near-black', gObject.hexBackgroundColor, '#0a0a0b')
  check('45d the logo is served by us over https', gObject.logo.sourceUri.uri.startsWith('https://abccard.io/'), true)

  // 46. The service-account key is read on the server and never shipped.
  for (const file of [
    'components/my-card/MyCardView.tsx',
    'components/dashboard/MyCardCard.tsx',
    'components/card/DigitalCardView.tsx',
    'components/card/PublicCardClient.tsx',
  ]) {
    check(`46 ${file} holds no wallet configuration`, /APPLE_PASS_|GOOGLE_WALLET_|process\.env/.test(read(file)), false)
  }

  // 47-51. Sign a real token with a throwaway key and read it back.
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  const jwt = buildSaveJwt(payload, { ...gConfig, serviceAccountKey: privateKey as string })
  const [rawHeader, rawBody] = jwt.split('.')
  const header = JSON.parse(Buffer.from(rawHeader, 'base64url').toString())
  const body = JSON.parse(Buffer.from(rawBody, 'base64url').toString())

  check('47a the save token is RS256', header.alg, 'RS256')
  check('47b the header type is JWT', header.typ, 'JWT')
  check('47c the token has three parts', jwt.split('.').length, 3)
  check('47d the issuer is the service account', body.iss, gConfig.serviceAccountEmail)
  check('47e iat is a server timestamp', typeof body.iat, 'number')
  check('48 the audience is google', body.aud, 'google')
  check('49 the token type is savetowallet', body.typ, 'savetowallet')
  check('50a origins names our site', body.origins, ['https://abccard.io'])
  check('50b the origin constant', GOOGLE_WALLET_ORIGIN, 'https://abccard.io')
  check('51a the payload is a thin reference', body.payload, { genericObjects: [{ id: googleObjectId(payload, gConfig) }] })
  check('51b no object is inlined in the token', JSON.stringify(body).includes('cardTitle'), false)
  check('51c the save link stays under the 1800-character limit', saveUrlFromJwt(jwt).length < 1800, true)

  check('52a the class is read before it is created', googleLib.indexOf("method: 'GET'") < googleLib.indexOf("'/genericClass'"), true)
  check('52b a concurrent class create is tolerated', googleLib.includes('created.status !== 409'), true)
  check('52c an existing class is left alone', /if \(existing\.ok\) return/.test(googleLib), true)
  check('53a an existing object is patched', googleLib.includes("method: 'PATCH'"), true)
  check('53b an object is created only when absent', googleLib.includes('existing.status === 404'), true)
  check('54a no save url without configuration', googleRoute.includes('readGoogleWalletConfig()'), true)
  check('54b the object is written before the redirect', googleRoute.indexOf('createGoogleSaveUrl') < googleRoute.indexOf('NextResponse.redirect'), true)

  // ───────────────────────────── UI ─────────────────────────────

  check('55 the public card offers no Apple Wallet action', /Apple Wallet/.test(cardView), false)
  check('56 the public card offers no Google Wallet action', /Google Wallet/.test(cardView), false)
  check('57 the hero layout has no wallet row', /IconBrandApple|IconBrandGoogle/.test(cardView), false)
  check('58a the non-hero layout has no wallet button', cardView.includes('WalletButton'), false)
  check('58b the public card calls no wallet route', cardView.includes('/api/card/wallet'), false)
  check('58c the renderer takes no wallet prop', /wallet[?]?:/.test(cardView), false)
  check('59a PublicCardClient mentions no wallet', /wallet/i.test(publicClient), false)
  check('59b PublicCardClient passes no wallet prop', publicClient.includes('wallet={'), false)
  check('60a the public page computes no capability', publicPage.includes('walletCapabilities'), false)
  check('60b the public page imports no wallet module', /from '@\/lib\/card\/wallet'/.test(publicPage), false)
  check('61a presentation offers no wallet action', /Wallet/i.test(presentation), false)
  check('61b presentation still renders the card inert', presentation.includes('InertContent'), true)
  check('62a My Card offers an Apple action', myCard.includes('label="Add to Apple Wallet"'), true)
  check('62b it points at the owner-only route', myCard.includes('href="/api/card/wallet/apple"'), true)
  check('63a My Card offers a Google action', myCard.includes('label="Add to Google Wallet"'), true)
  check('63b it points at the owner-only route', myCard.includes('href="/api/card/wallet/google"'), true)
  check('63c neither action carries a slug', /wallet\/(apple|google)\/\$\{/.test(myCard), false)
  check('64a an unavailable action is non-interactive', myCard.includes('aria-disabled="true"'), true)
  check('64b availability needs configuration and a published card', myCard.includes('available={wallet.apple && live}'), true)
  check('64c google is gated the same way', myCard.includes('available={wallet.google && live}'), true)
  check('65  the wallet section has a stable anchor', myCard.includes('id="wallet"'), true)
  check('66a the dashboard tile links to that anchor', dashboard.includes('href="/my-card#wallet"'), true)
  check('66b the dashboard duplicates no provider logic', dashboard.includes('/api/card/wallet'), false)

  // 67. Generating a pass is not proof that anybody saved it.
  const claim = /Added to (Apple|Google) Wallet|Saved to Wallet|Pass added|["'>]\s*(Added|Saved|Connected)\s*[<"']/
  for (const [name, src] of [
    ['My Card', myCard],
    ['dashboard', dashboard],
    ['apple route', appleRoute],
    ['google route', googleRoute],
  ] as const) {
    check(`67 ${name} claims no completed save`, claim.test(src), false)
  }

  // ───────────────── CAPABILITY: NAMES OUT, VALUES NEVER ─────────────────

  const CONFIG_KEYS = [...WALLET_REQUIREMENTS.apple, ...WALLET_REQUIREMENTS.google]
  for (const key of CONFIG_KEYS) delete process.env[key]
  delete process.env.APPLE_PASS_PRIVATE_KEY_PASSPHRASE

  check('68a apple reads as unconfigured', walletCapabilities().apple.configured, false)
  check('68b google reads as unconfigured', walletCapabilities().google.configured, false)
  check('68c the apple missing list is exactly the required names', walletCapabilities().apple.missing, [...WALLET_REQUIREMENTS.apple])
  check('68d the google missing list is exactly the required names', walletCapabilities().google.missing, [...WALLET_REQUIREMENTS.google])
  check('68e no apple config can be read', readAppleWalletConfig(), null)
  check('68f no google config can be read', readGoogleWalletConfig(), null)
  check('68g availability is false on both', walletAvailability(), { apple: false, google: false })

  const FAKE = 'FAKE-VALUE-THAT-MUST-NEVER-BE-EXPOSED'
  for (const key of CONFIG_KEYS) process.env[key] = FAKE
  process.env.APPLE_PASS_PRIVATE_KEY_PASSPHRASE = FAKE

  check('69a apple reads as configured', walletCapabilities().apple.configured, true)
  check('69b google reads as configured', walletCapabilities().google.configured, true)
  check('69c the capability object exposes no value', JSON.stringify(walletCapabilities()).includes(FAKE), false)
  check('69d availability exposes no value', JSON.stringify(walletAvailability()).includes(FAKE), false)
  check('69e availability is booleans only', walletAvailability(), { apple: true, google: true })

  delete process.env.APPLE_PASS_PRIVATE_KEY_PASSPHRASE
  const withoutPassphrase = readAppleWalletConfig()
  check('70a a key with no passphrase still configures', withoutPassphrase !== null, true)
  check('70b the passphrase key is absent, not blank', withoutPassphrase && Object.prototype.hasOwnProperty.call(withoutPassphrase, 'signerKeyPassphrase'), false)
  process.env.APPLE_PASS_PRIVATE_KEY_PASSPHRASE = 'pw'
  check('70c a passphrase is carried when set', readAppleWalletConfig()?.signerKeyPassphrase, 'pw')

  const total = passed + failures.length
  if (failures.length) {
    console.log(`\nWallet: ${passed}/${total} PASS, ${failures.length} FAILED\n`)
    for (const failure of failures) console.log('  FAIL ' + failure)
    process.exit(1)
  }
  console.log(`\nWallet: ${passed}/${total} PASS`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
