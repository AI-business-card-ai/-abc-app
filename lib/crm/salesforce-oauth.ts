import { createHash, randomBytes } from 'crypto'
import {
  REFRESH_WAIT_INTERVAL_MS,
  REFRESH_WAIT_TIMEOUT_MS,
  claimRefreshLock,
  getCrmConnection,
  markConnectionNeedsReconnect,
  releaseRefreshLock,
  updateCrmTokens,
} from '@/lib/crm/connections'

/**
 * Salesforce OAuth, against the current documented contract.
 *
 * Three things differ from the other two providers, and all three are
 * Salesforce's doing:
 *
 * 1. PKCE. External Client Apps — the only kind Salesforce still lets you
 *    create — require proof key for code exchange, so a verifier is minted at
 *    the start and presented at the exchange.
 * 2. Every org answers on its own host, returned as `instance_url`. Like
 *    Pipedrive's api_domain, and stored in the same provider-neutral column.
 * 3. No `expires_in`. The token response says when it was issued and nothing
 *    about when it dies, because session lifetime is an org setting nobody
 *    outside the org can read. So there is no proactive refresh here: the
 *    adapter refreshes when Salesforce says 401 and retries once. Inventing an
 *    expiry would mean either refreshing constantly or guessing wrong.
 */

/**
 * Where authorization happens.
 *
 * `login.salesforce.com` is production. A sandbox or scratch org authorizes at
 * `test.salesforce.com`, and an org with My Domain can use its own host — so
 * this is configurable rather than fixed. The previous integration hard-coded
 * the sandbox host, which would have sent every real customer to the wrong
 * place.
 */
const DEFAULT_LOGIN_HOST = 'https://login.salesforce.com'

/**
 * The REST API version every call uses.
 *
 * v67.0 is Summer '26, current at the time of writing. One constant, because a
 * version scattered across an adapter is a version that gets half-upgraded.
 */
export const SALESFORCE_API_VERSION = 'v67.0'

/**
 * What the External Client App must be configured to allow.
 *
 * `api` to read and write records, `refresh_token` so the connection survives
 * the first session expiry. Nothing else: ABC needs no administrative access,
 * no identity beyond knowing which org it is attached to, and no offline access
 * to anything it does not itself create.
 */
export const SALESFORCE_REQUIRED_SCOPES = ['api', 'refresh_token'] as const

export type SalesforceConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
  loginHost: string
}

/**
 * Configuration, or an explicit failure.
 *
 * The redirect URI has no default, for the same reason the other two providers
 * have none: a misconfigured production that still completes an authorization
 * against the wrong origin is worse than one that refuses to start.
 */
export function getSalesforceConfig(): SalesforceConfig | null {
  const clientId = process.env.SALESFORCE_CLIENT_ID
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET
  const redirectUri = process.env.SALESFORCE_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) return null

  // Optional, and validated rather than trusted: this value decides where a
  // customer is sent to type their password.
  const configured = process.env.SALESFORCE_LOGIN_HOST
  const loginHost = safeLoginHost(configured) ?? DEFAULT_LOGIN_HOST

  return { clientId, clientSecret, redirectUri, loginHost }
}

/** Only a Salesforce host, and only over https. */
function safeLoginHost(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    const host = url.hostname
    const allowed =
      host === 'login.salesforce.com' ||
      host === 'test.salesforce.com' ||
      host.endsWith('.my.salesforce.com') ||
      host.endsWith('.develop.my.salesforce.com') ||
      host.endsWith('.sandbox.my.salesforce.com')
    return allowed ? url.origin : null
  } catch {
    return null
  }
}

export type Pkce = { verifier: string; challenge: string }

/** A fresh PKCE pair. The verifier travels in the signed state cookie. */
export function createPkce(): Pkce {
  const verifier = randomBytes(64).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function getSalesforceAuthorizeUrl(
  config: SalesforceConfig,
  state: string,
  challenge: string
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: SALESFORCE_REQUIRED_SCOPES.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  return `${config.loginHost}/services/oauth2/authorize?${params.toString()}`
}

export type SalesforceTokens = {
  accessToken: string
  refreshToken: string | null
  /** The org's own API host, e.g. https://acme.my.salesforce.com */
  instanceUrl: string | null
}

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  instance_url?: string
}

/**
 * Only an origin, and only one of Salesforce's.
 *
 * `instance_url` arrives in a response and then becomes the host every
 * subsequent request is sent to with a bearer token attached. Anything that is
 * not a Salesforce origin is discarded rather than trusted.
 */
