import { NextRequest, NextResponse } from 'next/server'
import { startNativeConnector } from '@/lib/connectors/native'
import { nativeAuthorizeUrl, nativePkceFor } from '@/lib/connectors/native-providers'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Start a Gmail or CRM connection from inside the native app. See
 * lib/connectors/native.ts.
 *
 * The owner is the verified session user. The body names a provider, the hash of
 * a nonce the app keeps, and (for Gmail) where to come back to — nothing that
 * identifies an account. The answer is an authorize URL for the system browser
 * and the attempt id the app will see again on the way back.
 */

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      provider?: unknown
      nonceHash?: unknown
      returnTo?: unknown
    } | null

    const auth = createRouteHandlerClient()
    const {
      data: { user },
    } = await auth.auth.getUser()

    const outcome = await startNativeConnector(
      { db: createServiceClient(), authorizeUrl: nativeAuthorizeUrl, pkceFor: nativePkceFor },
      { identity: user ?? null, provider: body?.provider, nonceHash: body?.nonceHash, returnTo: body?.returnTo }
    )

    if (!outcome.ok) {
      return NextResponse.json(
        { code: outcome.code, ...(outcome.redirect ? { redirect: outcome.redirect } : {}) },
        { status: outcome.status, headers: NO_STORE }
      )
    }
    return NextResponse.json({ attemptId: outcome.attemptId, authorizeUrl: outcome.authorizeUrl }, { headers: NO_STORE })
  } catch (err) {
    console.error('[connectors/native/start] failed:', err instanceof Error ? err.constructor.name : 'unknown')
    return NextResponse.json({ code: 'connector_unavailable' }, { status: 500, headers: NO_STORE })
  }
}
