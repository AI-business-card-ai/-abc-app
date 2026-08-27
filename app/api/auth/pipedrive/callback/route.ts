import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { consumeOAuthState } from '@/lib/crm/oauth-state'
import { saveCrmConnection } from '@/lib/crm/connections'
import {
  exchangePipedriveCode,
  getPipedriveAccountId,
  getPipedriveConfig,
} from '@/lib/crm/pipedrive-oauth'

/**
 * Finish a Pipedrive connection.
 *
 * The order of checks is the order of trust, exactly as it is for HubSpot:
 * parameters, then state, then the session, and only then anything that touches
 * Pipedrive or the database. Nothing is written until every check has passed.
 *
 * `state` is never treated as an identifier. It is compared against a signed
 * cookie that names the owner and the provider, and that cookie is consumed on
 * the way through so the same callback cannot be used twice.
 *
 * Diagnostics match the HubSpot callback's, under this route's own prefix. A
 * failed authorization that does not say which step stopped is a failure nobody
 * can act on, and that lesson has already been paid for once.
 */

/** One message for every failure: the reason is for our logs, not the attacker's. */
function backTo(request: NextRequest, status: 'connected' | 'error') {
  return NextResponse.redirect(new URL(`/profile?crm=pipedrive-${status}`, request.nextUrl.origin))
}

type Stage =
  | 'pipedrive_returned_error'
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
  | 'api_domain_missing'
  | 'account_identity_failed'
  | 'connection_save_failed'
  | 'unexpected_callback_error'

/**
 * One line, one failure, nothing that could be replayed or stolen.
 *
 * The detail argument takes fixed vocabulary only — an OAuth error name, an
 * exception class. Never the authorization code, the state, the cookie, a
 * token, or any part of a provider response body.
 */
function logStage(stage: Stage, detail?: string) {
  console.error(`[pipedrive-oauth-callback] stage=${stage}${detail ? ` detail=${detail}` : ''}`)
}

/**
 * The OAuth error name, if it is one.
 *
 * A fixed vocabulary is safe to record, but it arrives in a URL an attacker
 * controls, so anything not shaped like that vocabulary is reported as
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
      consumeOAuthState({ state, provider: 'pipedrive' })

      if (providerError) logStage('pipedrive_returned_error', safeErrorName(providerError))
      else if (!code) logStage('missing_code')
      else logStage('missing_state')

      return backTo(request, 'error')
    }

    const validated = consumeOAuthState({ state, provider: 'pipedrive' })
    if (!validated.ok) {
      logStage(STATE_STAGE[validated.reason] ?? 'state_malformed')
      return backTo(request, 'error')
    }

    /*
      Defence in depth. The signed cookie already establishes the owner; this
      confirms the person holding the browser is still that owner. Pipedrive
      returns by top-level redirect to our own origin, so the session cookie is
      present — and if it somehow is not, refusing is correct.
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

    const config = getPipedriveConfig()
    if (!config) {
      logStage('config_missing')
      return backTo(request, 'error')
    }

    const tokens = await exchangePipedriveCode(config, code)
    if (!tokens) {
      // The exchange logs its own HTTP status on the line above this one.
      logStage('token_exchange_failed')
      return backTo(request, 'error')
    }

    /*
      Unlike HubSpot, a Pipedrive token is useless without the account's own API
      host, and it only ever arrives here. A connection saved without one would
      look healthy and fail on first use, so this refuses instead.
    */
    if (!tokens.apiBaseUrl) {
      logStage('api_domain_missing')
      return backTo(request, 'error')
    }

    // Which company was connected, for the UI. Absent is fine; wrong is not.
    const remoteAccountId = await getPipedriveAccountId(tokens.apiBaseUrl, tokens.accessToken)
    if (!remoteAccountId) logStage('account_identity_failed')

    const saved = await saveCrmConnection({
      ownerId: user.id,
      provider: 'pipedrive',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      remoteAccountId,
      apiBaseUrl: tokens.apiBaseUrl,
    })

    if (!saved) logStage('connection_save_failed')

    return backTo(request, saved ? 'connected' : 'error')
  } catch (err) {
    // Logged, then rethrown unchanged: turning a 500 into a redirect would be a
    // behaviour change wearing a diagnostic's clothes. The class name, never
    // the message, because messages interpolate values.
    logStage('unexpected_callback_error', err instanceof Error ? err.constructor.name : 'unknown')
    throw err
  }
}
