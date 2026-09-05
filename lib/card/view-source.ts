/**
 * What a public card view is allowed to say about where it came from.
 *
 * `card_views.source` is written from the `?src=` parameter on `/d/[slug]`,
 * which is an unauthenticated page. Until now whatever arrived in that
 * parameter was stored as it came: the column was free text under the control
 * of whoever composed the link, with no bound on length and no guarantee that
 * a value in there had ever been minted by ABC. Anyone linking to a card could
 * write a row of their own choosing into the owner's analytics.
 *
 * An allowlist rather than escaping or a length cap, because the set of real
 * sources is small, known and closed — every one of them is produced by code
 * in this repository. A value ABC did not mint is not a source at all, and the
 * honest record of it is `null`: exactly what is already stored for a visitor
 * who arrives with no marker.
 */

export const CARD_VIEW_SOURCES = [
  /** Server-rendered QR endpoint, and the share link the QR modal copies. */
  'qr',
  /** Contact file downloaded from the public card. */
  'vcard',
  /** Resolved through the in-app scanner. */
  'scan',
  /** Barcode on the owner's Apple Wallet pass. */
  'wallet_apple',
  /** Barcode on the owner's Google Wallet pass. */
  'wallet_google',
] as const

export type CardViewSource = (typeof CARD_VIEW_SOURCES)[number]

/**
 * Long enough for every value above with room to spare, short enough that a
 * megabyte of query string is rejected before it is normalized rather than
 * after. The check is on the raw input for that reason.
 */
const MAX_SOURCE_LENGTH = 32

export function sanitizeCardViewSource(raw: unknown): CardViewSource | null {
  if (typeof raw !== 'string') return null
  if (raw.length > MAX_SOURCE_LENGTH) return null

  const value = raw.trim().toLowerCase()
  return (CARD_VIEW_SOURCES as readonly string[]).includes(value)
    ? (value as CardViewSource)
    : null
}
