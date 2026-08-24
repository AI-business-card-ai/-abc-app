import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { consumeOAuthState } from '@/lib/crm/oauth-state'
import { saveCrmConnection } from '@/lib/crm/connections'
import {
  exchangeHubSpotCode,
  getHubSpotAccountId,
  getHubSpotConfig,
} from '@/lib/crm/hubspot-oauth'

/**
 * Finish a HubSpot connection.
 *
 * Order matters here, and it is the order of trust: parameters, then state,
 * then the session, and only then anything that touches HubSpot or the
 * database. Nothing is written until every check has passed, so a forged,
 * replayed, expired or mismatched callback leaves no trace beyond a log line.
 *
 * `state` is never treated as an identifier. It is compared against a signed
 * cookie that names the owner, and that cookie is consumed on the way through
 * so the same callback cannot be used twice.
 */

/** One message for every failure: the reason is for our logs, not the attacker's. */
function backTo(request: NextRequest, status: 'connected' | 'error') {
  return NextResponse.redirect(new URL(`/profile?crm=hubspot-${status}`, request.nextUrl.origin))
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const code = params.get('code')
  const state = params.get('state')

  if (params.get('error') || !code || !state) {
    // Still consume the state — an aborted attempt must not leave a live binding.
    consumeOAuthState({ state, provider: 'hubspot' })
    return backTo(request, 'error')
  }

  const validated = consumeOAuthState({ state, provider: 'hubspot' })
  if (!validated.ok) {
    console.error(`[hubspot] oauth state rejected: ${validated.reason}`)
    return backTo(request, 'error')
  }

  /*
    Defence in depth. The signed cookie already establishes the owner; this
    confirms the person holding the browser is still that owner. HubSpot returns
    by top-level redirect to our own origin, so the Supabase session cookie is
    present — and if it somehow is not, refusing is correct: the alternative is
    attaching a CRM account to a session nobody proved.
  */
  const supabase = createRouteHandlerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || user.id !== validated.ownerId) {
    console.error('[hubspot] oauth state owner did not match the current session')
    return backTo(request, 'error')
  }

  const config = getHubSpotConfig()
  if (!config) return backTo(request, 'error')

  const tokens = await exchangeHubSpotCode(config, code)
  if (!tokens) return backTo(request, 'error')

  // Which portal was connected, for the UI. Absent is fine; wrong is not.
  const remoteAccountId = await getHubSpotAccountId(config, tokens.accessToken)

  const saved = await saveCrmConnection({
    ownerId: user.id,
    provider: 'hubspot',
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    remoteAccountId,
  })

  return backTo(request, saved ? 'connected' : 'error')
}
