import type { SupabaseClient } from '@supabase/supabase-js'
import { PRO_KEYS, type ProKey } from '@/lib/billing/catalog'
import {
  proRequiredBody,
  type ProFeature,
  type ProRequiredBody,
  type ProSource,
} from '@/lib/billing/pro-features'
import {
  isFounder,
  resolveScanEntitlement,
  type AuthIdentity,
  type EntitlementProfile,
} from '@/lib/scan/entitlement'

/**
 * What one signed-in person may do, answered in one place.
 *
 * Two independent questions, deliberately kept apart:
 *
 *   ABC Pro     workflow — Smart Follow-up, scheduled sequences, Gmail sending,
 *               CRM sync. The founder always; otherwise an Event Pass, monthly
 *               or annual entitlement that is active right now.
 *   Smart Scan  credits — the founder unmetered, everybody else their balance.
 *               Pro never changes it: a Pro subscriber with no credits cannot
 *               scan, and that is the product, not an oversight.
 *
 * Everything is resolved from the verified auth identity and the server's own
 * tables. Nothing a request carries — a plan name, a `pro` flag, a user id —
 * can make an account Pro, and no Stripe object leaves this module: callers
 * see a boolean, where it came from, and when it ends.
 */

type Env = Record<string, string | undefined>

/** The stored billing state for one Pro product, as `billing_entitlements` holds it. */
export type BillingEntitlementRow = {
  product_key: string
  status: string
  current_period_start: string | Date | null
  current_period_end: string | Date | null
  cancel_at_period_end: boolean | null
}

export type ProEntitlement = {
  pro: boolean
  founder: boolean
  proSource: ProSource
  /** When the current access period ends or renews. Null for the founder and when not Pro. */
  proEndsAt: string | null
  /** A subscription that will renew. False for an Event Pass, a cancelling subscription, and the founder. */
  proRenews: boolean
}

type StoredPro = { productKey: ProKey; status: string; currentPeriodEnd: string | null }

export type ProState = ProEntitlement & {
  /** The entitlement currently granting Pro, if any. */
  current: StoredPro | null
  /** The most recent stored entitlement, active or not — for saying "ended", never for granting. */
  lastKnown: StoredPro | null
}

export type Entitlements = ProEntitlement & {
  unmetered: boolean
  /** Cards this owner may still accept. Infinity when unmetered. */
  scanAvailable: number
  /** The credit balance where one applies; null when unmetered. */
  scanCreditBalance: number | null
}

const FREE: ProEntitlement = { pro: false, founder: false, proSource: 'none', proEndsAt: null, proRenews: false }
const FOUNDER: ProEntitlement = { pro: true, founder: true, proSource: 'founder', proEndsAt: null, proRenews: false }

const SOURCE_BY_PRODUCT: Record<ProKey, Exclude<ProSource, 'founder' | 'none'>> = {
  pro_event: 'event_pass',
  pro_monthly: 'monthly',
  pro_annual: 'annual',
}

/** Stripe's two states that mean "paid up". Nothing else — no invented grace period. */
const ACTIVE_STATUSES = new Set(['active', 'trialing'])

function isProKey(value: string): value is ProKey {
  return (PRO_KEYS as readonly string[]).includes(value)
}

/** Milliseconds, null when absent, NaN when present but unreadable. */
function timeOf(value: string | Date | null): number | null {
  if (value === null || value === undefined) return null
  return new Date(value).getTime()
}

function isoOf(value: string | Date | null): string | null {
  const time = timeOf(value)
  return time === null || Number.isNaN(time) ? null : new Date(time).toISOString()
}

/**
 * Whether a stored entitlement grants Pro at `now`.
 *
 * Active status, inside its period: not before the period starts, not once it
 * has ended. An Event Pass is nothing but its period, so one without an end
 * grants nothing. A subscription is active for as long as Stripe says so and its
 * stored period has not run out; if a renewal webhook is late, access pauses
 * until it arrives rather than being assumed.
 */
export function isBillingEntitlementActive(row: BillingEntitlementRow, now: Date = new Date()): boolean {
  if (!isProKey(row.product_key)) return false
  if (!ACTIVE_STATUSES.has(row.status)) return false

  const at = now.getTime()
  const start = timeOf(row.current_period_start)
  const end = timeOf(row.current_period_end)
  if (Number.isNaN(start) || Number.isNaN(end)) return false

  if (start !== null && start > at) return false
  if (row.product_key === 'pro_event' && end === null) return false
  if (end !== null && end <= at) return false
  return true
}

/** Longest access first: an open-ended subscription, then the latest end. */
function byLongestAccess(a: BillingEntitlementRow, b: BillingEntitlementRow): number {
  const endA = timeOf(a.current_period_end)
  const endB = timeOf(b.current_period_end)
  if (endA === null) return endB === null ? 0 : -1
  if (endB === null) return 1
  return endB - endA
}

