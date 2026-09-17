import { redirect } from 'next/navigation'

/**
 * The return screen of the retired legacy plan checkout.
 *
 * It used to announce "You're on ABC Pro" and name a Starter / Growth / Pro /
 * Team plan with its lifetime scan cap — a legacy plan is not ABC Pro, and a
 * signed-in account that had bought nothing was told it had Starter. No new
 * checkout returns here any more: current purchases return to Plan & Billing
 * (lib/billing/checkout.ts), which reads the real state from the server. A
 * legacy session still in flight, or an old bookmark, is sent there too.
 */
export default function PricingSuccessPage() {
  redirect('/settings/billing')
}
