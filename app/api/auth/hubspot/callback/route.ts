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

/**
 * Which step gave up.
 *
 * Every failure below looks identical in the browser, which is deliberate — an
 * attacker probing this endpoint learns nothing about why it refused. The cost
 * is that we learn nothing either, and a failed authorization becomes
 * unfalsifiable guesswork. These names are the other half of that trade: the
 * server says which step stopped, and only which step.
 */
type Stage =
  | 'hubspot_returned_error'
  | 'missing_code'
  | 'missing_state'
  | 'state_cookie_missing'
  | 'state_malformed'
  | 'state_signature_invalid'
  | 'state_expired'
  | 'state_mismatch'
  | 'config_missing'
  | 'session_user_missing'
  | 'owner_mismatch'
  | 'token_exchange_failed'
  | 'account_identity_failed'
  | 'connection_save_failed'
  | 'unexpected_callback_error'

/**
 * One line, one failure, nothing that could be replayed or stolen.
 *
 * The detail argument takes fixed vocabulary only — an OAuth error name, an
 * exception class. Never the authorization code, the state, the cookie, a
 * token, or any part of a provider response body: a log aggregator keeps what
 * it is given for a long time, and a credential written there once is a
 * credential leaked permanently.
 */
function logStage(stage: Stage, detail?: string) {
  console.error(`[hubspot-oauth-callback] stage=${stage}${detail ? ` detail=${detail}` : ''}`)
}

/**
 * The OAuth error name, if it is one.
 *
 * HubSpot's `error` parameter is a fixed vocabulary (`access_denied`,
 * `invalid_scope`, …) and safe to record. It arrives in a URL an attacker
 * controls, though, so anything not shaped like that vocabulary is reported as
 * `unrecognized` rather than written through. `error_description` is never
 * read: it is free text and can carry request specifics.
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
      consumeOAuthState({ state, provider: 'hubspot' })

      if (providerError) logStage('hubspot_returned_error', safeErrorName(providerError))
      else if (!code) logStage('missing_code')
      else logStage('missing_state')

      return backTo(request, 'error')
    }

    const validated = consumeOAuthState({ state, provider: 'hubspot' })
    if (!validated.ok) {
      logStage(STATE_STAGE[validated.reason] ?? 'state_malformed')
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

    // Two separate steps: no session at all is a different problem from a
    // session belonging to somebody else, and only one of them is an attack.
    if (!user) {
      logStage('session_user_missing')
      return backTo(request, 'error')
    }
    if (user.id !== validated.ownerId) {
      logStage('owner_mismatch')
      return backTo(request, 'error')
    }

    const config = getHubSpotConfig()
    if (!config) {
      logStage('config_missing')
      return backTo(request, 'error')
    }

    const tokens = await exchangeHubSpotCode(config, code)
    if (!tokens) {
      // The exchange logs its own HTTP status on the line above this one. No
      // status there means HubSpot answered 200 without an access token.
      logStage('token_exchange_failed')
      return backTo(request, 'error')
    }

    // Which portal was connected, for the UI. Absent is fine; wrong is not.
    const remoteAccountId = await getHubSpotAccountId(config, tokens.accessToken)
    // Not a failure and not treated as one — recorded because a connection that
    // cannot name its own portal is worth noticing.
    if (!remoteAccountId) logStage('account_identity_failed')

    const saved = await saveCrmConnection({
      ownerId: user.id,
      provider: 'hubspot',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      remoteAccountId,
    })

    if (!saved) logStage('connection_save_failed')

    return backTo(request, saved ? 'connected' : 'error')
  } catch (err) {
    /*
      Logged, then rethrown unchanged. Something in here can throw — a missing
      encryption key reaches `signingKey()` before any guard does — and that
      currently surfaces as a 500. Turning it into a redirect would be a
      behaviour change wearing a diagnostic's clothes, so the response stays
      exactly what it was and only the record improves. The class name, never
      the message: messages interpolate values.
    */
    logStage('unexpected_callback_error', err instanceof Error ? err.constructor.name : 'unknown')
    throw err
  }
}
