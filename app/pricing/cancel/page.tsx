import { redirect } from 'next/navigation'

/**
 * The cancel screen of the retired legacy plan checkout.
 *
 * Its "Back to plans" led to the legacy plan catalog. Current checkouts cancel
 * back to Plan & Billing (lib/billing/checkout.ts); anything that still lands
 * here goes there as well.
 */
export default function PricingCancelPage() {
  redirect('/settings/billing')
}
