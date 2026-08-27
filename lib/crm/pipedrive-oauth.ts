import {
  getCrmConnection,
  markConnectionNeedsReconnect,
  updateCrmTokens,
} from '@/lib/crm/connections'

/**
 * Pipedrive OAuth, against the current documented contract.
 *
 * Three things differ from HubSpot and all three are Pipedrive's doing, not a
 * stylistic choice:
 *
 * 1. Credentials go in an HTTP Basic header, not the form body.
 * 2. Scopes are configured on the app in Pipedrive's developer portal and are
 *    NOT sent in the authorization URL. There is no scope parameter to get
 *    wrong here, and adding one would not grant anything.
 * 3. Every account has its own API host, returned as `api_domain` with each
 *    token and each refresh. Pipedrive added that parameter because a
 *    company's domain can change, so it is stored again on every refresh
 *    rather than resolved once and trusted.
 *
 * The authorization code is valid for five minutes, and a refresh token dies
 * after sixty days of disuse — both shorter than the equivalents elsewhere,
 * and both reasons the reconnect path has to actually work.
 */

const AUTHORIZE_URL = 'https://oauth.pipedrive.com/oauth/authorize'
const TOKEN_URL = 'https://oauth.pipedrive.com/oauth/token'

/**
 * What the Pipedrive app must be configured to request.
 *
 * Not sent anywhere — Pipedrive reads scopes from the app's own settings — but
 * written down because the app and this code have to agree about what ABC is
 * allowed to do, and an agreement nobody recorded is one nobody can check.
 * `base` is granted automatically. `contacts:full` covers persons and
 * organizations, `activities:full` covers both activities ABC writes; the
 * `:full` scopes include their `:read` counterparts, so neither is listed
 * twice, and nothing beyond these two is asked for.
 */
export const PIPEDRIVE_REQUIRED_SCOPES = ['contacts:full', 'activities:full'] as const

/** Refresh this far before actual expiry, so a request in flight cannot age out. */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000

export type PipedriveConfig = { clientId: string; clientSecret: string; redirectUri: string }

/**
 * Configuration, or an explicit failure.
 *
 * No default redirect URI, for the same reason HubSpot has none: a
 * misconfigured production that still completes an authorization against the
 * wrong origin is worse than one that refuses to start.
 */
export function getPipedriveConfig(): PipedriveConfig | null {
  const clientId = process.env.PIPEDRIVE_CLIENT_ID
  const clientSecret = process.env.PIPEDRIVE_CLIENT_SECRET
  const redirectUri = process.env.PIPEDRIVE_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) return null
  return { clientId, clientSecret, redirectUri }
}

export function getPipedriveAuthorizeUrl(config: PipedriveConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state,
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

export type PipedriveTokens = {
  accessToken: string
  refreshToken: string | null
  expiresAt: string | null
  /** The account's own API origin, e.g. https://acme.pipedrive.com */
  apiBaseUrl: string | null
}

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  api_domain?: string
}

/**
 * Only an origin, and only one of Pipedrive's.
 *
 * `api_domain` arrives in a response and then becomes the host every subsequent
 * request is sent to, tokens attached. Anything that is not a pipedrive.com
 * origin is discarded rather than trusted, so a surprising value cannot
 * redirect a customer's credentials somewhere else.
 */
function safeApiBaseUrl(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    if (url.hostname !== 'pipedrive.com' && !url.hostname.endsWith('.pipedrive.com')) return null
    return url.origin
  } catch {
    return null
  }
}

function toTokens(body: TokenResponse): PipedriveTokens | null {
  if (!body.access_token) return null
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt:
      typeof body.expires_in === 'number'
        ? new Date(Date.now() + body.expires_in * 1000).toISOString()
        : null,
    apiBaseUrl: safeApiBaseUrl(body.api_domain),
  }
}

/**
 * Ask Pipedrive for tokens.
 *
 * The client id and secret travel in a Basic header, which is what Pipedrive
 * documents for this endpoint. Failures are logged as a status code and nothing
 * else: a token endpoint's error body can echo the request, and the request
 * contains the secret and the authorization code.
 */
