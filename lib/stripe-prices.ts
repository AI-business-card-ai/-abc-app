export type PaidPlan = 'starter' | 'pro' | 'team'

export const STRIPE_PRICE_IDS: Record<PaidPlan, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
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