function safeInstanceUrl(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    const host = url.hostname
    const allowed =
      host.endsWith('.salesforce.com') ||
      host.endsWith('.force.com') ||
      host.endsWith('.salesforce.mil')
    return allowed ? url.origin : null
  } catch {
    return null
  }
}

function toTokens(body: TokenResponse): SalesforceTokens | null {
  if (!body.access_token) return null
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    instanceUrl: safeInstanceUrl(body.instance_url),
  }
}

/**
 * Ask Salesforce for tokens.
 *
 * Failures are logged as a status code and nothing else. A token endpoint's
 * error body can echo the request, and the request carries the client secret,
 * the authorization code and the PKCE verifier.
 */
async function requestTokens(
  config: SalesforceConfig,
  body: URLSearchParams,
  label: string
): Promise<SalesforceTokens | null> {
  try {
    const res = await fetch(`${config.loginHost}/services/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    if (!res.ok) {
      console.error(`[salesforce] ${label} failed with status ${res.status}`)
      return null
    }

    return toTokens((await res.json()) as TokenResponse)
  } catch {
    console.error(`[salesforce] ${label} request could not be completed`)
    return null
  }
}

export async function exchangeSalesforceCode(
  config: SalesforceConfig,
  code: string,
  verifier: string
): Promise<SalesforceTokens | null> {
  return requestTokens(
    config,
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code,
      code_verifier: verifier,
    }),
    'code exchange'
  )
}

export async function refreshSalesforceTokens(
  config: SalesforceConfig,
  refreshToken: string
): Promise<SalesforceTokens | null> {
  return requestTokens(
    config,
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
 * Which Salesforce org this token belongs to.
 *
 * Best-effort, exactly like the other two providers: a connection works
 * perfectly without it, so a failure here never fails the connect. The identity
 * service answers on the instance and returns the org id, which is what the UI
 * needs to name what somebody connected.
 */
export async function getSalesforceOrgId(
  instanceUrl: string,
  accessToken: string
): Promise<string | null> {
  try {
    const res = await fetch(`${instanceUrl}/services/oauth2/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null

    const body = (await res.json()) as { organization_id?: string }
    return body.organization_id ?? null
  } catch {
    return null
  }
}

export type SalesforceAccess =
  | { ok: true; accessToken: string; instanceUrl: string }
  | { ok: false; reason: 'not_connected' | 'needs_reconnect' | 'not_configured' }

/**
 * The stored credentials, without refreshing.
 *
 * Salesforce does not say when an access token dies, so there is nothing to
 * pre-empt: this hands back what is stored and the caller refreshes if
 * Salesforce refuses it. A connection with no instance URL cannot be used and
 * asks for a reconnect rather than having a hostname guessed for it.
 */
export async function getSalesforceAccess(ownerId: string): Promise<SalesforceAccess> {
  const config = getSalesforceConfig()
  if (!config) return { ok: false, reason: 'not_configured' }

  const connection = await getCrmConnection(ownerId, 'salesforce')
  if (!connection) return { ok: false, reason: 'not_connected' }
  if (connection.needsReconnect) return { ok: false, reason: 'needs_reconnect' }
  if (!connection.apiBaseUrl) return { ok: false, reason: 'needs_reconnect' }

  return { ok: true, accessToken: connection.accessToken, instanceUrl: connection.apiBaseUrl }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Wait for whoever won the refresh, then use what they stored.
 *
 * Polling, bounded, and never a spin: a fixed interval up to a fixed total. The
 * loser must not send the refresh token it read a moment ago — that token is
 * being spent right now by the winner, and presenting it afterwards is the
 * replay Salesforce revokes the whole family for.
 *
 * Waiting out the clock is not a failure to recover from by trying anyway. If
 * the winner never finishes, this reports that the connection needs attention
 * and stops.
 */
async function waitForRefreshedAccess(ownerId: string): Promise<SalesforceAccess> {
  const deadline = Date.now() + REFRESH_WAIT_TIMEOUT_MS

  while (Date.now() < deadline) {
    await sleep(REFRESH_WAIT_INTERVAL_MS)

    const connection = await getCrmConnection(ownerId, 'salesforce')
    if (!connection) return { ok: false, reason: 'not_connected' }
    if (connection.needsReconnect) return { ok: false, reason: 'needs_reconnect' }

    // The claim is gone, so the winner finished and has already persisted.
    if (!connection.refreshLockId && connection.apiBaseUrl) {
      return { ok: true, accessToken: connection.accessToken, instanceUrl: connection.apiBaseUrl }
    }
  }

  console.error('[salesforce] refresh wait timed out')
  return { ok: false, reason: 'needs_reconnect' }
}

/**
 * Trade the refresh token for a live session, after Salesforce rejected one.
 *
 * Called on a 401 and nowhere else, and only ever by one request at a time.
 *
 * Rotation changes what this function has to guarantee. An External Client App
 * returns a *replacement* refresh token and invalidates the one just sent, and
 * Salesforce treats a reuse of the old one as a replay: it revokes the current
 * refresh token and every access token with it, which signs the customer out of
 * their own integration. So there is no keeping the previous token "just in
 * case" — that fallback is the bug — and no two requests may spend the same
 * token.
 *
 * The order below is the security boundary, not housekeeping:
 *
 *   claim the connection  →  refresh  →  persist the new pair  →  release
 *
 * and the caller only retries its API request after all of that. Persisting
 * before the retry matters because the moment Salesforce answers, the old token
 * is dead; if the process stopped between the exchange and the write, the only
 * valid refresh token in existence would be one nobody had written down.
 */
export async function refreshSalesforceAccess(ownerId: string): Promise<SalesforceAccess> {
  const config = getSalesforceConfig()
  if (!config) return { ok: false, reason: 'not_configured' }

  // Only one request may hold the connection. Everyone else waits for its
  // result rather than spending the same token a second time.
  const claim = await claimRefreshLock(ownerId, 'salesforce')
  if (!claim.ok) return waitForRefreshedAccess(ownerId)

  try {
    const connection = await getCrmConnection(ownerId, 'salesforce')
    if (!connection) return { ok: false, reason: 'not_connected' }

    if (!connection.refreshToken) {
      await markConnectionNeedsReconnect(ownerId, 'salesforce')
      return { ok: false, reason: 'needs_reconnect' }
    }

    const refreshed = await refreshSalesforceTokens(config, connection.refreshToken)
    if (!refreshed) {
      /*
        Includes `invalid_grant`, which Salesforce returns for an expired,
        revoked or already-rotated token. None of those get better by trying
        again, and a retry with the same token is itself a replay — so this
        stops and asks for a person.
      */
      await markConnectionNeedsReconnect(ownerId, 'salesforce')
      return { ok: false, reason: 'needs_reconnect' }
    }

    /*
      Rotation is on, so a successful refresh is expected to carry a replacement.
      If one does not arrive, the token just sent is still spent and the stored
      one is worthless — keeping it would leave a connection that looks healthy
      and cannot refresh again. Fail closed and say so.
    */
    if (!refreshed.refreshToken) {
      console.error('[salesforce] refresh returned no replacement token')
      await markConnectionNeedsReconnect(ownerId, 'salesforce')
      return { ok: false, reason: 'needs_reconnect' }
    }

    // Salesforce returns instance_url on refresh; the stored one stands only if
    // it somehow does not.
    const instanceUrl = refreshed.instanceUrl ?? connection.apiBaseUrl
    if (!instanceUrl) {
      await markConnectionNeedsReconnect(ownerId, 'salesforce')
      return { ok: false, reason: 'needs_reconnect' }
    }

    const stored = await updateCrmTokens({
      ownerId,
      provider: 'salesforce',
      accessToken: refreshed.accessToken,
      // The replacement, never the previous one.
      refreshToken: refreshed.refreshToken,
      // Nothing to record: Salesforce states no lifetime for an access token.
      expiresAt: null,
      apiBaseUrl: instanceUrl,
    })

    /*
      The write failed after Salesforce already rotated. The new refresh token
      exists only in this function's memory and is about to be lost, and the old
      one is already invalid — so there is no healthy state to return to and
      nothing to retry with. Marking the connection is the honest end of it.
    */
    if (!stored) {
      console.error('[salesforce] rotated credentials could not be persisted')
      await markConnectionNeedsReconnect(ownerId, 'salesforce')
      return { ok: false, reason: 'needs_reconnect' }
    }

    return { ok: true, accessToken: refreshed.accessToken, instanceUrl }
  } finally {
    // Always, including on the failure paths above: a claim left behind would
    // block every later attempt until it went stale.
    await releaseRefreshLock(ownerId, 'salesforce', claim.lockId)
  }
}
