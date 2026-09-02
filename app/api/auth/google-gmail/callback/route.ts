import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { consumeOAuthState } from '@/lib/crm/oauth-state'
import { saveGoogleOAuthTokens } from '@/lib/google-gmail-auth'
import {
  GMAIL_CONNECT_PROVIDER,
  exchangeGmailCode,
  getGmailConnectConfig,
  safeGmailReturnPath,
} from '@/lib/google/gmail-connect'

/**
 * Finish a Gmail connection.
 *
 * Two independent proofs are required before a single token is stored, and the
 * whole thing fails closed if either is missing:
 *
 *   1. a valid signed state naming the ABC account that started the flow, and
 *   2. a live ABC session belonging to that same account.
 *
 * The second is what the earlier implementation lacked. It used Supabase's
 * sign-in to obtain the mailbox, so the returning OAuth code decided who the
 * browser was — pick a different Google account at the chooser and you were
 * silently moved into a different ABC account. Here the code is exchanged
 * against Google directly and the session is only ever read. There is no call
 * to `exchangeCodeForSession`, no cookie written, and no path by which this
 * route can create an ABC user or change which one is signed in.
 *
 * A dropped connection because the ABC session expired mid-flow is a retry. A
 * mailbox attached to the wrong account is not recoverable by the person it
 * happened to, so the trade is not close.
 */

/** Stable, non-sensitive, and the same regardless of which check failed. */
const CONNECT_FAILED = 'gmail_connect_failed'

function failed(request: NextRequest, returnTo: string, detail: string) {
  console.error('[google-gmail/callback] connection refused:', detail)
  const url = new URL(returnTo, request.nextUrl.origin)
  url.searchParams.set('gmail', CONNECT_FAILED)
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const providerError = request.nextUrl.searchParams.get('error')

  /*
    Consumed first and unconditionally, whatever else is wrong. The cookie is
    single use by design, so leaving it behind on an early return would leave a
    live binding lying around for a later attempt to pick up.
  */
  const verified = consumeOAuthState({ state, provider: GMAIL_CONNECT_PROVIDER })
  const returnTo = safeGmailReturnPath(verified.ok ? verified.returnTo : undefined)

  // Cancelling at Google is an ordinary outcome, not a failure to investigate.
  if (providerError) {
    console.log('[google-gmail/callback] user did not complete authorization')
    return NextResponse.redirect(new URL(returnTo, request.nextUrl.origin))
  }

  if (!verified.ok) return failed(request, returnTo, `state ${verified.reason}`)
  if (!code) return failed(request, returnTo, 'authorization code missing')

  const config = getGmailConnectConfig()
  if (!config) return failed(request, returnTo, 'gmail connection is not configured')

  /*
    The second proof. The signed state says who started this; the session says
    who is holding the browser now. Both must be the same person, or the
    credentials about to be issued belong to nobody we can safely name.
  */
  const supabase = createRouteHandlerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return failed(request, returnTo, 'no ABC session at callback')
  if (user.id !== verified.ownerId) {
    return failed(request, returnTo, 'session owner differs from the account that started the flow')
  }

  try {
    const tokens = await exchangeGmailCode(config, code)

    /*
      A grant with no refresh token cannot be reused, and storing it would set
      the connected flag on a capability that stops working within the hour.
      Google withholds it when the mailbox has been authorized before, which is
      why the request forces the consent prompt.
    */
    if (!tokens.refreshToken) {
      return failed(request, returnTo, 'google returned no refresh token')
    }

    await saveGoogleOAuthTokens(verified.ownerId, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      // The mailbox that was authorized. Deliberately not compared with the ABC
      // account's own email — connecting a different one is a supported thing.
      email: tokens.email,
    })

    console.log('[google-gmail/callback] mailbox connected', { userId: verified.ownerId })

    const url = new URL(returnTo, request.nextUrl.origin)
    url.searchParams.set('gmail', 'connected')
    return NextResponse.redirect(url)
  } catch (err) {
    return failed(request, returnTo, err instanceof Error ? err.message : 'token exchange failed')
  }
}
