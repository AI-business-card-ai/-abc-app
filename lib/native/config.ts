/**
 * The native app's public identity: the one place it is written.
 *
 * Everything here ships inside the iOS and Android binaries and in the web
 * bundle, so none of it may ever be a secret. Server credentials — the Supabase
 * service role, Stripe, the Wallet signing keys, CRM client secrets — stay in the
 * server environment, and no native project or native config reads them.
 *
 * capacitor.config.ts imports this file through Capacitor's own TypeScript
 * loader, which follows relative imports but not the `@/` alias. It must
 * therefore keep importing nothing.
 */

/**
 * PROVISIONAL. Used for development builds, and to be confirmed before an App
 * Store Connect or Google Play Console record exists: neither store lets a
 * published app change its identifier.
 */
export const NATIVE_APP_ID = 'io.abccard.app'

export const NATIVE_APP_NAME = 'ABC Card'

/**
 * The custom scheme a finished sign-in returns through. Verified universal links
 * (iOS) and app links (Android) are the stronger channel and take over once the
 * Team ID and the signing certificate exist. Until then this is what works, and
 * the sign-in handoff is built not to depend on the scheme being private — see
 * lib/native/auth-flow.ts.
 */
export const NATIVE_URL_SCHEME = 'io.abccard.app'

/**
 * Appended to the WebView user agent as `ABCCardNative/ios` or
 * `ABCCardNative/android`. Read only through lib/native/runtime.ts.
 */
export const NATIVE_USER_AGENT_MARKER = 'ABCCardNative'

/** The working assumption until the owner confirms the canonical origin. */
export const DEFAULT_NATIVE_ORIGIN = 'https://www.abccard.io'

/** ABC's own web origins. A link to either stays inside the app. */
export const ABC_WEB_ORIGINS: readonly string[] = ['https://www.abccard.io', 'https://abccard.io']

/** Where the app opens. Somebody signed out is sent on to /login by the middleware. */
export const NATIVE_START_PATH = '/home'

/**
 * The origin the native shell loads, validated.
 *
 * An https origin and nothing more: no path, no query, no credentials, and never
 * a Vercel deployment hostname, which changes with every deploy and would leave
 * every installed copy of the app pointing at an old build.
 */
export function resolveNativeOrigin(value?: string | null): string {
  const candidate = (value ?? '').trim() || DEFAULT_NATIVE_ORIGIN
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new Error(`Native origin is not a URL: ${candidate}`)
  }
  if (url.protocol !== 'https:') throw new Error('The native app loads ABC over https only')
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('The native origin must be a bare origin, with no path, query or credentials')
  }
  if (/\.vercel\.app$/i.test(url.hostname)) {
    throw new Error('The native origin must not be a Vercel deployment hostname')
  }
  return url.origin
}
