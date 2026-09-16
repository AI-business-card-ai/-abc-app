import { NextResponse, type NextRequest } from 'next/server'
import { nativePlatformFromHeaders } from '@/lib/native/runtime'

/**
 * The web connect routes decline the native app.
 *
 * Every web connector proves two things at its callback before it stores a
 * token: a signed, single-use state cookie naming the ABC account that started
 * the flow, and a live ABC session belonging to that same account. Inside the
 * app, the provider's consent screen has to open in the system browser — Google
 * refuses embedded WebViews, and the WebView hands every non-ABC address to the
 * system anyway — and the callback then lands in that browser, which holds
 * neither. A web flow started from the app could never finish, so it is not
 * started.
 *
 * The app connects through its own flow instead (lib/connectors/native.ts):
 * owner, provider and a device nonce bound server-side at the start, the result
 * claimed back inside the app with that nonce and a handoff only the consenting
 * device receives. The app's shell sends every Connect link there, so this
 * refusal is reached only by a navigation that bypassed it; it returns the app
 * to Integrations, which asks the owner to tap Connect again.
 */

export const NATIVE_CONNECT_UNAVAILABLE_PATH = '/settings/integrations?native=connect-unavailable'

export function refuseNativeConnect(request: NextRequest): NextResponse | null {
  if (!nativePlatformFromHeaders(request.headers)) return null
  return NextResponse.redirect(new URL(NATIVE_CONNECT_UNAVAILABLE_PATH, request.url))
}
