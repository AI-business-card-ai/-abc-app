import { PKPass } from 'passkit-generator'
import type { WalletCardPayload } from '@/lib/card/wallet-payload'
import { appleSerialNumber, walletQrUrl } from '@/lib/card/wallet-payload'
import { APPLE_PASS_IMAGES } from '@/lib/card/wallet-apple-assets'

/**
 * The Apple Wallet pass.
 *
 * Static by design. A pass may name a web service and be pushed updates
 * through APNs, and that is a whole subsystem — device registration endpoints,
 * a push certificate, an update log — for a benefit this product does not
 * need. The barcode carries the permanent card address, so what a scanner
 * reaches is always the current card no matter how old the pass is. Only the
 * name, role and company printed on the face can age, and a pass whose printed
 * role is a year out of date still works.
 *
 * That is why `webServiceURL` and `authenticationToken` are absent rather than
 * empty: Apple treats their presence as a promise to serve updates.
 *
 * Server-only. The signing key is read here and must never reach a bundle that
 * ships to a browser.
 */

/**
 * Named for what `passkit-generator` actually consumes: a certificate, a
 * private key, and the WWDR intermediate, as three separate PEMs. The
 * passphrase is optional because it belongs to the key and only exists when
 * the key was exported encrypted.
 */
export type AppleWalletConfig = {
  passTypeIdentifier: string
  teamIdentifier: string
  signerCert: string
  signerKey: string
  signerKeyPassphrase?: string
  wwdr: string
}

export const APPLE_ORGANIZATION_NAME = 'ABC Card'

/** Near-black ground and gold label, matching the app and the public card. */
const BACKGROUND_COLOR = 'rgb(10, 10, 11)'
const FOREGROUND_COLOR = 'rgb(255, 255, 255)'
const LABEL_COLOR = 'rgb(217, 164, 65)'

/**
 * Reads the certificate material from the environment.
 *
 * Returns `null` rather than throwing when anything is missing, because a
 * deployment without Apple credentials is an expected state, not a fault — the
 * route turns that into an honest 501. Only a caller that has already checked
 * `walletCapabilities()` should reach this.
 */
export function readAppleWalletConfig(): AppleWalletConfig | null {
  const passTypeIdentifier = process.env.APPLE_PASS_TYPE_IDENTIFIER?.trim()
  const teamIdentifier = process.env.APPLE_TEAM_IDENTIFIER?.trim()
  const signerCert = process.env.APPLE_PASS_CERTIFICATE?.trim()
  const signerKey = process.env.APPLE_PASS_PRIVATE_KEY?.trim()
  const signerKeyPassphrase = process.env.APPLE_PASS_PRIVATE_KEY_PASSPHRASE?.trim()
  const wwdr = process.env.APPLE_WWDR_CERTIFICATE?.trim()

  if (!passTypeIdentifier || !teamIdentifier || !signerCert || !signerKey || !wwdr) {
    return null
  }

  return {
    passTypeIdentifier,
    teamIdentifier,
    signerCert: decodePem(signerCert),
    signerKey: decodePem(signerKey),
    /* Omitted rather than empty: an unencrypted key has no passphrase. */
    ...(signerKeyPassphrase ? { signerKeyPassphrase } : {}),
    wwdr: decodePem(wwdr),
  }
}

/**
 * Environment variables cannot hold newlines reliably across every dashboard
 * and CLI, so PEM material is conventionally stored base64-encoded. Accept
 * either: a value that already looks like PEM is passed through untouched.
 */
function decodePem(value: string): string {
  if (value.includes('-----BEGIN')) return value
  try {
    return Buffer.from(value, 'base64').toString('utf8')
  } catch {
    return value
  }
}

/**
 * Builds and signs the pass. Throws if the certificate material is rejected —
 * an unsigned or half-built pass is never returned.
 */
export async function buildApplePass(
  payload: WalletCardPayload,
  config: AppleWalletConfig
): Promise<Buffer> {
  const pass = new PKPass(
    { ...APPLE_PASS_IMAGES },
    {
      wwdr: config.wwdr,
      signerCert: config.signerCert,
      signerKey: config.signerKey,
      ...(config.signerKeyPassphrase
        ? { signerKeyPassphrase: config.signerKeyPassphrase }
        : {}),
    },
    {
      formatVersion: 1,
      passTypeIdentifier: config.passTypeIdentifier,
      teamIdentifier: config.teamIdentifier,
      serialNumber: appleSerialNumber(payload),
      organizationName: APPLE_ORGANIZATION_NAME,
      /* Read aloud by VoiceOver, so it names the thing rather than the brand. */
      description: `ABC Card — ${payload.fullName}`,
      backgroundColor: BACKGROUND_COLOR,
      foregroundColor: FOREGROUND_COLOR,
      labelColor: LABEL_COLOR,
    }
  )

  pass.type = 'generic'

  pass.primaryFields.push({
    key: 'name',
    label: 'NAME',
    value: payload.fullName,
  })

  /*
    Absent fields are omitted, never pushed as empty strings. Apple lays the
    pass out from the fields that exist, so an empty secondary field is not
    invisible — it is a labelled blank.
  */
  if (payload.jobTitle) {
    pass.secondaryFields.push({ key: 'role', label: 'ROLE', value: payload.jobTitle })
  }
  if (payload.companyName) {
    pass.secondaryFields.push({ key: 'company', label: 'COMPANY', value: payload.companyName })
  }

  pass.auxiliaryFields.push({
    key: 'card',
    label: 'CARD',
    value: shortPublicUrl(payload.publicUrl),
  })

  pass.backFields.push({
    key: 'url',
    label: 'Public card',
    value: payload.publicUrl,
  })

  /*
    The barcode is declared natively rather than drawn: Wallet renders it from
    the message, at whatever size and contrast the device needs, and it stays
    scannable with no network. Embedding our PNG endpoint would put a fetch
    between an owner and the one thing the pass exists to show.
  */
  pass.setBarcodes({
    format: 'PKBarcodeFormatQR',
    message: walletQrUrl(payload, 'apple'),
    messageEncoding: 'iso-8859-1',
    altText: shortPublicUrl(payload.publicUrl),
  })

  return pass.getAsBuffer()
}

/** `abccard.io/d/slug` — the address without the scheme, for a narrow field. */
function shortPublicUrl(publicUrl: string): string {
  return publicUrl.replace(/^https?:\/\//, '')
}

/**
 * A filename safe to put in a `Content-Disposition` header: the slug is owner
 * controlled, so anything outside this set is dropped rather than escaped.
 */
export function applePassFilename(payload: WalletCardPayload): string {
  const safeSlug = payload.slug.replace(/[^a-z0-9-]/gi, '').slice(0, 60)
  return safeSlug ? `abc-card-${safeSlug}.pkpass` : 'abc-card.pkpass'
}

export const APPLE_PASS_CONTENT_TYPE = 'application/vnd.apple.pkpass'
