/**
 * The legacy Starter / Growth / Pro / Team plans — retired as products.
 *
 * Nothing sells them any more (app/api/stripe/checkout refuses), and their USD
 * price list and checkout price lookup are gone. What remains is what existing
 * customers still need:
 *  - the plan names, so Plan & Billing can say which legacy plan an account is on;
 *  - the price-ID mapping, so the webhook can still recognise a legacy
 *    subscription (lib/billing/webhook.ts).
 *
 * Current products live in lib/billing/catalog.ts.
 */

export type PaidPlan = 'starter' | 'growth' | 'pro' | 'team'

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

export function getPlanFromPriceId(priceId: string): PaidPlan | null {
  for (const plan of Object.keys(STRIPE_PRICE_IDS) as PaidPlan[]) {
    const id = STRIPE_PRICE_IDS[plan]
    if (id && id === priceId) return plan
  }
  return null
}
