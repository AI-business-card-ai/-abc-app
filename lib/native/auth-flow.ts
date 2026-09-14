import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from 'crypto'

/**
 * Native sign-in with Google and Apple: through the system browser, and back.
 *
 * Not inside the WebView, for two reasons. Google refuses OAuth in embedded
 * WebViews outright. And a sign-in that finishes in Safari or Chrome sets its
 * session cookie in that browser, where ABC's WebView can never read it.
 *
 * The flow:
 *
 *   1. The app makes a random nonce and sends only its SHA-256 to
 *      /api/auth/native/start. The server makes a PKCE pair, seals the verifier,
 *      the nonce hash and the destination into an encrypted `flow`, and answers
 *      with Supabase's authorize URL carrying the PKCE challenge.
 *   2. The app opens that URL in the system browser. Supabase and the provider
 *      do their part and return to /auth/native/return?code=…&flow=…, which
 *      passes both to the app through its URL scheme.
 *   3. The app posts code, flow and the original nonce to
 *      /api/auth/native/complete from inside its WebView. The server opens the
 *      flow, checks the nonce against its hash, exchanges the code with the
 *      sealed verifier, and writes the session cookie onto the WebView's
 *      response.
 *
 * What each piece defends:
 *
 *   - The verifier leaves the server only encrypted, so a code intercepted on its
 *     way back cannot be exchanged by anybody else.
 *   - The nonce never leaves the app. A code and flow intercepted together — by
 *     another app registering the same URL scheme, say — still cannot be
 *     redeemed, and a crafted link cannot sign a victim's app into somebody
 *     else's account: the server exchanges nothing without the nonce behind the
 *     hash.
 *   - Supabase auth codes are single use and short lived, so a finished flow
 *     cannot be replayed.
 *   - The flow is encrypted and authenticated (AES-256-GCM) and expires after ten
 *     minutes.
 *
 * NATIVE_AUTH_SECRET keys the seal. Unset, native sign-in declines to start and
 * says so; web sign-in never touches any of this.
 */

const SECRET_ENV = 'NATIVE_AUTH_SECRET'
const FORMAT = 'v1'
const AAD = Buffer.from('abc-native-auth-flow', 'utf8')
const IV_BYTES = 12
const TAG_BYTES = 16

export const NATIVE_FLOW_TTL_SECONDS = 10 * 60

export const NATIVE_AUTH_PROVIDERS = ['google', 'apple'] as const
export type NativeAuthProvider = (typeof NATIVE_AUTH_PROVIDERS)[number]

/** A base64url SHA-256, and the base64url form of the app's 32-byte nonce: both 43 characters. */
export const NATIVE_NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/

const VERIFIER_PATTERN = /^[A-Za-z0-9_-]{43,128}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type NativeAuthFlow = {
  provider: NativeAuthProvider
  verifier: string
  nonceHash: string
  next: string
  connect: string | null
  /** Unix seconds. */
  expiresAt: number
}

export type OpenFlowResult =
  | { ok: true; flow: NativeAuthFlow }
  | { ok: false; reason: 'not_configured' | 'malformed' | 'forged' | 'expired' }

type Env = Record<string, string | undefined>

function flowKey(env: Env): Buffer | null {
  const secret = env[SECRET_ENV]
  if (!secret || secret.length < 32) return null
  return Buffer.from(hkdfSync('sha256', secret, 'abc-native-auth', 'flow-seal-v1', 32))
}

export function isNativeAuthConfigured(env: Env = process.env): boolean {
  return flowKey(env) !== null
}

export function isNativeAuthProvider(value: unknown): value is NativeAuthProvider {
  return typeof value === 'string' && (NATIVE_AUTH_PROVIDERS as readonly string[]).includes(value)
}

/** The same local-path rule the web callback applies, and a backslash refused too. */
export function safeNativeNextPath(next: unknown): string {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')
    ? next
    : '/dashboard'
}

export function safeConnectUserId(value: unknown): string | null {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null
}

function isFlow(value: unknown): value is NativeAuthFlow {
  if (!value || typeof value !== 'object') return false
  const flow = value as Record<string, unknown>
  return (
    isNativeAuthProvider(flow.provider) &&
    typeof flow.verifier === 'string' &&
    VERIFIER_PATTERN.test(flow.verifier) &&
    typeof flow.nonceHash === 'string' &&
    NATIVE_NONCE_PATTERN.test(flow.nonceHash) &&
    typeof flow.next === 'string' &&
    safeNativeNextPath(flow.next) === flow.next &&
    (flow.connect === null || safeConnectUserId(flow.connect) === flow.connect) &&
    typeof flow.expiresAt === 'number' &&
    Number.isFinite(flow.expiresAt)
  )
}

