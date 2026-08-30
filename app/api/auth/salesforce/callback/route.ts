import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { consumeOAuthState } from '@/lib/crm/oauth-state'
import { saveCrmConnection } from '@/lib/crm/connections'
import {
  exchangeSalesforceCode,
  getSalesforceConfig,
  getSalesforceOrgId,
} from '@/lib/crm/salesforce-oauth'

/**
 * Finish a Salesforce connection.
 *
 * The order of checks is the order of trust, exactly as it is for the other two
 * providers: parameters, then state, then the session, and only then anything
 * that touches Salesforce or the database.
 *
 * The credentials land encrypted in `crm_connections`. The previous version
 * wrote them as plaintext columns on `abc_profiles`, which is where HubSpot's
 * used to live before Phase 7A moved them.
 */

/** One message for every failure: the reason is for our logs, not the attacker's. */
function backTo(request: NextRequest, status: 'connected' | 'error') {
  return NextResponse.redirect(new URL(`/profile?crm=salesforce-${status}`, request.nextUrl.origin))
}

type Stage =
  | 'salesforce_returned_error'
  | 'missing_code'
  | 'missing_state'
  | 'state_cookie_missing'
  | 'state_malformed'
  | 'state_signature_invalid'
  | 'state_expired'
  | 'state_mismatch'
  | 'pkce_verifier_missing'
  | 'config_missing'
  | 'session_user_missing'
  | 'owner_mismatch'
  | 'token_exchange_failed'
  | 'instance_url_missing'
  | 'org_identity_failed'
  | 'connection_save_failed'
  | 'unexpected_callback_error'

/**
 * One line, one failure, nothing that could be replayed or stolen.
 *
 * The detail argument takes fixed vocabulary only. Never the authorization
 * code, the state, the PKCE verifier, the cookie, a token, the instance URL, or
 * any part of a provider response body.
 */
function logStage(stage: Stage, detail?: string) {
  console.error(`[salesforce-oauth-callback] stage=${stage}${detail ? ` detail=${detail}` : ''}`)
}

/**
 * The OAuth error name, if it is one.
 *
 * A fixed vocabulary is safe to record, but it arrives in a URL an attacker
 * controls, so anything not shaped like that vocabulary is reported as
 * `unrecognized`. `error_description` is never read: it is free text.
 */
function safeErrorName(value: string | null): string {
  return value && /^[a-z][a-z0-9_]{0,39}$/.test(value) ? value : 'unrecognized'
}

/** The state helper's reason, named as the step it belongs to. */
const STATE_STAGE: Record<string, Stage> = {
  missing: 'state_cookie_missing',
  malformed: 'state_malformed',
  forged: 'state_signature_invalid',
  expired: 'state_expired',
  mismatch: 'state_mismatch',
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const code = params.get('code')
    const state = params.get('state')
    const providerError = params.get('error')

    if (providerError || !code || !state) {
      // Still consume the state — an aborted attempt must not leave a live binding.
      consumeOAuthState({ state, provider: 'salesforce' })

      if (providerError) logStage('salesforce_returned_error', safeErrorName(providerError))
      else if (!code) logStage('missing_code')
      else logStage('missing_state')

      return backTo(request, 'error')
    }

    const validated = consumeOAuthState({ state, provider: 'salesforce' })
    if (!validated.ok) {
      logStage(STATE_STAGE[validated.reason] ?? 'state_malformed')
      return backTo(request, 'error')
    }

    /*
      Defence in depth. The signed cookie already establishes the owner; this
      confirms the person holding the browser is still that owner.
    */
    const supabase = createRouteHandlerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      logStage('session_user_missing')
      return backTo(request, 'error')
    }
    if (user.id !== validated.ownerId) {
      logStage('owner_mismatch')
      return backTo(request, 'error')
    }

    // The verifier was minted with the state and travels with it. Without one
    // the exchange cannot succeed, so this refuses rather than trying.
    if (!validated.verifier) {
      logStage('pkce_verifier_missing')
      return backTo(request, 'error')
    }

    const config = getSalesforceConfig()
    if (!config) {
      logStage('config_missing')
      return backTo(request, 'error')
    }

    const tokens = await exchangeSalesforceCode(config, code, validated.verifier)
    if (!tokens) {
      // The exchange logs its own HTTP status on the line above this one.
      logStage('token_exchange_failed')
      return backTo(request, 'error')
    }

    /*
      A Salesforce token is useless without the org's own host, and it only ever
      arrives here. A connection saved without one would look healthy and fail
      on first use, so this refuses instead.
    */
    if (!tokens.instanceUrl) {
      logStage('instance_url_missing')
      return backTo(request, 'error')
    }

    // Which org was connected, for the UI. Absent is fine; wrong is not.
    const remoteAccountId = await getSalesforceOrgId(tokens.instanceUrl, tokens.accessToken)
    if (!remoteAccountId) logStage('org_identity_failed')

    const saved = await saveCrmConnection({
      ownerId: user.id,
      provider: 'salesforce',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      // Salesforce states no lifetime for an access token; the adapter
      // discovers expiry from a 401 rather than predicting it.
      expiresAt: null,
      remoteAccountId,
      apiBaseUrl: tokens.instanceUrl,
    })

    if (!saved) logStage('connection_save_failed')

    return backTo(request, saved ? 'connected' : 'error')
  } catch (err) {
    // Logged, then rethrown unchanged: turning a 500 into a redirect would be a
    // behaviour change wearing a diagnostic's clothes.
    logStage('unexpected_callback_error', err instanceof Error ? err.constructor.name : 'unknown')
    throw err
  }
}
