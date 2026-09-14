import { NextResponse, type NextRequest } from 'next/server'
import { nativePlatformFromHeaders } from '@/lib/native/runtime'

/**
 * Connecting Gmail or a CRM from inside the native app is declined, for now.
 *
 * Every connector proves two things at its callback before it stores a token: a
 * signed, single-use state cookie naming the ABC account that started the flow,
 * and a live ABC session belonging to that same account. Inside the app, the
 * provider's consent screen has to open in the system browser — Google refuses
 * embedded WebViews, and the WebView hands every non-ABC address to the system
 * anyway — and the callback then lands in that browser, which holds neither the
 * state cookie nor the session. Both proofs fail, correctly, and nothing is
 * connected.
 *
 * Relaxing either proof would reopen the attack they exist to stop: somebody
 * starts a connection for their own account and gets another person to finish
 * it, attaching that person's mailbox or CRM to the wrong account. The native
 * design that keeps both properties — completion claimed back inside the app
 * with a device-held secret, as native sign-in does — is recorded in the store
 * shell handoff and not built yet.
 *
 * Until it is, the start route sends the app back to Integrations, which says
 * why. Connections made on the web keep working in the app: their tokens live
 * on the server.
 */

export const NATIVE_CONNECT_UNAVAILABLE_PATH = '/settings/integrations?native=connect-unavailable'

export function refuseNativeConnect(request: NextRequest): NextResponse | null {
  if (!nativePlatformFromHeaders(request.headers)) return null
  return NextResponse.redirect(new URL(NATIVE_CONNECT_UNAVAILABLE_PATH, request.url))
}