export function sealNativeAuthFlow(flow: NativeAuthFlow, env: Env = process.env): string {
  const key = flowKey(env)
  if (!key) throw new Error(`${SECRET_ENV} is not configured`)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(AAD)
  const body = Buffer.concat([cipher.update(JSON.stringify(flow), 'utf8'), cipher.final()])
  return [FORMAT, iv.toString('base64url'), body.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.')
}

export function openNativeAuthFlow(
  sealed: string | null | undefined,
  now: number = Date.now(),
  env: Env = process.env
): OpenFlowResult {
  const key = flowKey(env)
  if (!key) return { ok: false, reason: 'not_configured' }

  const parts = (sealed ?? '').split('.')
  if (parts.length !== 4 || parts[0] !== FORMAT) return { ok: false, reason: 'malformed' }

  const iv = Buffer.from(parts[1], 'base64url')
  const tag = Buffer.from(parts[3], 'base64url')
  if (iv.length !== IV_BYTES) return { ok: false, reason: 'malformed' }
  // A short tag is how GCM forgeries are made cheap; only the full length is accepted.
  if (tag.length !== TAG_BYTES) return { ok: false, reason: 'forged' }

  let text: string
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAAD(AAD)
    decipher.setAuthTag(tag)
    text = Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    return { ok: false, reason: 'forged' }
  }

  let flow: unknown
  try {
    flow = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (!isFlow(flow)) return { ok: false, reason: 'malformed' }
  if (flow.expiresAt * 1000 <= now) return { ok: false, reason: 'expired' }
  return { ok: true, flow }
}

export function hashNativeNonce(nonce: string): string {
  return createHash('sha256').update(nonce, 'utf8').digest('base64url')
}

export function nativeNonceMatches(nonce: unknown, nonceHash: string): boolean {
  if (typeof nonce !== 'string' || !NATIVE_NONCE_PATTERN.test(nonce)) return false
  const presented = Buffer.from(hashNativeNonce(nonce), 'utf8')
  const expected = Buffer.from(nonceHash, 'utf8')
  return presented.length === expected.length && timingSafeEqual(presented, expected)
}

/** RFC 7636: an 86-character verifier and its S256 challenge. */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(64).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier, 'utf8').digest('base64url') }
}

/**
 * The origin Supabase sends the system browser back to.
 *
 * From configuration, never from a request header, for the reason the Gmail
 * connector gives: an authorization code sent to an origin we did not choose is
 * a code we should never receive. It must also be on Supabase's redirect
 * allowlist, which is an owner-assisted setting.
 */
export function nativeAuthReturnOrigin(appUrl: string | undefined): string | null {
  if (!appUrl) return null
  try {
    const url = new URL(appUrl)
    const local = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    if (url.protocol !== 'https:' && !local) return null
    return url.origin
  } catch {
    return null
  }
}

/** Supabase's authorize endpoint, in the form supabase-js builds for a PKCE flow. */
export function buildNativeAuthorizeUrl(args: {
  supabaseUrl: string
  provider: NativeAuthProvider
  redirectTo: string
  challenge: string
}): string {
  const params = new URLSearchParams({
    provider: args.provider,
    redirect_to: args.redirectTo,
    code_challenge: args.challenge,
    code_challenge_method: 's256',
  })
  return `${args.supabaseUrl.replace(/\/+$/, '')}/auth/v1/authorize?${params.toString()}`
}

export type NativeCodeExchange =
  | { ok: true; accessToken: string; refreshToken: string }
  | { ok: false; status: number }

/** The PKCE token exchange supabase-js performs, with the verifier from the sealed flow. */
export async function exchangeNativeAuthCode(args: {
  supabaseUrl: string
  anonKey: string
  code: string
  verifier: string
  fetchImpl?: typeof fetch
}): Promise<NativeCodeExchange> {
  const res = await (args.fetchImpl ?? fetch)(
    `${args.supabaseUrl.replace(/\/+$/, '')}/auth/v1/token?grant_type=pkce`,
    {
      method: 'POST',
      headers: {
        apikey: args.anonKey,
        Authorization: `Bearer ${args.anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ auth_code: args.code, code_verifier: args.verifier }),
      cache: 'no-store',
    }
  )
  const data = (await res.json().catch(() => ({}))) as { access_token?: unknown; refresh_token?: unknown }
  if (!res.ok || typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string') {
    return { ok: false, status: res.status }
  }
  return { ok: true, accessToken: data.access_token, refreshToken: data.refresh_token }
}
