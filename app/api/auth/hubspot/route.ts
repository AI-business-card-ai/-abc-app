import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { isTokenEncryptionConfigured } from '@/lib/crm/encryption'
import { createOAuthState } from '@/lib/crm/oauth-state'
import { getHubSpotAuthorizeUrl, getHubSpotConfig } from '@/lib/crm/hubspot-oauth'

/**
 * Start a HubSpot connection.
 *
 * The owner is taken from the session and recorded in a signed cookie; what
 * travels to HubSpot is an opaque nonce. Previously the owner's user id was the
 * state parameter and the callback trusted it, which let anyone bind their
 * HubSpot account to another ABC account by editing a query string.
 */
export async function GET(request: NextRequest) {
  const supabase = createRouteHandlerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const config = getHubSpotConfig()
  if (!config) {
    // Including the redirect URI, which no longer falls back to a deployment
    // hostname: authorizing against the wrong origin is worse than not starting.
    return NextResponse.json({ error: 'HubSpot OAuth is not configured' }, { status: 500 })
  }

  // Refusing early rather than collecting credentials we cannot store safely.
  if (!isTokenEncryptionConfigured()) {
    return NextResponse.json({ error: 'CRM token storage is not configured' }, { status: 500 })
  }

  const state = createOAuthState({ ownerId: user.id, provider: 'hubspot' })
  return NextResponse.redirect(getHubSpotAuthorizeUrl(config, state))
}
