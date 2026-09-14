import { NATIVE_USER_AGENT_MARKER } from '@/lib/native/config'

/**
 * Web or native: the one place ABC asks.
 *
 * Two questions with two answers, kept side by side so neither drifts:
 *
 * - In the browser, `getNativePlatform()` reads the Capacitor bridge the native
 *   shell injects into its WebView. There is no bridge on the web, in an
 *   installed PWA or during server rendering, so all three are "not native".
 * - On the server, `nativePlatformFromUserAgent()` reads the marker the shell
 *   appends to its WebView's user agent. A user agent says whatever the client
 *   wants it to, so this decides what to show and which web-only flows to
 *   decline. It never decides who anybody is or what they are allowed to do.
 *
 * Nothing else in the app reads `window.Capacitor` or inspects the user agent
 * for this.
 */

export type NativePlatform = 'ios' | 'android'

type CapacitorBridge = {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
}

export function getNativePlatform(): NativePlatform | null {
  if (typeof window === 'undefined') return null
  const bridge = (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor
  if (!bridge?.isNativePlatform?.()) return null
  const platform = bridge.getPlatform?.()
  return platform === 'ios' || platform === 'android' ? platform : null
}

export function isNativeApp(): boolean {
  return getNativePlatform() !== null
}

const MARKER = new RegExp(`(?:^|\\s)${NATIVE_USER_AGENT_MARKER}/(ios|android)(?:\\s|$)`)

export function nativePlatformFromUserAgent(userAgent: string | null | undefined): NativePlatform | null {
  const match = MARKER.exec(userAgent ?? '')
  return match ? (match[1] as NativePlatform) : null
}

export function nativePlatformFromHeaders(headers: { get(name: string): string | null }): NativePlatform | null {
  return nativePlatformFromUserAgent(headers.get('user-agent'))
}
