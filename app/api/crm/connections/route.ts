import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { getCrmConnectionStatus } from '@/lib/crm/connections'

/**
 * Connection state for the UI.
 *
 * Returns whether a CRM is connected, which account, and whether it needs
 * attention — and nothing that could be used to act as the customer. No tokens,
 * no ciphertext, no expiry. The owner comes from the session; there is no
 * parameter that could ask about somebody else.
 */
export async function GET() {
  const supabase = createRouteHandlerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Every CRM ABC supports, whether or not it is connected, so the screen can
  // offer the ones that are not without a second round trip.
  const connections = await Promise.all([
    getCrmConnectionStatus(user.id, 'hubspot'),
    getCrmConnectionStatus(user.id, 'pipedrive'),
    getCrmConnectionStatus(user.id, 'salesforce'),
  ])

  return NextResponse.json({ connections })
}
