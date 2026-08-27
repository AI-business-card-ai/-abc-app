import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { deleteCrmConnection } from '@/lib/crm/connections'

/**
 * Forget the Pipedrive connection.
 *
 * Local only: the stored credentials are deleted and nothing is touched inside
 * the customer's Pipedrive account. The persons, organizations and activities
 * ABC created stay exactly where they are — they are the customer's records
 * now, and a disconnect click is not consent to delete them.
 *
 * The object mappings are left too. If the same account is reconnected later,
 * they are what stops a second push from duplicating everything.
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

    await deleteCrmConnection(user.id, 'pipedrive')
    return NextResponse.json({ success: true })
  } catch {
    // The error could name the row. Say only that it failed.
    return NextResponse.json({ error: 'Could not disconnect Pipedrive.' }, { status: 500 })
  }
}