/** Most recent first, entitlements with no period last. */
function byMostRecentEnd(a: BillingEntitlementRow, b: BillingEntitlementRow): number {
  const endA = timeOf(a.current_period_end)
  const endB = timeOf(b.current_period_end)
  if (endA === null) return endB === null ? 0 : 1
  if (endB === null) return -1
  return endB - endA
}

function stored(row: BillingEntitlementRow): StoredPro {
  return {
    productKey: row.product_key as ProKey,
    status: row.status,
    currentPeriodEnd: isoOf(row.current_period_end),
  }
}

/**
 * Pro, with what is needed to describe it.
 *
 * A billing read that fails answers "not Pro". Access to paid workflow is not
 * granted because a query did not come back.
 */
export async function resolveProState(
  db: SupabaseClient,
  identity: AuthIdentity | null | undefined,
  now: Date = new Date()
): Promise<ProState> {
  if (!identity?.id) return { ...FREE, current: null, lastKnown: null }
  if (isFounder(identity)) return { ...FOUNDER, current: null, lastKnown: null }

  const { data, error } = await db
    .from('billing_entitlements')
    .select('product_key, status, current_period_start, current_period_end, cancel_at_period_end')
    .eq('user_id', identity.id)

  if (error) {
    console.error('[entitlements] billing entitlement read failed:', error.code ?? 'unknown')
    return { ...FREE, current: null, lastKnown: null }
  }

  const rows = ((data ?? []) as BillingEntitlementRow[]).filter((row) => isProKey(row.product_key))
  const latest = [...rows].sort(byMostRecentEnd)[0]
  const lastKnown = latest ? stored(latest) : null

  const best = rows.filter((row) => isBillingEntitlementActive(row, now)).sort(byLongestAccess)[0]
  if (!best) return { ...FREE, current: null, lastKnown }

  const productKey = best.product_key as ProKey
  return {
    pro: true,
    founder: false,
    proSource: SOURCE_BY_PRODUCT[productKey],
    proEndsAt: isoOf(best.current_period_end),
    proRenews: productKey !== 'pro_event' && !best.cancel_at_period_end,
    current: stored(best),
    lastKnown,
  }
}

/** Whether this person is Pro right now, and on what terms. */
export async function resolveProEntitlement(
  db: SupabaseClient,
  identity: AuthIdentity | null | undefined,
  now: Date = new Date()
): Promise<ProEntitlement> {
  const state = await resolveProState(db, identity, now)
  return {
    pro: state.pro,
    founder: state.founder,
    proSource: state.proSource,
    proEndsAt: state.proEndsAt,
    proRenews: state.proRenews,
  }
}

/**
 * Pro and Smart Scan together, for one person.
 *
 * The profile must be that same person's. A profile belonging to somebody else
 * answers nothing, rather than lending its balance or its plan to the caller.
 */
export async function resolveEntitlements(
  db: SupabaseClient,
  profile: EntitlementProfile & { id: string },
  identity: AuthIdentity | null | undefined,
  env: Env = process.env,
  now: Date = new Date()
): Promise<Entitlements> {
  if (!identity?.id || profile.id !== identity.id) {
    return { ...FREE, unmetered: false, scanAvailable: 0, scanCreditBalance: null }
  }

  const [scan, pro] = await Promise.all([
    resolveScanEntitlement(db, profile, identity, env),
    resolveProEntitlement(db, identity, now),
  ])

  return {
    ...pro,
    unmetered: scan.unmetered,
    scanAvailable: scan.available,
    scanCreditBalance: scan.unmetered ? null : scan.creditBalance,
  }
}

export type ProGate =
  | { ok: true; entitlement: ProEntitlement }
  | { ok: false; status: 401; body: { error: string } }
  | { ok: false; status: 403; body: ProRequiredBody }

/**
 * The server-side gate for a Pro action.
 *
 * Every route that performs paid workflow calls this with the verified session
 * user before doing anything, and returns the refusal as it is. Hiding a button
 * is presentation; this is the rule. It only ever reads — a lapsed Pro stops new
 * actions and leaves every stored token, connection and mapping where it is.
 */
export async function requirePro(
  db: SupabaseClient,
  identity: AuthIdentity | null | undefined,
  feature: ProFeature,
  now: Date = new Date()
): Promise<ProGate> {
  if (!identity?.id) return { ok: false, status: 401, body: { error: 'Unauthorized' } }

  const entitlement = await resolveProEntitlement(db, identity, now)
  if (!entitlement.pro) return { ok: false, status: 403, body: proRequiredBody(feature) }

  return { ok: true, entitlement }
}
