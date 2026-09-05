import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServerSupabase } from '@/lib/supabase'
import { loadOwnWalletPayload } from '@/lib/card/wallet-payload'
import { WALLET_REQUIREMENTS, walletCapabilities } from '@/lib/card/wallet'
import {
  APPLE_PASS_CONTENT_TYPE,
  applePassFilename,
  buildApplePass,
  readAppleWalletConfig,
} from '@/lib/card/wallet-apple'

/**
 * The owner's Apple Wallet pass.
 *
 * There is no card address in this route, by design. The previous endpoint
 * took a slug and resolved it with the service-role client, which meant the
 * question "may this caller have this pass" had to be answered by a check —
 * and the check was never written. Here the card comes from the session and
 * nowhere else, so a request for somebody else's pass is not something to
 * reject; it is something a caller cannot express.
 */

/* Signing is Node crypto and a zip. Not available on the edge runtime. */
export const runtime = 'nodejs'
/* A pass is per-owner and freshly signed. Nothing here may be cached. */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = createRouteHandlerClient()
    const {
      data: { user },
    } = await auth.auth.getUser()

    /*
      Before the configuration is even looked at. The missing-variable list is
      a description of this deployment's internals, and an anonymous caller has
      no business probing for it.
    */
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerSupabase()
    const result = await loadOwnWalletPayload(supabase, user.id)

    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            result.reason === 'not_published'
              ? 'Publish your card before adding it to Apple Wallet.'
              : 'Your card needs a card address before it can be added to Apple Wallet.',
          reason: result.reason,
        },
        { status: 409 }
      )
    }

    const capability = walletCapabilities().apple
    if (!capability.configured) {
      return NextResponse.json(
        {
          error: 'Apple Wallet is not set up for this deployment yet.',
          reason: 'not_configured',
          missing: capability.missing,
          required: WALLET_REQUIREMENTS.apple,
        },
        { status: 501 }
      )
    }

    const config = readAppleWalletConfig()
    if (!config) {
      return NextResponse.json(
        { error: 'Apple Wallet is not set up for this deployment yet.', reason: 'not_configured' },
        { status: 501 }
      )
    }

    const pass = await buildApplePass(result.payload, config)

    return new NextResponse(new Uint8Array(pass), {
      status: 200,
      headers: {
        'Content-Type': APPLE_PASS_CONTENT_TYPE,
        'Content-Disposition': `attachment; filename="${applePassFilename(result.payload)}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    /*
      A signing failure is the interesting case and it stays in the log. What
      goes back is deliberately plain: the exception text can carry certificate
      details, and this response is read by a browser.
    */
    console.error('[card/wallet/apple] error:', err)
    return NextResponse.json({ error: 'Wallet pass could not be created.' }, { status: 500 })
  }
}
