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

  const hubspot = await getCrmConnectionStatus(user.id, 'hubspot')
  return NextResponse.json({ connections: [hubspot] })
}
