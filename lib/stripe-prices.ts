export type PaidPlan = 'starter' | 'growth' | 'pro' | 'team'

/** Display / expected monthly prices in USD (must match Stripe Dashboard). */
export const PLAN_PRICES_USD: Record<PaidPlan, number> = {
  starter: 29,
  growth: 49,
  pro: 89,
  team: 199,
}

export const PLAN_LABELS: Record<PaidPlan, string> = {
  starter: 'Starter',
  growth: 'Growth',
  pro: 'Pro',
  team: 'Team',
}

export const STRIPE_PRICE_IDS: Record<PaidPlan, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  growth: process.env.STRIPE_PRICE_GROWTH,
  pro: process.env.STRIPE_PRICE_PRO,
  team: process.env.STRIPE_PRICE_TEAM,
}

export function getStripePriceId(plan: PaidPlan): string {
  const priceId = STRIPE_PRICE_IDS[plan]
  if (!priceId) {
    throw new Error(`Missing Stripe price ID for plan: ${plan}`)
  }
  return priceId
}

export function getPlanFromPriceId(priceId: string): PaidPlan | null {
  for (const plan of Object.keys(STRIPE_PRICE_IDS) as PaidPlan[]) {
    const id = STRIPE_PRICE_IDS[plan]
    if (id && id === priceId) return plan
  }
  return null
}
