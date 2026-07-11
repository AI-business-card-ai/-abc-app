/** Internal/dev accounts bypass scan limits (whitelist only). */

/** Lifetime scan caps per plan (total scans_used, never monthly reset). */
export const INTERNAL_TEST_PLAN = 'INTERNAL_TEST' as const

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
}

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase()
}

export function isScanLimitExempt(profile: {
  plan?: string | null
  email?: string | null
  google_email?: string | null
}): boolean {
  if (profile.plan === INTERNAL_TEST_PLAN) return true
  const candidates = [normalizeEmail(profile.email), normalizeEmail(profile.google_email)]
  return candidates.some((email) => (SCAN_LIMIT_EXEMPT_EMAILS as readonly string[]).includes(email))
}

export function getScanLimitForPlan(plan: string | null | undefined): number {
  return PLAN_SCAN_LIMITS[plan || 'free'] ?? 3
}

export function isScanLimitReached(profile: {
  plan?: string | null
  email?: string | null
  google_email?: string | null
  scans_used?: number | null
}): boolean {
  if (isScanLimitExempt(profile)) return false
  const used = profile.scans_used ?? 0
  return used >= getScanLimitForPlan(profile.plan)
}
