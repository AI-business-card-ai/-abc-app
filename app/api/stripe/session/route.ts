import { NextResponse } from 'next/server'

/**
 * Retired: the plan lookup behind the legacy checkout's success screen.
 *
 * Its only caller, /pricing/success, now sends everyone to Plan & Billing, and
 * no legacy checkout can be created any more (app/api/stripe/checkout). It
 * granted nothing — the webhook records a purchase — so retiring it changes no
 * entitlement. It now reads nothing and calls nothing.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    { error: 'This checkout is no longer available.', code: 'legacy_plans_retired' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } }
  )
}
