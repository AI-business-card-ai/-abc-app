import { NextResponse } from 'next/server'

/**
 * Retired: checkout for the legacy Starter, Growth, Pro and Team subscriptions.
 *
 * Those plans are not part of what ABC sells. This route used to create a
 * monthly USD Stripe subscription for any of them — including Growth, which the
 * profile plan constraint no longer accepts, so the webhook could not record a
 * Growth purchase after the customer had paid. It now creates nothing, calls
 * nothing and reads nothing: every request gets the same controlled answer.
 *
 * Kept as a route rather than deleted so an old page or a stale client gets a
 * clear refusal instead of a 404 that looks like an outage.
 *
 * What is NOT retired, because existing customers depend on it:
 *  - the webhook's handling of legacy subscriptions (lib/billing/webhook.ts) —
 *    completion, and cancellation back to Free;
 *  - the billing portal (app/api/stripe/portal) — legacy subscribers cancel there;
 *  - the legacy plan labels and price-ID mapping (lib/stripe-prices.ts).
 *
 * Current purchases go through /api/billing/checkout and lib/billing/catalog.ts.
 */

export const dynamic = 'force-dynamic'

export async function POST() {
  return NextResponse.json(
    { error: 'This plan is no longer offered.', code: 'legacy_plans_retired' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } }
  )
}
