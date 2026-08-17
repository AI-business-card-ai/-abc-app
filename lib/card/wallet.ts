/**
 * Wallet capability detection.
 *
 * Neither Apple nor Google Wallet has any infrastructure in this repository:
 * no pass signing, no certificates, no issuer account, no service account. A
 * pass cannot be produced by writing more application code alone — both
 * require credentials issued by Apple and Google.
 *
 * So the capability is derived from configuration rather than assumed. The
 * public card asks these functions whether a wallet action can do anything,
 * and presents it honestly when it cannot. Nothing here fabricates a pass, and
 * neither wallet action ever falls back to downloading a vCard.
 */

export type WalletProvider = 'apple' | 'google'

export type WalletCapability = {
  configured: boolean
  /** Environment variables still required before a real pass can be issued. */
  missing: string[]
}

export type WalletCapabilities = Record<WalletProvider, WalletCapability>

/** Signing a .pkpass needs the certificate chain plus the pass/team identifiers. */
const APPLE_REQUIRED = [
  'APPLE_PASS_TYPE_IDENTIFIER',
  'APPLE_TEAM_IDENTIFIER',
  'APPLE_PASS_CERTIFICATE',
  'APPLE_PASS_CERTIFICATE_PASSWORD',
  'APPLE_WWDR_CERTIFICATE',
] as const

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

export const WALLET_REQUIREMENTS: Record<WalletProvider, readonly string[]> = {
  apple: APPLE_REQUIRED,
  google: GOOGLE_REQUIRED,
}
