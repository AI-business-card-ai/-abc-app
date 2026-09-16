import { NextRequest, NextResponse } from 'next/server'
import { claimNativeConnector } from '@/lib/connectors/native'
import { nativePersist } from '@/lib/connectors/native-providers'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Finish a native Gmail or CRM connection, from inside the app's WebView. See
 * lib/connectors/native.ts.
 *
 * The session decides whose attempt this can be. The body carries the attempt
 * id and handoff from the deep link and the nonce the app kept — never an
 * account id. One use: a second claim, from anywhere, gets nothing.
 */

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      attemptId?: unknown
      handoff?: unknown
      nonce?: unknown
    } | null

    const auth = createRouteHandlerClient()
    const {
      data: { user },
    } = await auth.auth.getUser()

    const outcome = await claimNativeConnector(
      { db: createServiceClient(), persist: nativePersist },
      { identity: user ?? null, attemptId: body?.attemptId, nonce: body?.nonce, handoff: body?.handoff }
    )

    if (!outcome.ok) {
      return NextResponse.json(
        { code: outcome.code, ...(outcome.redirect ? { redirect: outcome.redirect } : {}) },
        { status: outcome.status, headers: NO_STORE }
      )
    }
    return NextResponse.json({ connected: outcome.provider, redirect: outcome.redirect }, { headers: NO_STORE })
  } catch (err) {
    console.error('[connectors/native/claim] failed:', err instanceof Error ? err.constructor.name : 'unknown')
    return NextResponse.json({ code: 'connect_failed' }, { status: 500, headers: NO_STORE })
  }
}
