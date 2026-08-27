import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { isTokenEncryptionConfigured } from '@/lib/crm/encryption'
import { createOAuthState } from '@/lib/crm/oauth-state'
import { getPipedriveAuthorizeUrl, getPipedriveConfig } from '@/lib/crm/pipedrive-oauth'

/**
 * Start a Pipedrive connection.
 *
 * The same shape as the HubSpot start route, and deliberately the same helpers:
 * the owner comes from the session and is recorded in a signed cookie, and what
 * travels to Pipedrive is an opaque nonce. The state helper already records
 * which provider a nonce was issued for and refuses a callback that claims a
 * different one, so nothing about it needed changing to hold a second CRM.
 *
 * No scope parameter. Pipedrive reads an app's scopes from its own developer
 * portal settings, so there is nothing to request here — and nothing that could
 * silently disagree with the app the way a scope list can.
 */
export async function GET(request: NextRequest) {
  const supabase = createRouteHandlerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const config = getPipedriveConfig()
  if (!config) {
    // Including the redirect URI, which has no fallback: authorizing against
    // the wrong origin is worse than not starting.
    return NextResponse.json({ error: 'Pipedrive OAuth is not configured' }, { status: 500 })
  }

  // Refusing early rather than collecting credentials we cannot store safely.
  if (!isTokenEncryptionConfigured()) {
    return NextResponse.json({ error: 'CRM token storage is not configured' }, { status: 500 })
  }

  const state = createOAuthState({ ownerId: user.id, provider: 'pipedrive' })
  return NextResponse.redirect(getPipedriveAuthorizeUrl(config, state))
}
