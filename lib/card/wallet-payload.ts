import type { SupabaseClient } from '@supabase/supabase-js'
import { CARD_PUBLIC_BASE } from '@/lib/card/types'
import type { WalletProvider } from '@/lib/card/wallet'

/**
 * The one shape both wallets are built from.
 *
 * Apple and Google disagree about almost everything — field names, image
 * hosting, how a barcode is declared, what an identifier may contain — so the
 * temptation is to let each provider read the profile row for itself. That is
 * how the two drift: a field added for one, a slug normalized differently by
 * the other, and eventually two passes claiming to be the same card. Both
 * providers consume this and nothing else.
 *
 * Note what is absent: the loader takes a user id and no card address. There
 * is no argument here that a caller could use to ask for somebody else's card,
 * which is a stronger guarantee than checking that they didn't.
 */

export type WalletCardPayload = {
  /** Stable card identity. Today `abc_profiles.id`; never the slug. */
  cardId: string
  slug: string
  fullName: string
  jobTitle: string | null
  companyName: string | null
  /** The permanent public address, with no tracking parameter. */
  publicUrl: string
}

/**
 * The `?src=` marker each wallet's barcode carries, so a scan is attributable
 * to the pass it came from. Both values are in the `card_views` allowlist.
 */
export const WALLET_QR_SOURCE: Record<WalletProvider, string> = {
  apple: 'wallet_apple',
  google: 'wallet_google',
}

/**
 * The provider-facing name for a card.
 *
 * Deliberately derived from `cardId`, not from the slug: the slug is an
 * editable field, and a pass already sitting in somebody's phone cannot be
 * renamed. Deriving identity from a mutable field would mean the day an owner
 * tidies their card address, their existing pass stops being the same pass —
 * Apple would treat the next one as a second pass rather than a replacement,
 * and Google would create a second object.
 *
 * The prefix keeps room for a card entity that is not a profile row. Today
 * every account has exactly one card and `cardId` is the profile id; when
 * cards become their own rows their ids land in the same namespace without
 * colliding with the identifiers already issued.
 */
export function walletCardIdentity(cardId: string): string {
  return `card-${cardId}`
}

/** Apple: unique per pass type identifier. */
export function appleSerialNumber(payload: WalletCardPayload): string {
  return walletCardIdentity(payload.cardId)
}

/** Google: the suffix after `<issuerId>.` — alphanumerics, `.`, `_`, `-` only. */
export function googleObjectSuffix(payload: WalletCardPayload): string {
  return walletCardIdentity(payload.cardId)
}

/** The barcode payload: the permanent card URL plus a provider marker. */
export function walletQrUrl(payload: WalletCardPayload, provider: WalletProvider): string {
  return `${payload.publicUrl}?src=${WALLET_QR_SOURCE[provider]}`
}

/** One line of role and company, for whichever provider wants them joined. */
export function walletSubtitle(payload: WalletCardPayload): string | null {
  const parts = [payload.jobTitle, payload.companyName].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

export type WalletPayloadResult =
  | { ok: true; payload: WalletCardPayload }
  | { ok: false; reason: 'no_profile' | 'not_published' | 'no_slug' }

function asTrimmed(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Loads the caller's own card. The `userId` must come from a verified session —
 * never from a route parameter, a request body or a query string.
 */
export async function loadOwnWalletPayload(
  supabase: SupabaseClient,
  userId: string
): Promise<WalletPayloadResult> {
  const { data: profile, error } = await supabase
    .from('abc_profiles')
    .select('id, card_slug, card_published, full_name, role, company')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('[card/wallet-payload] profile load failed:', error)
    return { ok: false, reason: 'no_profile' }
  }
  if (!profile) return { ok: false, reason: 'no_profile' }
  if (!profile.card_published) return { ok: false, reason: 'not_published' }

  const slug = asTrimmed(profile.card_slug)?.toLowerCase()
  if (!slug) return { ok: false, reason: 'no_slug' }

  return {
    ok: true,
    payload: {
      cardId: profile.id as string,
      slug,
      /*
        A pass with a blank title is worse than one naming the account, and
        `full_name` is optional on the profile row.
      */
      fullName: asTrimmed(profile.full_name) ?? 'ABC Card',
      jobTitle: asTrimmed(profile.role),
      companyName: asTrimmed(profile.company),
      publicUrl: `${CARD_PUBLIC_BASE}/${slug}`,
    },
  }
}
