import { GOOGLE_GMAIL_SCOPE } from '@/lib/google-oauth'

/**
 * Connecting a mailbox, which is not the same as signing in.
 *
 * Signing in with Google establishes who the ABC account holder is. Connecting
 * Gmail says "this already-known account may send from this mailbox" — an
 * integration, exactly like HubSpot or Pipedrive, and it belongs to the same
 * hardened connector pattern rather than to the auth stack.
 *
 * The first attempt at this used `supabase.auth.signInWithOAuth`, which is a
 * sign-in. Picking a different Google account at the chooser therefore minted a
 * session for that account and wrote its cookies over the current one: the
 * person was silently moved into a different ABC account, possibly one created
 * on the spot, and the account that asked for the mailbox got nothing. Nothing
 * here touches a Supabase session — the code is exchanged against Google
 * directly, server side, and the owner comes from a signed state cookie.
 *
 * The mailbox address is deliberately allowed to differ from the ABC account's
 * own email. Somebody signing in as david@company.com and sending from
 * sales@company.com is a normal thing to want.
 */

export const GMAIL_CONNECT_PROVIDER = 'google-gmail'

/**
 * `openid email` alongside the send scope so the token response carries an
 * id_token naming the mailbox that was actually authorized. Both are
 * non-sensitive, and reading the claim costs no extra round trip — the
 * alternative is a second call to userinfo for one string.
 */
export const GMAIL_CONNECT_SCOPES = ['openid', 'email', GOOGLE_GMAIL_SCOPE].join(' ')

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

export type GmailConnectConfig = { clientId: string; clientSecret: string; redirectUri: string }

/**
 * The same OAuth client the token refresh already uses.
 *
 * The redirect URI is derived from the app's own configured origin rather than
 * a request header: a header is attacker-controlled, and an authorization code
 * sent to an origin we did not choose is a code we should never receive.
 */
export function getGmailConnectConfig(): GmailConnectConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!clientId || !clientSecret || !appUrl) return null

  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl.replace(/\/+$/, '')}/api/auth/google-gmail/callback`,
  }
}

export function getGmailAuthorizeUrl(config: GmailConnectConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: GMAIL_CONNECT_SCOPES,
    state,
    access_type: 'offline',
    /*
      Two prompts, space delimited, and both are doing work.

      `consent` because Google returns a refresh token only for a consent that
      asks to work offline, and only on the first such consent unless it is
      forced — without it a reconnection yields an access token that expires
      within the hour and nothing to renew it with.

      `select_account` because the mailbox is a deliberate choice, not an
      inference. Somebody signed in to ABC as david@company.com may well want
      to send as sales@company.com, and without this Google quietly picks
      whichever account the browser happens to be holding. Showing the chooser
      makes the connected mailbox something the person actually decided.
    */
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
  })
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`
}

export type GmailTokenExchange = {
  accessToken: string
  refreshToken: string | null
  expiresIn: number | null
  /** The mailbox that was authorized, which may differ from the ABC account. */
  email: string | null
}

/**
 * Read the `email` claim without verifying the signature.
 *
 * Safe here, and only here: this token came back over TLS from Google's own
 * token endpoint in direct response to our own request, carrying our client
 * secret. It was never in the browser's hands. The claim is used to label a
 * mailbox in the UI, never to decide who anybody is — that is settled by the
 * ABC session and the signed state, both checked before this runs.
 */
function mailboxFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null
  const parts = idToken.split('.')
  if (parts.length < 2) return null
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      email?: unknown
    }
    return typeof claims.email === 'string' ? claims.email : null
  } catch {
    return null
  }
}

/** Trade the authorization code for tokens, server side. */
export async function exchangeGmailCode(
  config: GmailConnectConfig,
  code: string
): Promise<GmailTokenExchange> {
  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
    }),
  })

  const data = (await res.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    id_token?: string
    error?: string
    error_description?: string
  }

  if (!res.ok || !data.access_token) {
    // Google's wording is for the server log; the caller shows a stable code.
    throw new Error(data.error_description || data.error || 'Gmail token exchange failed')
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in ?? null,
    email: mailboxFromIdToken(data.id_token),
  }
}

/**
 * Where a finished connection may send the browser.
 *
 * The value arrives from the signed state, so nobody else chose it — but a
 * local-path check costs nothing and keeps the guarantee true even if a future
 * caller passes something looser.
 */
export function safeGmailReturnPath(returnTo: string | undefined): string {
  if (!returnTo) return '/contacts'
  return returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/contacts'
}