async function requestTokens(
  config: PipedriveConfig,
  body: URLSearchParams,
  label: string
): Promise<PipedriveTokens | null> {
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`, 'utf8').toString('base64')

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })

    if (!res.ok) {
      console.error(`[pipedrive] ${label} failed with status ${res.status}`)
      return null
    }

    return toTokens((await res.json()) as TokenResponse)
  } catch {
    console.error(`[pipedrive] ${label} request could not be completed`)
    return null
  }
}

export async function exchangePipedriveCode(
  config: PipedriveConfig,
  code: string
): Promise<PipedriveTokens | null> {
  return requestTokens(
    config,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
    }),
    'code exchange'
  )
}

export async function refreshPipedriveTokens(
  config: PipedriveConfig,
  refreshToken: string
): Promise<PipedriveTokens | null> {
  return requestTokens(
    config,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    'token refresh'
  )
}

/**
 * Which Pipedrive company this token belongs to.
 *
 * Stored so the UI can name what an owner connected. Best-effort in exactly the
 * way HubSpot's is: a connection works perfectly without it, so a failure here
 * never fails the connect.
 */
export async function getPipedriveAccountId(
  apiBaseUrl: string,
  accessToken: string
): Promise<string | null> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null

    const body = (await res.json()) as { data?: { company_id?: number | string } }
    const id = body.data?.company_id
    return id == null ? null : String(id)
  } catch {
    return null
  }
}

export type PipedriveAccess =
  | { ok: true; accessToken: string; apiBaseUrl: string }
  | { ok: false; reason: 'not_connected' | 'needs_reconnect' | 'not_configured' }

/**
 * A usable access token and the host to spend it on.
 *
 * The one place the rest of the application should obtain Pipedrive
 * credentials, mirroring `getValidHubSpotAccessToken`. Both halves are returned
 * together because neither is usable alone: a valid token sent to the wrong
 * Pipedrive host is just a 401.
 *
 * A connection with no stored host cannot be used and asks for a reconnect. It
 * would only arise from a row written before this column existed, and guessing
 * a hostname on somebody's behalf is not a repair.
 */
export async function getValidPipedriveAccess(ownerId: string): Promise<PipedriveAccess> {
  const config = getPipedriveConfig()
  if (!config) return { ok: false, reason: 'not_configured' }

  const connection = await getCrmConnection(ownerId, 'pipedrive')
  if (!connection) return { ok: false, reason: 'not_connected' }
  if (connection.needsReconnect) return { ok: false, reason: 'needs_reconnect' }

  const expiresAt = connection.expiresAt ? Date.parse(connection.expiresAt) : NaN
  const stillValid = Number.isFinite(expiresAt) && expiresAt - EXPIRY_MARGIN_MS > Date.now()

  if (stillValid && connection.apiBaseUrl) {
    return { ok: true, accessToken: connection.accessToken, apiBaseUrl: connection.apiBaseUrl }
  }

  if (!connection.refreshToken) {
    await markConnectionNeedsReconnect(ownerId, 'pipedrive')
    return { ok: false, reason: 'needs_reconnect' }
  }

  const refreshed = await refreshPipedriveTokens(config, connection.refreshToken)
  if (!refreshed) {
    await markConnectionNeedsReconnect(ownerId, 'pipedrive')
    return { ok: false, reason: 'needs_reconnect' }
  }

  // The refresh carries a fresh api_domain; prefer it over the stored one,
  // which is the entire reason Pipedrive sends it every time.
  const apiBaseUrl = refreshed.apiBaseUrl ?? connection.apiBaseUrl
  if (!apiBaseUrl) {
    await markConnectionNeedsReconnect(ownerId, 'pipedrive')
    return { ok: false, reason: 'needs_reconnect' }
  }

  await updateCrmTokens({
    ownerId,
    provider: 'pipedrive',
    accessToken: refreshed.accessToken,
    // Pipedrive may rotate the refresh token; keep the previous one when it does not.
    refreshToken: refreshed.refreshToken ?? connection.refreshToken,
    expiresAt: refreshed.expiresAt,
    apiBaseUrl,
  })

  return { ok: true, accessToken: refreshed.accessToken, apiBaseUrl }
}
