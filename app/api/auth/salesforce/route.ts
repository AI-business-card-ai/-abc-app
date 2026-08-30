import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { isTokenEncryptionConfigured } from '@/lib/crm/encryption'
import { createOAuthState } from '@/lib/crm/oauth-state'
import {
  createPkce,
  getSalesforceAuthorizeUrl,
  getSalesforceConfig,
} from '@/lib/crm/salesforce-oauth'

/**
 * Start a Salesforce connection.
 *
 * The same shape as the other two providers, on the same helpers: the owner
 * comes from the session and is recorded in a signed cookie, and what travels
 * to Salesforce is an opaque nonce.
 *
 * This replaces an earlier implementation that sent the owner's user id as the
 * state parameter and stored the resulting tokens as plaintext columns on the
 * profile. Both were the exact problems Phase 7A fixed for HubSpot; Salesforce
 * had simply never been brought along.
 *
 * PKCE is required by External Client Apps, and the verifier rides inside the
 * signed state cookie rather than a second cookie of its own, so it is bound to
 * the same owner and consumed by the same single use.
 */
export async function GET(request: NextRequest) {
  const supabase = createRouteHandlerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const config = getSalesforceConfig()
  if (!config) {
    // Including the redirect URI, which has no fallback. The previous version
    // defaulted to a Vercel preview hostname, which meant a misconfigured
    // production could still authorize against the wrong origin.
    return NextResponse.json({ error: 'Salesforce OAuth is not configured' }, { status: 500 })
  }

  // Refusing early rather than collecting credentials we cannot store safely.
  if (!isTokenEncryptionConfigured()) {
    return NextResponse.json({ error: 'CRM token storage is not configured' }, { status: 500 })
  }

  const pkce = createPkce()
  const state = createOAuthState({
    ownerId: user.id,
    provider: 'salesforce',
    verifier: pkce.verifier,
  })

  return NextResponse.redirect(getSalesforceAuthorizeUrl(config, state, pkce.challenge))
}
