import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'
import { deleteAccountForOwner } from '@/lib/account/delete'
import {
  isAccountDeletionConfirmed,
  type AccountDeletionErrorCode,
} from '@/lib/account/deletion-confirmation'

/**
 * Delete the signed-in owner's ABC account.
 *
 * The owner is the verified session user and nothing else. The body carries one
 * field, the typed confirmation, and no id of any kind is read from it. All the
 * deleting happens in lib/account/delete.ts; this route only decides whether the
 * request may reach it and says, in a stable code, how it went — never a
 * database, storage or auth message.
 *
 * Open to every signed-in account: free, Pro, founder, web, installed app or
 * store app. Deleting an account is not a paid feature and has no native gate.
 */

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

function refuse(code: AccountDeletionErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status, headers: NO_STORE })
}

/**
 * Sign the deleted account out of this browser or app.
 *
 * signOut clears the session cookies when the auth server confirms the session
 * is gone, which after deletion it should. The cookies are then expired by name
 * as well, because a session that outlives its account must not depend on that
 * call succeeding.
 */
async function endSession(auth: ReturnType<typeof createRouteHandlerClient>) {
  try {
    await auth.auth.signOut()
  } catch {
    // Expired below regardless.
  }
  try {
    const jar = cookies()
    for (const cookie of jar.getAll()) {
      if (/^sb-.*-auth-token(\.\d+)?$/.test(cookie.name)) jar.delete(cookie.name)
    }
  } catch {
    // Nothing further to clear.
  }
}

export async function POST(req: NextRequest) {
  try {
    // A JSON body only. A cross-site form cannot send this content type without
    // a preflight, on top of the session cookie being SameSite=Lax.
    if (!(req.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
      return refuse('invalid_request', 415)
    }

    const auth = createRouteHandlerClient()
    const {
      data: { user },
    } = await auth.auth.getUser()
    if (!user) return refuse('unauthorized', 401)

    let body: unknown = null
    try {
      body = await req.json()
    } catch {
      body = null
    }
    if (!isAccountDeletionConfirmed(body)) return refuse('confirmation_required', 400)

    const result = await deleteAccountForOwner(createServiceClient(), user.id)
    if (!result.ok) {
      if (result.code === 'active_subscription') return refuse('active_subscription', 409)
      return refuse('deletion_incomplete', 500)
    }

    await endSession(auth)
    return NextResponse.json({ deleted: true }, { headers: NO_STORE })
  } catch (err) {
    // The name only: a message could quote a row, a path or a token.
    console.error('[account/delete] request failed:', err instanceof Error ? err.name : 'unknown')
    return refuse('deletion_incomplete', 500)
  }
}
