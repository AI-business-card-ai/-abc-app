import { ABC_WEB_ORIGINS } from '@/lib/native/config'

/**
 * Where a link goes when ABC runs inside the native shell.
 *
 * - `internal`: an ABC page. It stays in the app's WebView — including a link to
 *   the other ABC origin, and one that asked for a new tab, which inside an app
 *   would otherwise throw the person out to Safari or Chrome.
 * - `download`: an ABC response that is a file, not a page. See below.
 * - `external`: somebody else's website. It opens in the in-app system browser
 *   (SFSafariViewController, Chrome Custom Tabs), never inside ABC's WebView.
 * - `system`: mail, phone and SMS links, which belong to the operating system.
 * - `blocked`: anything else — `javascript:`, `file:`, `intent:` and the like.
 *
 * Pure, so it can be tested without a device and reasoned about without one.
 */

export type NavigationDecision =
  | { kind: 'internal'; path: string }
  | { kind: 'download'; path: string }
  | { kind: 'external'; url: string }
  | { kind: 'system'; url: string }
  | { kind: 'blocked'; reason: 'malformed' | 'unsupported-scheme' }

/**
 * ABC responses that are files rather than pages.
 *
 * Neither WebView saves a download by itself: Capacitor 8 gives Android's no
 * download listener and iOS's no download delegate, so navigating to one of
 * these does nothing at all. The shell fetches them with the WebView's own
 * session and hands the file to the system share sheet instead.
 */
export const NATIVE_DOWNLOAD_PATHS: readonly string[] = [
  '/api/card/vcard/',
  '/api/card/wallet/apple',
  '/api/card/qr/',
  '/api/export/csv',
]

/** Schemes the operating system owns. The WebView passes them straight through. */
const SYSTEM_SCHEMES: readonly string[] = ['mailto:', 'tel:', 'sms:']

export function classifyNavigation(href: string, currentOrigin: string): NavigationDecision {
  let url: URL
  try {
    url = new URL(href, currentOrigin)
  } catch {
    return { kind: 'blocked', reason: 'malformed' }
  }

  if (SYSTEM_SCHEMES.includes(url.protocol)) return { kind: 'system', url: url.href }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { kind: 'blocked', reason: 'unsupported-scheme' }
  }

  const ownOrigin = url.origin === currentOrigin || ABC_WEB_ORIGINS.includes(url.origin)
  if (!ownOrigin) return { kind: 'external', url: url.href }

  const path = `${url.pathname}${url.search}${url.hash}`
  if (NATIVE_DOWNLOAD_PATHS.some((prefix) => url.pathname.startsWith(prefix))) {
    return { kind: 'download', path }
  }
  return { kind: 'internal', path }
}
