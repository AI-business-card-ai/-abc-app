import { createHmac, randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { safeEquals } from '@/lib/crm/encryption'

/**
 * OAuth state for CRM connections.
 *
 * The state parameter decides which ABC account a returning authorization gets
 * attached to, which makes it a security control rather than a convenience. The
 * flow it replaced sent the owner's own user id as state and the callback used
 * that id directly, so anyone who authorized their own CRM and edited one query
 * parameter could bind their credentials to somebody else's ABC account — and
 * ABC user ids are recoverable from public card media URLs, so the value was
 * not even a secret.
 *
 * What goes to the provider now is an opaque random nonce and nothing else. The
 * binding between that nonce and the owner lives in a signed httpOnly cookie
 * the browser cannot read or forge: the provider never learns who the owner is,
 * and an attacker who substitutes a nonce fails the signature.
 *
 * A cookie rather than a database table because the state has to survive
 * exactly one redirect back to this origin, and a table would need its own
 * expiry sweeping, its own privileges, and a row written before anybody has
 * proved anything.
 */

const COOKIE = 'abc_crm_oauth_state'
const TTL_SECONDS = 10 * 60
const NONCE_BYTES = 32

type StatePayload = {
  /** The opaque value sent to the provider. */
  nonce: string
  /** The ABC owner who started the flow. Never leaves the server. */
  ownerId: string
  provider: string
  /** Unix seconds. Checked on return so an abandoned flow cannot be resumed. */
  expiresAt: number
  /**
   * A PKCE code verifier, for providers that require one.
   *
   * It rides inside this cookie rather than a second one of its own, so it
   * inherits every property already proven here: signed, owner-bound, single
   * use, and expiring with the flow it belongs to. A separate cookie would have
   * needed all four again, and would have been able to outlive the state it
   * pairs with.
   *
   * Absent for providers that do not use PKCE, which changes nothing for them.
   */
  verifier?: string
  /**
   * Where to send the browser once the connection succeeds.
   *
   * Rides here for the same reason the verifier does: signed, owner-bound,
   * single use, expiring with its flow. The alternative is a query parameter,
   * and a destination the browser controls is an open redirect waiting to be
   * written. Callers still check the shape on the way out — this guarantees
   * only that nobody else chose it.
   *
   * Absent for flows that always return to the same place.
   */
  returnTo?: string
}

/**
 * Signing key for the state cookie.
 *
 * Reuses the token encryption secret: both protect the same connection flow,
 * and a second secret to configure is a second secret to get wrong. Signed with
 * HMAC rather than encrypted — the contents are not secret, only their
 * authenticity matters.
 */
function signingKey(): string {
  const key = process.env.CRM_TOKEN_ENCRYPTION_KEY
  if (!key) throw new Error('CRM_TOKEN_ENCRYPTION_KEY is not configured')
  return key
}

function sign(body: string): string {
  return createHmac('sha256', signingKey()).update(body).digest('base64url')
}

/**
 * Start a flow: mint a nonce, remember who it belongs to, return the nonce.
 *
 * The caller must already have an authenticated owner — this records a claim,
 * it does not establish one.
 */
export function createOAuthState(args: {
  ownerId: string
  provider: string
  /** Only for providers that require PKCE; omitted otherwise. */
  verifier?: string
  /** Only for flows that return somewhere specific; omitted otherwise. */
  returnTo?: string
}): string {
  const payload: StatePayload = {
    nonce: randomBytes(NONCE_BYTES).toString('base64url'),
    ownerId: args.ownerId,
    provider: args.provider,
    expiresAt: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    ...(args.verifier ? { verifier: args.verifier } : {}),
    ...(args.returnTo ? { returnTo: args.returnTo } : {}),
  }

  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const cookieValue = `${body}.${sign(body)}`

  cookies().set(COOKIE, cookieValue, {
    httpOnly: true,
    // Lax, not Strict: the browser arrives here by top-level redirect from the
    // provider, and Strict would withhold the cookie on exactly that navigation.
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth',
    maxAge: TTL_SECONDS,
  })

  return payload.nonce
}

export type StateResult =
  | { ok: true; ownerId: string; verifier?: string; returnTo?: string }
  | { ok: false; reason: 'missing' | 'malformed' | 'forged' | 'expired' | 'mismatch' }

/**
 * Finish a flow: prove the returning nonce is the one we issued, to whom.
 *
 * The cookie is cleared before the result is returned, whatever the outcome, so
 * a state can be presented exactly once. Replaying the same callback URL — from
 * a log, a shared link, a back button — finds no cookie and fails.
 *
 * Every failure returns a reason for the server's own logging and none of them
 * reach the browser, which sees one generic error either way.
 */
export function consumeOAuthState(args: { state: string | null; provider: string }): StateResult {
  const jar = cookies()
  const raw = jar.get(COOKIE)?.value

  // One use, always. Cleared even on failure so a bad attempt cannot be retried
  // against the same binding.
  jar.delete({ name: COOKIE, path: '/api/auth' })

  if (!args.state || !raw) return { ok: false, reason: 'missing' }

  const separator = raw.lastIndexOf('.')
  if (separator < 1) return { ok: false, reason: 'malformed' }

  const body = raw.slice(0, separator)
  const signature = raw.slice(separator + 1)

  if (!safeEquals(signature, sign(body))) return { ok: false, reason: 'forged' }

  let payload: StatePayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (!payload.nonce || !payload.ownerId || !payload.expiresAt) {
    return { ok: false, reason: 'malformed' }
  }
  if (payload.expiresAt < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'expired' }
  }
  if (payload.provider !== args.provider) return { ok: false, reason: 'mismatch' }

  // The nonce the provider returned must be the one this cookie was issued for.
  if (!safeEquals(payload.nonce, args.state)) return { ok: false, reason: 'mismatch' }

  return { ok: true, ownerId: payload.ownerId, verifier: payload.verifier, returnTo: payload.returnTo }
}
