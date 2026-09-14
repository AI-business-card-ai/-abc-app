import { ABC_WEB_ORIGINS, NATIVE_URL_SCHEME } from '@/lib/native/config'

/**
 * The URLs the native app agrees to be opened with, and nothing else.
 *
 * Two shapes carry a finished sign-in back into the app:
 *   io.abccard.app://auth/callback?code=…&flow=…        (custom scheme, today)
 *   https://www.abccard.io/auth/native/return?code=…     (verified link, later)
 *
 * Any other ABC https address opens that page, for verified links to public
 * cards and the like. Every other scheme and host is ignored. The values are
 * checked for shape here and for meaning on the server — this parser decides
 * only whether a URL is worth handing on.
 */

export const NATIVE_AUTH_RETURN_PATH = '/auth/native/return'
export const NATIVE_AUTH_CALLBACK_URL = `${NATIVE_URL_SCHEME}://auth/callback`

export type NativeDeepLink =
  | { kind: 'auth-callback'; code: string; flow: string }
  | { kind: 'auth-cancelled' }
  | { kind: 'auth-failed' }
  | { kind: 'open-path'; path: string }

export const NATIVE_AUTH_CODE_PATTERN = /^[A-Za-z0-9._~-]{8,512}$/
export const NATIVE_FLOW_PATTERN = /^[A-Za-z0-9._-]{16,4096}$/

export function parseNativeDeepLink(raw: string): NativeDeepLink | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }

  const viaScheme =
    url.protocol === `${NATIVE_URL_SCHEME}:` && url.hostname === 'auth' && url.pathname === '/callback'
  const viaVerifiedLink = url.protocol === 'https:' && ABC_WEB_ORIGINS.includes(url.origin)

  if (viaScheme || (viaVerifiedLink && url.pathname === NATIVE_AUTH_RETURN_PATH)) {
    return authResult(url.searchParams)
  }
  if (viaVerifiedLink) return { kind: 'open-path', path: `${url.pathname}${url.search}` }
  return null
}

function authResult(params: URLSearchParams): NativeDeepLink {
  const error = params.get('error')
  if (error === 'cancelled') return { kind: 'auth-cancelled' }

  const code = params.get('code') ?? ''
  const flow = params.get('flow') ?? ''
  if (error || !NATIVE_AUTH_CODE_PATTERN.test(code) || !NATIVE_FLOW_PATTERN.test(flow)) {
    return { kind: 'auth-failed' }
  }
  return { kind: 'auth-callback', code, flow }
}
