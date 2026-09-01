import { getScanLimitForPlan, isInternalTestPlan, isScanLimitExempt } from '@/lib/scan-limits'
import { PLAN_LABELS, type PaidPlan } from '@/lib/stripe-prices'

/**
 * One reading of "what plan is this person on", for every screen that says so.
 *
 * The settings hub summarises the plan and the billing page states it in full.
 * Two derivations of the same thing is how the CRM status bug happened — two
 * screens on one page disagreeing — so this is derived once and read twice.
 *
 * Pure: takes a plain row, returns plain values, imports nothing server-side.
 */

export type PlanProfileInput = {
  plan?: string | null
  email?: string | null
  google_email?: string | null
  scans_used?: number | null
  stripe_customer_id?: string | null
}

export type PlanSummary = {
  plan: string
  /** INTERNAL_TEST — ABC's own accounts, not a purchasable plan. */
  internal: boolean
  /** No scan cap applies, whether by plan or by allowlisted email. */
  exempt: boolean
  planLabel: string
  scansUsed: number
  scanLimit: number
  /** A real paid subscription, i.e. something Stripe can manage. */
  paid: boolean
  /** The usage sentence, written once so the two screens cannot word it differently. */
  usageLine: string
}

export function planSummary(profile: PlanProfileInput): PlanSummary {
  const plan = String(profile.plan || 'free')
  const internal = isInternalTestPlan(plan)
  const exempt = isScanLimitExempt(profile)
  const planLabel = internal ? 'Founder access' : PLAN_LABELS[plan as PaidPlan] || 'Free'
  const scansUsed = Number(profile.scans_used || 0)
  const scanLimit = getScanLimitForPlan(plan)
  const paid = plan !== 'free' && !internal

  const usageLine =
    exempt || !Number.isFinite(scanLimit)
      ? `Unlimited scans · ${scansUsed} so far`
      : scansUsed >= scanLimit
        ? `Scan limit reached — ${scansUsed} of ${scanLimit} lifetime scans used`
        : `${scansUsed} of ${scanLimit} lifetime scans used`

  return { plan, internal, exempt, planLabel, scansUsed, scanLimit, paid, usageLine }
}
