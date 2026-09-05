import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServerSupabase } from '@/lib/supabase'
import { loadOwnWalletPayload } from '@/lib/card/wallet-payload'
import { WALLET_REQUIREMENTS, walletCapabilities } from '@/lib/card/wallet'
import { createGoogleSaveUrl, readGoogleWalletConfig } from '@/lib/card/wallet-google'

/**
 * The owner's Google Wallet pass.
 *
 * Same shape as the Apple route and for the same reason: no card address in
 * the request, so the card is whatever the session says it is. The response is
 * a redirect into Google's save flow rather than a link handed back as JSON,
 * because the owner pressed a button and the next thing they should see is
 * Google asking whether to save.
 */

/* RS256 signing via node:crypto. */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = createRouteHandlerClient()
    const {
      data: { user },
    } = await auth.auth.getUser()

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
              ? 'Publish your card before adding it to Google Wallet.'
              : 'Your card needs a card address before it can be added to Google Wallet.',
          reason: result.reason,
        },
        { status: 409 }
      )
    }

    const capability = walletCapabilities().google
    if (!capability.configured) {
      return NextResponse.json(
        {
          error: 'Google Wallet is not set up for this deployment yet.',
          reason: 'not_configured',
          missing: capability.missing,
          required: WALLET_REQUIREMENTS.google,
        },
        { status: 501 }
      )
    }

    const config = readGoogleWalletConfig()
    if (!config) {
      return NextResponse.json(
        { error: 'Google Wallet is not set up for this deployment yet.', reason: 'not_configured' },
        { status: 501 }
      )
    }

    /*
      The class and object are written before the redirect. If Google rejects
      either, the owner gets an error instead of a save link that would fail
      once they had already left the app.
    */
    const saveUrl = await createGoogleSaveUrl(result.payload, config)

    return NextResponse.redirect(saveUrl, { status: 302, headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[card/wallet/google] error:', err)
    return NextResponse.json({ error: 'Wallet pass could not be created.' }, { status: 500 })
  }
}
