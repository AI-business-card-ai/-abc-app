/**
 * Wallet capability detection.
 *
 * A pass cannot be produced by writing more application code alone: Apple's
 * needs a signing certificate issued against a registered pass type
 * identifier, and Google's needs an issuer account and a service-account key.
 * So the capability is derived from configuration rather than assumed, and the
 * owner's card presents the action honestly when the configuration is absent.
 * Nothing here fabricates a pass, and no wallet action falls back to a vCard.
 *
 * Everything in this file reads `process.env`. The booleans it derives may
 * cross to the client; the names and values behind them may not.
 */

export type WalletProvider = 'apple' | 'google'

export type WalletCapability = {
  configured: boolean
  /** Environment variables still required before a real pass can be issued. */
  missing: string[]
}

export type WalletCapabilities = Record<WalletProvider, WalletCapability>

/**
 * Signing a .pkpass needs the certificate chain plus the pass and team
 * identifiers.
 *
 * `passkit-generator` assembles the PKCS #7 detached signature from three
 * separate PEMs — the WWDR intermediate, the pass certificate, and that
 * certificate's private key. There is no PKCS#12 input. So the certificate and
 * the key are two variables rather than one: naming a private key
 * `..._CERTIFICATE` would be a contract that disagrees with the only library
 * that reads it.
 */
const APPLE_REQUIRED = [
  'APPLE_PASS_TYPE_IDENTIFIER',
  'APPLE_TEAM_IDENTIFIER',
  'APPLE_PASS_CERTIFICATE',
  'APPLE_PASS_PRIVATE_KEY',
  'APPLE_WWDR_CERTIFICATE',
] as const

/**
 * Deliberately not in the required list.
 *
 * The passphrase belongs to the private key, not to the certificate, and only
 * exists if the key was exported encrypted. Both are legitimate: the usual
 * `openssl pkcs12 -nocerts` route demands a passphrase, while `-nodes`
 * produces a key with none. Requiring it would make the second case
 * unconfigurable and tempt somebody into inventing a value, which then fails
 * at signing time on a key that has no passphrase to check it against.
 */
export const APPLE_OPTIONAL = ['APPLE_PASS_PRIVATE_KEY_PASSPHRASE'] as const

/** A Google Wallet object is a JWT signed by an issuer's service account. */
const GOOGLE_REQUIRED = [
  'GOOGLE_WALLET_ISSUER_ID',
  'GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_WALLET_SERVICE_ACCOUNT_KEY',
  'GOOGLE_WALLET_CLASS_ID',
] as const

function check(required: readonly string[]): WalletCapability {
  const missing = required.filter((key) => !process.env[key]?.trim())
  return { configured: missing.length === 0, missing }
}

/** Server-only: reads process.env, so never call this from a client component. */
export function walletCapabilities(): WalletCapabilities {
  return { apple: check(APPLE_REQUIRED), google: check(GOOGLE_REQUIRED) }
}

export type WalletAvailability = Record<WalletProvider, boolean>

/**
 * The half that is safe to render with.
 *
 * A separate function from `walletCapabilities` on purpose: the owner's screen
 * needs to choose between a live action and an honest disabled one, and
 * nothing more. Passing the full capability object into a component would put
 * the configuration names one careless prop-spread away from the client.
 */
export function walletAvailability(): WalletAvailability {
  const capabilities = walletCapabilities()
  return { apple: capabilities.apple.configured, google: capabilities.google.configured }
}

export const WALLET_REQUIREMENTS: Record<WalletProvider, readonly string[]> = {
  apple: APPLE_REQUIRED,
  google: GOOGLE_REQUIRED,
}
