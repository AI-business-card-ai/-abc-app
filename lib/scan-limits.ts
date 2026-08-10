/** Lifetime scan caps per plan (total scans_used, never monthly reset). */

export const INTERNAL_TEST_PLAN = 'INTERNAL_TEST' as const

/** Emails that bypass scan limits (in addition to INTERNAL_TEST plan). */
export const SCAN_LIMIT_EXEMPT_EMAILS = [
  'bury.esco@gmail.com',
  'im.expoguy@gmail.com',
] as const

export const PLAN_SCAN_LIMITS: Record<string, number> = {
  free: 3,
  starter: 50,
  growth: 100,
  pro: 200,
  team: 500,
  /** Founder/internal test — not a Stripe product; set only via DB. */
  INTERNAL_TEST: Infinity,
}

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase()
}

export function isInternalTestPlan(plan: string | null | undefined): boolean {
  return plan === INTERNAL_TEST_PLAN
}

export function isScanLimitExempt(profile: {
  plan?: string | null
  email?: string | null
  google_email?: string | null
}): boolean {
  if (isInternalTestPlan(profile.plan)) return true
  const candidates = [normalizeEmail(profile.email), normalizeEmail(profile.google_email)]
  return candidates.some((email) => (SCAN_LIMIT_EXEMPT_EMAILS as readonly string[]).includes(email))
}

export function getScanLimitForPlan(plan: string | null | undefined): number {
  if (isInternalTestPlan(plan)) return Infinity
  return PLAN_SCAN_LIMITS[plan || 'free'] ?? 3
}

export function isScanLimitReached(profile: {
  plan?: string | null
  email?: string | null
  google_email?: string | null
  scans_used?: number | null
}): boolean {
  // Explicit early return — INTERNAL_TEST never hits the cap
  if (profile.plan === INTERNAL_TEST_PLAN) return false
  if (isScanLimitExempt(profile)) return false
  const used = profile.scans_used ?? 0
  const limit = getScanLimitForPlan(profile.plan)
  if (!Number.isFinite(limit)) return false
  return used >= limit
}
