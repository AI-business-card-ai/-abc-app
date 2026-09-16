import { ABC_WEB_ORIGINS, NATIVE_URL_SCHEME } from '@/lib/native/config'

/**
 * Native connector names and addresses shared by the server, the app's
 * WebView code and the shell. No server imports and no crypto here: this file
 * ships in the browser bundle.
 *
 * The flow itself, and why it is shaped the way it is, is described in
 * lib/connectors/native.ts and 20260917120000_native_connector_attempts.
 */

export const NATIVE_CONNECTOR_PROVIDERS = ['google-gmail', 'hubspot', 'salesforce', 'pipedrive'] as const
export type NativeConnectorProvider = (typeof NATIVE_CONNECTOR_PROVIDERS)[number]
export type NativeCrmProvider = Exclude<NativeConnectorProvider, 'google-gmail'>

export function isNativeConnectorProvider(value: unknown): value is NativeConnectorProvider {
  return typeof value === 'string' && (NATIVE_CONNECTOR_PROVIDERS as readonly string[]).includes(value)
}

/** The web start routes. In the app, a link to one of these starts the native flow instead. */
export const CONNECTOR_START_PATHS: Readonly<Record<NativeConnectorProvider, string>> = {
  'google-gmail': '/api/auth/google-gmail',
  hubspot: '/api/auth/hubspot',
  salesforce: '/api/auth/salesforce',
  pipedrive: '/api/auth/pipedrive',
}

/** Where the system browser hands a finished connection back to the app. */
export const NATIVE_CONNECT_CALLBACK_URL = `${NATIVE_URL_SCHEME}://connect/callback`

export const NATIVE_CONNECT_INTEGRATIONS_PATH = '/settings/integrations'
export const NATIVE_CONNECT_GMAIL_DEFAULT_RETURN = '/contacts'

/** Attempt ids are uuids; the handoff is 32 random bytes, base64url. */
export const NATIVE_CONNECT_ATTEMPT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const NATIVE_CONNECT_HANDOFF_PATTERN = /^[A-Za-z0-9_-]{43}$/

/** A local path and nothing else: no scheme, no host, no protocol-relative `//`, no backslash. */
export function safeLocalPath(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
    ? value
    : null
}

/**
 * Where the app lands when a connection ends, for every outcome.
 *
 * Gmail returns to the conversation that asked for it, with the same `gmail`
 * query the web callback sets. A CRM returns to Integrations, which re-reads
 * connection status when it opens.
 */
export function nativeConnectDestination(
  provider: NativeConnectorProvider,
  returnTo: string | null | undefined,
  outcome: 'connected' | 'error' | 'cancelled'
): string {
  if (provider === 'google-gmail') {
    const base = safeLocalPath(returnTo) ?? NATIVE_CONNECT_GMAIL_DEFAULT_RETURN
    if (outcome === 'cancelled') return base
    const url = new URL(base, 'https://abc.invalid')
    url.searchParams.set('gmail', outcome === 'connected' ? 'connected' : 'gmail_connect_failed')
    return `${url.pathname}${url.search}`
  }
  if (outcome === 'cancelled') return NATIVE_CONNECT_INTEGRATIONS_PATH
  return `${NATIVE_CONNECT_INTEGRATIONS_PATH}?crm=${provider}-${outcome}`
}

/**
 * A link to one of ABC's connector start routes, recognised inside the app.
 *
 * Only ABC's own origins and only the exact start paths — never a callback — so
 * an arbitrary link cannot start a connection. Gmail's `returnTo` is kept when
 * it is a local path.
 */
export function nativeConnectorStartFromHref(
  href: string,
  currentOrigin: string
): { provider: NativeConnectorProvider; returnTo: string | null } | null {
  let url: URL
  try {
    url = new URL(href, currentOrigin)
  } catch {
    return null
  }
  if (url.origin !== currentOrigin && !ABC_WEB_ORIGINS.includes(url.origin)) return null

  const provider = NATIVE_CONNECTOR_PROVIDERS.find((p) => CONNECTOR_START_PATHS[p] === url.pathname)
  if (!provider) return null
  return { provider, returnTo: provider === 'google-gmail' ? safeLocalPath(url.searchParams.get('returnTo')) : null }
}
