import { AUTH_ERROR_CODES } from '@/lib/auth/error-codes'
import type { NativeDeepLink } from '@/lib/native/deep-link'
import type { NativeAuthProvider } from '@/lib/native/auth-flow'

/**
 * The app's half of native sign-in. The server's half, and why the flow is
 * shaped this way, is in lib/native/auth-flow.ts.
 *
 * The nonce is kept in localStorage for the minutes the system browser is open,
 * because the operating system may tear the WebView's page down while the
 * person is away signing in. It is removed the moment a return arrives, which is
 * also what makes a replayed launch URL harmless: with nothing pending, a
 * returning link is ignored.
 */

const PENDING_KEY = 'abc.nativeSignIn'
const PENDING_TTL_MS = 10 * 60 * 1000

type Pending = { nonce: string; startedAt: number }

function base64url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function writePending(pending: Pending) {
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(pending))
  } catch {
    // Storage refused: the return will find nothing pending and ask the person to try again.
  }
}

function takePending(): Pending | null {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY)
    window.localStorage.removeItem(PENDING_KEY)
    if (!raw) return null
    const pending = JSON.parse(raw) as Partial<Pending>
    if (typeof pending.nonce !== 'string' || typeof pending.startedAt !== 'number') return null
    if (Date.now() - pending.startedAt > PENDING_TTL_MS) return null
    return { nonce: pending.nonce, startedAt: pending.startedAt }
  } catch {
    return null
  }
}

function goToLogin(reason: string) {
  window.location.assign(`/login?error=auth&reason=${encodeURIComponent(reason)}`)
}

/** Starts a sign-in in the system browser. False when it could not be started at all. */
export async function startNativeSignIn(
  provider: NativeAuthProvider,
  next: string,
  connectUserId?: string
): Promise<boolean> {
  const nonce = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const nonceHash = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce))))

  const res = await fetch('/api/auth/native/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, next, nonceHash, connect: connectUserId }),
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const data = (await res.json().catch(() => ({}))) as { authorizeUrl?: unknown }
  if (!res.ok || typeof data.authorizeUrl !== 'string') return false

  writePending({ nonce, startedAt: Date.now() })
  const { Browser } = await import('@capacitor/browser')
  await Browser.open({ url: data.authorizeUrl })
  return true
}

/** Finishes a sign-in the system browser handed back. */
export async function handleNativeAuthLink(link: Exclude<NativeDeepLink, { kind: 'open-path' }>): Promise<void> {
  const pending = takePending()
  if (!pending) return

  try {
    const { Browser } = await import('@capacitor/browser')
    await Browser.close()
  } catch {
    // Nothing to close: Android's custom tab has already handed over.
  }

  if (link.kind === 'auth-cancelled') return
  if (link.kind === 'auth-failed') return goToLogin(AUTH_ERROR_CODES.exchangeFailed)

  const res = await fetch('/api/auth/native/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: link.code, flow: link.flow, nonce: pending.nonce }),
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const data = (await res.json().catch(() => ({}))) as { redirect?: unknown; code?: unknown }
  if (res.ok && typeof data.redirect === 'string' && data.redirect.startsWith('/') && !data.redirect.startsWith('//')) {
    window.location.assign(data.redirect)
    return
  }
  goToLogin(typeof data.code === 'string' ? data.code : AUTH_ERROR_CODES.unexpected)
}
