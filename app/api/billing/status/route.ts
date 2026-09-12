import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'
import { readBillingStatus } from '@/lib/billing/status'
import type { EntitlementProfile } from '@/lib/scan/entitlement'

/**
 * The signed-in owner's billing state.
 *
 * Smart Scan balance (or unmetered), Pro state and which products can be bought.
 * Owner from the verified session only; never public, never cached, and never
 * carrying a Stripe id, secret or payment detail.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = createRouteHandlerClient()
  const {
    data: { user },
  } = await auth.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = createServiceClient()
    const { data: profileRow } = await db
      .from('abc_profiles')
      .select('id, plan, email, google_email, scans_used')
      .eq('id', user.id)
      .maybeSingle()

    const profile = (profileRow ?? { id: user.id, plan: 'free', scans_used: 0 }) as EntitlementProfile & {
      id: string
    }

    const status = await readBillingStatus(db, { ...profile, id: user.id }, user)
    return NextResponse.json({ success: true, billing: status }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[billing/status] failed:', err instanceof Error ? err.message.split(':')[0] : 'unknown')
    return NextResponse.json({ error: 'Billing status is unavailable.' }, { status: 503 })
  }
}
