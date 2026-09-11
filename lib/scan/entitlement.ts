import type { SupabaseClient } from '@supabase/supabase-js'
import {
  FOUNDER_EMAILS,
  getScanLimitForPlan,
  isScanLimitExempt,
  normalizeEmail,
} from '@/lib/scan-limits'

/**
 * Whether this owner may read another business card, and the one place that
 * question is answered.
 *
 * The commercial model is moving from plan tiers to prepaid Smart Scan credits
 * that never expire, and the ledger behind that does not exist yet. So the
 * shape here is the shape of the destination — a balance and a way to spend it
 * — while the implementation still reads the plan counters that ship today.
 * When the ledger lands, `readScanEntitlement` and `consumeScanCredits` are the
 * two functions that change, and neither scan flow moves.
 *
 * That indirection is the entire point. Multi-card previously asked
 * `getScanLimitForPlan(profile.plan)` directly, which hard-codes "free gets 3"
 * into a batch feature that should only ever ask "how many cards may I keep".
 */

/** Enough of `abc_profiles` to answer the question. */
export type EntitlementProfile = {
  plan?: string | null
  email?: string | null
  google_email?: string | null
  scans_used?: number | null
}

/**
 * The signed-in person, exactly as Supabase Auth reports them.
 *
 * Always the `user` returned by `supabase.auth.getUser()` on the server, which
 * validates the session with Supabase rather than trusting what the cookie
 * claims. Never assembled from a request body, a query string, a header, or a
 * profile row: those are all things a caller can influence, and the point of
 * this type is that nothing a caller sends can become one.
 */
export type AuthIdentity = {
  id: string
  email?: string | null
  email_confirmed_at?: string | null
  confirmed_at?: string | null
}

/**
 * Whether this is the founder account.
 *
 * Read from the verified auth identity rather than from `abc_profiles.email`,
 * which is a stored copy: it is safe today only because a column grant keeps it
 * out of the owner's reach, and a lifetime entitlement should not rest on one
 * migration staying correct. The auth email lives in Supabase's own schema,
 * which PostgREST does not expose for writing, and it cannot be moved to
 * another address without confirming from that inbox.
 *
 * A confirmed address is required. An unconfirmed email proves only that
 * somebody typed it, and "somebody typed the founder's address" must never be
 * the same thing as being the founder.
 */
export function isFounder(identity: AuthIdentity | null | undefined): boolean {
  if (!identity?.id) return false
  if (!identity.email_confirmed_at && !identity.confirmed_at) return false
  return (FOUNDER_EMAILS as readonly string[]).includes(normalizeEmail(identity.email))
}

export type ScanEntitlement = {
  /** Cards this owner may still keep. `Infinity` when unmetered. */
  available: number
  /** True when no counting applies — founder, internal plans, exempt accounts. */
  unmetered: boolean
  /** Lifetime internal access. Resolved from the auth identity only. */
  founder: boolean
  /**
   * ABC Pro capability.
   *
   * Only the founder resolves to Pro today. Nothing in the app gates on Pro
   * yet, and the paid Pro products — Event Pass, monthly, annual — arrive with
   * their own entitlement; mapping today's legacy plan names onto them here
   * would be a guess about a product that does not exist. This is the field
   * those checks should read when they are written.
   */
  pro: boolean
}

/**
 * The whole answer, for one signed-in person.
 *
 * `identity` is what makes founder access possible; without it the answer is
 * computed from the profile alone, exactly as before. Every route that scans
 * has the verified user in hand and passes it.
 */
export function readScanEntitlement(
  profile: EntitlementProfile,
  identity?: AuthIdentity | null
): ScanEntitlement {
  if (isFounder(identity)) {
    return { available: Infinity, unmetered: true, founder: true, pro: true }
  }

  if (isScanLimitExempt(profile)) {
    return { available: Infinity, unmetered: true, founder: false, pro: false }
  }

  const limit = getScanLimitForPlan(profile.plan)
  if (!Number.isFinite(limit)) {
    return { available: Infinity, unmetered: true, founder: false, pro: false }
  }

  const used = profile.scans_used ?? 0
  return { available: Math.max(0, limit - used), unmetered: false, founder: false, pro: false }
}

export function hasScanCredits(
  profile: EntitlementProfile,
  identity?: AuthIdentity | null
): boolean {
  return readScanEntitlement(profile, identity).available > 0
}

/**
 * Spend credits for cards the owner actually kept.
 *
 * Called once, after the cards are saved, with the number that were accepted.
 * That ordering is what makes the charge honest: a card the model imagined, a
 * card that failed to save, and a card the owner unticked all cost nothing,
 * because none of them was accepted.
 *
 * Unmetered accounts are never charged — the founder first, by identity, then
 * internal plans and exempt accounts. That is not merely "not blocked": the
 * counter itself does not move, so the founder's lifetime access cannot be
 * worn down into a balance by a later change to how limits are read.
 */
export async function consumeScanCredits(
  supabase: SupabaseClient,
  profile: EntitlementProfile & { id: string },
  count: number,
  identity?: AuthIdentity | null
): Promise<void> {
  if (count <= 0) return
  if (readScanEntitlement(profile, identity).unmetered) return

  const used = profile.scans_used ?? 0

  const { error } = await supabase
    .from('abc_profiles')
    .update({ scans_used: used + count })
    .eq('id', profile.id)

  if (error) {
    /*
      Logged, never thrown. The contacts exist by the time this runs, and
      failing the request now would tell the owner their cards were lost when
      they were not. An undercharge is recoverable; a phantom failure at a
      trade fair is not.
    */
    console.error('[scan/entitlement] credit consumption failed:', error)
  }
}
