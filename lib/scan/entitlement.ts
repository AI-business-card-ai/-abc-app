import type { SupabaseClient } from '@supabase/supabase-js'
import {
  FOUNDER_EMAILS,
  getScanLimitForPlan,
  isScanLimitExempt,
  normalizeEmail,
} from '@/lib/scan-limits'
import {
  consumeScanCredit,
  ensureLegacyOpeningBalance,
  getScanCreditBalance,
  ledgerEnabled,
  type ConsumeOutcome,
} from '@/lib/billing/ledger'

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
   * Founder Pro, as the scanner sees it.
   *
   * True only for the founder. Paid ABC Pro — Event Pass, monthly, annual — is
   * resolved by `resolveProEntitlement` in `lib/entitlements`, which every Pro gate
   * reads. Scanning never asks about Pro: Smart Scan is credits for everybody,
   * and Pro is not a scan allowance.
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

// ---------------------------------------------------------------------------
// The credit ledger
// ---------------------------------------------------------------------------

/**
 * The entitlement, answered from the durable ledger when it is authoritative.
 *
 * Same question, same shape, plus where the answer came from:
 *
 *   founder  lifetime, unmetered, Pro — from the verified identity alone, and
 *            never touching the ledger: the founder has no balance to read and
 *            never receives a debit that merely pretends to be unlimited
 *   exempt   internal plans and exempt accounts, unmetered as before
 *   ledger   the sum of this owner's ledger rows (SMART_SCAN_LEDGER=on)
 *   legacy   the plan counters that serve production today (ledger off)
 *
 * With the ledger on, the first answer for an owner carries their remaining
 * legacy allowance across as an opening balance, once, so nobody who had scans
 * left is stranded by the switch.
 *
 * If the ledger cannot be read the answer is zero. Scanning at a fair depends on
 * the same database the ledger lives in; an owner is not given free credits
 * because a read failed.
 */
export type ScanCreditState = ScanEntitlement & {
  source: 'founder' | 'exempt' | 'ledger' | 'legacy'
  /** The owner's credit balance where one applies; null when unmetered. */
  creditBalance: number | null
}

export async function resolveScanEntitlement(
  db: SupabaseClient,
  profile: EntitlementProfile & { id: string },
  identity?: AuthIdentity | null,
  env: Record<string, string | undefined> = process.env
): Promise<ScanCreditState> {
  const legacy = readScanEntitlement(profile, identity)

  if (legacy.founder) return { ...legacy, source: 'founder', creditBalance: null }
  if (legacy.unmetered) return { ...legacy, source: 'exempt', creditBalance: null }
  if (!ledgerEnabled(env)) return { ...legacy, source: 'legacy', creditBalance: legacy.available }

  try {
    await ensureLegacyOpeningBalance(db, profile.id, legacy.available)
  } catch (err) {
    console.error('[scan/entitlement] legacy bridge unavailable')
    return { available: 0, unmetered: false, founder: false, pro: false, source: 'ledger', creditBalance: null }
  }

  const balance = await getScanCreditBalance(db, profile.id)
  const available = balance === null ? 0 : Math.max(0, balance)
  return { available, unmetered: false, founder: false, pro: false, source: 'ledger', creditBalance: balance }
}

export type AcceptedCard = {
  source: 'single_scan' | 'batch_item'
  /** The card's own identity: a batch item id, or a single-scan digest. */
  ref: string
  idempotencyKey: string
}

export type AcceptedCardCharge = ConsumeOutcome | 'unmetered' | 'legacy'

/**
 * Spend for accepted cards, each at most once.
 *
 * Unmetered owners are never charged and no ledger row is written for them.
 * With the ledger off, the legacy counter moves by the number of cards, exactly
 * as `consumeScanCredits` always did. With it on, every card spends under its
 * own key, so a repeated save or a retried request charges nothing new.
 */
export async function chargeAcceptedCards(
  db: SupabaseClient,
  profile: EntitlementProfile & { id: string },
  identity: AuthIdentity | null | undefined,
  cards: AcceptedCard[],
  env: Record<string, string | undefined> = process.env
): Promise<AcceptedCardCharge[]> {
  if (cards.length === 0) return []

  const entitlement = readScanEntitlement(profile, identity)
  if (entitlement.unmetered) return cards.map(() => 'unmetered')

  if (!ledgerEnabled(env)) {
    await consumeScanCredits(db, profile, cards.length, identity)
    return cards.map(() => 'legacy')
  }

  const outcomes: AcceptedCardCharge[] = []
  for (const card of cards) {
    const { outcome } = await consumeScanCredit(db, {
      userId: profile.id,
      source: card.source,
      sourceRef: card.ref,
      idempotencyKey: card.idempotencyKey,
    })
    if (outcome === 'insufficient' || outcome === 'error') {
      /*
        Logged, not thrown. The contact already exists by the time a card is
        charged, and telling the owner otherwise would be a lie; an undercharge
        is recoverable, a phantom failure at a stand is not.
      */
      console.error('[scan/entitlement] card not charged', { source: card.source, outcome })
    }
    outcomes.push(outcome)
  }
  return outcomes
}
