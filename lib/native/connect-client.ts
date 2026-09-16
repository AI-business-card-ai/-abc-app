import {
  NATIVE_CONNECT_INTEGRATIONS_PATH,
  nativeConnectDestination,
  safeLocalPath,
  type NativeConnectorProvider,
} from '@/lib/connectors/native-shared'
import type { NativeDeepLink } from '@/lib/native/deep-link'

/**
 * The app's half of connecting Gmail or a CRM. The server's half, and why the
 * flow is shaped this way, is in lib/connectors/native.ts.
 *
 * Like native sign-in: a nonce is made here, only its hash is sent, and the
 * nonce waits in localStorage while the system browser is open — the operating
 * system may tear the page down meanwhile. A return is acted on only when it
 * names the attempt that is pending, and the pending record is removed as soon
 * as one does, so a replayed or foreign link does nothing.
 */

const PENDING_KEY = 'abc.nativeConnect'
const PENDING_TTL_MS = 10 * 60 * 1000

type Pending = {
  nonce: string
  attemptId: string
  provider: NativeConnectorProvider
  returnTo: string | null
  startedAt: number
}

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
    // Storage refused: the return will find nothing pending, and the owner can connect again.
  }
}

function readPending(): Pending | null {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY)
    if (!raw) return null
    const pending = JSON.parse(raw) as Partial<Pending>
    if (
      typeof pending.nonce !== 'string' ||
      typeof pending.attemptId !== 'string' ||
      typeof pending.provider !== 'string' ||
      typeof pending.startedAt !== 'number' ||
      Date.now() - pending.startedAt > PENDING_TTL_MS
    ) {
      window.localStorage.removeItem(PENDING_KEY)
      return null
    }
    return pending as Pending
  } catch {
    return null
  }
}

function clearPending() {
  try {
    window.localStorage.removeItem(PENDING_KEY)
  } catch {
    // Nothing to clear.
  }
}

/**
 * Start a connection in the system browser. False when it could not be started,
 * so the caller can stop any spinner; a Pro refusal navigates to Plan & Billing.
 */
export async function startNativeConnect(provider: NativeConnectorProvider, returnTo?: string | null): Promise<boolean> {
  try {
    const nonce = base64url(crypto.getRandomValues(new Uint8Array(32)))
    const nonceHash = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce))))

    const res = await fetch('/api/connectors/native/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, nonceHash, returnTo: safeLocalPath(returnTo) }),
      credentials: 'same-origin',
      cache: 'no-store',
    })
    const data = (await res.json().catch(() => ({}))) as { attemptId?: unknown; authorizeUrl?: unknown; redirect?: unknown }

    if (!res.ok || typeof data.attemptId !== 'string' || typeof data.authorizeUrl !== 'string') {
      const redirect = safeLocalPath(data.redirect)
      if (redirect) window.location.assign(redirect)
      else if (res.status === 401) window.location.assign('/login')
      return false
    }

    writePending({ nonce, attemptId: data.attemptId, provider, returnTo: safeLocalPath(returnTo), startedAt: Date.now() })
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url: data.authorizeUrl })
    return true
  } catch {
    return false
  }
}

/** Finish a connection the system browser handed back. */
export async function handleNativeConnectLink(
  link: Extract<NativeDeepLink, { kind: 'connect-callback' | 'connect-ended' }>
): Promise<void> {
  const pending = readPending()
  if (!pending) return
  // A return for some other attempt — an old link, somebody else's — is not this one.
  if (link.attemptId && link.attemptId !== pending.attemptId) return
  clearPending()

  try {
    const { Browser } = await import('@capacitor/browser')
    await Browser.close()
  } catch {
    // Nothing to close: Android's custom tab has already handed over.
  }

  if (link.kind === 'connect-ended') {
    window.location.assign(
      nativeConnectDestination(pending.provider, pending.returnTo, link.result === 'cancelled' ? 'cancelled' : 'error')
    )
    return
  }

  let destination = nativeConnectDestination(pending.provider, pending.returnTo, 'error')
  try {
    const res = await fetch('/api/connectors/native/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptId: link.attemptId, handoff: link.handoff, nonce: pending.nonce }),
      credentials: 'same-origin',
      cache: 'no-store',
    })
    const data = (await res.json().catch(() => ({}))) as { redirect?: unknown }
    destination = safeLocalPath(data.redirect) ?? (res.ok ? NATIVE_CONNECT_INTEGRATIONS_PATH : destination)
  } catch {
    // Offline at the last step: say it did not connect, where the owner started.
  }
  window.location.assign(destination)
}
