import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { deleteCrmConnection } from '@/lib/crm/connections'

/**
 * Forget the HubSpot connection.
 *
 * Local only: the stored credentials are deleted and nothing is touched inside
 * the customer's HubSpot account. Revoking the refresh token with the provider
 * would be tidier, but deleting data in someone's CRM on a disconnect click is
 * not a thing to do without asking, and Phase 7A is not the place to decide it.
 */
export async function DELETE() {
  try {
    const supabase = createRouteHandlerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await deleteCrmConnection(user.id, 'hubspot')
    return NextResponse.json({ success: true })
  } catch {
    // The error could name the row. Say only that it failed.
    return NextResponse.json({ error: 'Could not disconnect HubSpot.' }, { status: 500 })
  }
}
