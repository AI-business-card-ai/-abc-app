import {
  getCrmConnection,
  markConnectionNeedsReconnect,
  updateCrmTokens,
} from '@/lib/crm/connections'

/**
 * HubSpot OAuth, against the current documented contract.
 *
 * HubSpot's v1 OAuth endpoints are deprecated and stop working on 16 February
 * 2027; the replacement is a date-based version, `/oauth/2026-03/…`, which new
 * app listings are already required to use. The legacy code here called
 * `/oauth/v1/token`, so this moves to the current endpoints rather than
 * shipping something with a known expiry date.
 *
 * No PKCE. HubSpot's documentation for this flow describes authorization code
 * with a client secret and does not document PKCE as required or supported, and
 * inventing a challenge the provider does not expect would simply fail.
 */

const AUTHORIZE_URL = 'https://app.hubspot.com/oauth/authorize'
const TOKEN_URL = 'https://api.hubapi.com/oauth/2026-03/token'
const INTROSPECT_URL = 'https://api.hubapi.com/oauth/2026-03/token/introspect'

/**
 * Only what connecting requires.
 *
 * Phase 7B adds companies, associations, meetings and tasks, and asks for their
 * scopes then. Requesting permissions before the feature that needs them exists
 * means asking a customer to approve access nothing uses.
 */
const SCOPES = ['oauth', 'crm.objects.contacts.read', 'crm.objects.contacts.write']

/** Refresh this far before actual expiry, so a request in flight cannot age out. */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000

export type HubSpotConfig = { clientId: string; clientSecret: string; redirectUri: string }

/**
 * Configuration, or an explicit failure.
 *
 * The redirect URI has no default. It used to fall back to a Vercel preview
 * hostname, which meant a misconfigured production could still complete an
 * authorization against the wrong origin — better to refuse to start.
 */
export function getHubSpotConfig(): HubSpotConfig | null {
  const clientId = process.env.HUBSPOT_CLIENT_ID
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET
  const redirectUri = process.env.HUBSPOT_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) return null
  return { clientId, clientSecret, redirectUri }
}

export function getHubSpotAuthorizeUrl(config: HubSpotConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: SCOPES.join(' '),
    state,
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

export type HubSpotTokens = {
  accessToken: string
  refreshToken: string | null
  expiresAt: string | null
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number }

function toTokens(body: TokenResponse): HubSpotTokens | null {
  if (!body.access_token) return null
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt:
      typeof body.expires_in === 'number'
        ? new Date(Date.now() + body.expires_in * 1000).toISOString()
        : null,
  }
}

/**
 * Ask HubSpot for tokens.
 *
 * Failures are logged as a status code and nothing else. A token endpoint's
 * error body can echo the request, and the request contains the client secret
 * and the authorization code, so dumping the response into the log is how
 * credentials end up in a log aggregator forever.
 */
async function requestTokens(body: URLSearchParams, label: string): Promise<HubSpotTokens | null> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    if (!res.ok) {
      console.error(`[hubspot] ${label} failed with status ${res.status}`)
      return null
    }

    return toTokens((await res.json()) as TokenResponse)
  } catch {
    console.error(`[hubspot] ${label} request could not be completed`)
    return null
  }
}

export async function exchangeHubSpotCode(
  config: HubSpotConfig,
  code: string
): Promise<HubSpotTokens | null> {
  return requestTokens(
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code,
    }),
    'code exchange'
  )
}

export async function refreshHubSpotTokens(
  config: HubSpotConfig,
  refreshToken: string
): Promise<HubSpotTokens | null> {
  return requestTokens(
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
    }),
    'token refresh'
  )
}

/**
 * Which HubSpot account this token belongs to.
 *
 * Stored so the UI can tell an owner *which* portal they connected. Best-effort:
 * a connection is perfectly usable without it, so a failure here never fails
 * the connect. The field name moved between versions, so both spellings are
 * accepted rather than guessed at.
 */
export async function getHubSpotAccountId(
  config: HubSpotConfig,
  accessToken: string
): Promise<string | null> {
  try {
    const res = await fetch(INTROSPECT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        token: accessToken,
        token_type_hint: 'access_token',
      }).toString(),
    })

    if (!res.ok) return null

    const body = (await res.json()) as { hubId?: number | string; hub_id?: number | string }
    const id = body.hubId ?? body.hub_id
    return id == null ? null : String(id)
  } catch {
    return null
  }
}

export type AccessTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: 'not_connected' | 'needs_reconnect' | 'not_configured' }

/**
 * A usable access token, refreshing first if the stored one is spent.
 *
 * The one place the rest of the application should obtain a HubSpot token.
 * When a refresh fails the connection is marked as needing attention rather
 * than left looking healthy — an integration that quietly stopped working is
 * worse than one that says so.
 */
export async function getValidHubSpotAccessToken(ownerId: string): Promise<AccessTokenResult> {
  const config = getHubSpotConfig()
  if (!config) return { ok: false, reason: 'not_configured' }

  const connection = await getCrmConnection(ownerId, 'hubspot')
  if (!connection) return { ok: false, reason: 'not_connected' }
  if (connection.needsReconnect) return { ok: false, reason: 'needs_reconnect' }

  const expiresAt = connection.expiresAt ? Date.parse(connection.expiresAt) : NaN
  const stillValid = Number.isFinite(expiresAt) && expiresAt - EXPIRY_MARGIN_MS > Date.now()
  if (stillValid) return { ok: true, accessToken: connection.accessToken }

  if (!connection.refreshToken) {
    await markConnectionNeedsReconnect(ownerId, 'hubspot')
    return { ok: false, reason: 'needs_reconnect' }
  }

  const refreshed = await refreshHubSpotTokens(config, connection.refreshToken)
  if (!refreshed) {
    await markConnectionNeedsReconnect(ownerId, 'hubspot')
    return { ok: false, reason: 'needs_reconnect' }
  }

  await updateCrmTokens({
    ownerId,
    provider: 'hubspot',
    accessToken: refreshed.accessToken,
    // HubSpot may rotate the refresh token; keep the previous one when it does not.
    refreshToken: refreshed.refreshToken ?? connection.refreshToken,
    expiresAt: refreshed.expiresAt,
  })

  return { ok: true, accessToken: refreshed.accessToken }
}
