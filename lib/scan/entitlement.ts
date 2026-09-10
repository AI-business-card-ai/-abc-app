import type { SupabaseClient } from '@supabase/supabase-js'
import { getScanLimitForPlan, isScanLimitExempt } from '@/lib/scan-limits'

/**
 * Whether this owner may read another business card, and the one place that
 * question is answered.
 *
 * The commercial model is moving from plan tiers to prepaid Smart Scan credits
 * that never expire, and the ledger behind that does not exist yet. So the
 * shape here is the shape of the destination — a balance and a way to spend it
 * — while the implementation still reads the plan counters that ship today.
 * When the ledger lands, `readScanEntitlement` and `consumeScanCredits` are the
 * two functions that change, and nothing in the multi-card flow moves.
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

export type ScanEntitlement = {
  /** Cards this owner may still keep. `Infinity` when unmetered. */
  available: number
  /** True when no counting applies — internal plans and exempt accounts. */
  unmetered: boolean
}

export function readScanEntitlement(profile: EntitlementProfile): ScanEntitlement {
  if (isScanLimitExempt(profile)) return { available: Infinity, unmetered: true }

  const limit = getScanLimitForPlan(profile.plan)
  if (!Number.isFinite(limit)) return { available: Infinity, unmetered: true }

  const used = profile.scans_used ?? 0
  return { available: Math.max(0, limit - used), unmetered: false }
}

export function hasScanCredits(profile: EntitlementProfile): boolean {
  return readScanEntitlement(profile).available > 0
}

/**
 * Spend credits for cards the owner actually kept.
 *
 * Called once, after the contacts exist, with the number that were created.
 * That ordering is what makes the charge honest: a card the model imagined, a
 * card that failed to save, and a card the owner unticked all cost nothing,
 * because none of them produced a person.
 *
 * Idempotent by virtue of its caller rather than by a marker of its own. The
 * save path only ever reports items that transitioned from "no contact" to
 * "contact", and that transition is recorded on the item — so a retry after a
 * partial failure charges for the cards it completes on that attempt and never
 * again for the ones already done.
 */
export async function consumeScanCredits(
  supabase: SupabaseClient,
  profile: EntitlementProfile & { id: string },
  count: number
): Promise<void> {
  if (count <= 0) return
  if (isScanLimitExempt(profile)) return

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
