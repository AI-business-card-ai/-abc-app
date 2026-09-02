import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createOAuthState } from '@/lib/crm/oauth-state'
import {
  GMAIL_CONNECT_PROVIDER,
  getGmailAuthorizeUrl,
  getGmailConnectConfig,
} from '@/lib/google/gmail-connect'

/**
 * Start a Gmail connection.
 *
 * The owner is taken from the session here and recorded in a signed cookie;
 * what travels to Google is an opaque nonce. Same shape as the CRM connectors,
 * for the same reason: whoever starts the flow must be whoever receives the
 * credentials at the end of it, and neither the browser nor the provider gets
 * to have an opinion about which ABC account that is.
 *
 * Note what this route does not do — it never signs anybody in. The session it
 * reads must already exist, and it is left exactly as found.
 */
export async function GET(request: NextRequest) {
  const supabase = createRouteHandlerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const config = getGmailConnectConfig()
  if (!config) {
    return NextResponse.json({ error: 'Gmail connection is not configured' }, { status: 500 })
  }

  /*
    Where to come back to. Read from the query because the composer knows the
    conversation, but validated to a local path now and carried inside the
    signed state from here on, so the browser cannot choose the destination the
    callback eventually honours.
  */
  const requested = request.nextUrl.searchParams.get('returnTo')
  const returnTo = requested && requested.startsWith('/') && !requested.startsWith('//')
    ? requested
    : undefined

  const state = createOAuthState({
    ownerId: user.id,
    provider: GMAIL_CONNECT_PROVIDER,
    returnTo,
  })

  return NextResponse.redirect(getGmailAuthorizeUrl(config, state))
}
