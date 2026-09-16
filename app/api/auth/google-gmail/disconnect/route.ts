import { NextResponse } from 'next/server'
import { disconnectGmail } from '@/lib/google/gmail-disconnect'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Disconnect Gmail for the signed-in owner. See lib/google/gmail-disconnect.ts.
 *
 * The owner is the session user; the request carries nothing else. No Pro
 * check — anyone who connected a mailbox can always disconnect it. Signing in
 * with Google is unaffected.
 */

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function DELETE() {
  try {
    const auth = createRouteHandlerClient()
    const {
      data: { user },
    } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })

    const result = await disconnectGmail({ db: createServiceClient() }, user.id)
    if (!result.ok) {
      return NextResponse.json({ error: 'Could not disconnect Gmail. Try again.' }, { status: 500, headers: NO_STORE })
    }
    return NextResponse.json({ success: true, revoked: result.revoked }, { headers: NO_STORE })
  } catch (err) {
    console.error('[gmail/disconnect] request failed:', err instanceof Error ? err.name : 'unknown')
    return NextResponse.json({ error: 'Could not disconnect Gmail. Try again.' }, { status: 500, headers: NO_STORE })
  }
}
