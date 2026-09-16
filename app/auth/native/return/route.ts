import { NextRequest } from 'next/server'
import { openNativeAuthFlow } from '@/lib/native/auth-flow'
import { NATIVE_AUTH_CALLBACK_URL, NATIVE_AUTH_CODE_PATTERN } from '@/lib/native/deep-link'
import { nativeHandbackPage } from '@/lib/native/handback-page'

/**
 * Where the system browser lands after a native sign-in, and the hand back into
 * the app.
 *
 * This page completes nothing. It checks that the flow is one of ours and still
 * live, then passes the code and flow to the app's URL scheme, where the app
 * finishes the sign-in with the nonce only it holds. A link to this page crafted
 * by somebody else can therefore get as far as opening the app, and no further.
 *
 * The page itself is lib/native/handback-page.ts, shared with the connector callbacks.
 */

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const flow = params.get('flow')
  const code = params.get('code')
  const providerError = params.get('error')

  const target = new URL(NATIVE_AUTH_CALLBACK_URL)
  const opened = openNativeAuthFlow(flow)

  if (providerError) {
    target.searchParams.set('error', providerError === 'access_denied' ? 'cancelled' : 'failed')
  } else if (!opened.ok || !code || !NATIVE_AUTH_CODE_PATTERN.test(code) || !flow) {
    console.error('[auth/native/return] refused:', opened.ok ? 'code missing or malformed' : `flow ${opened.reason}`)
    target.searchParams.set('error', 'failed')
  } else {
    target.searchParams.set('code', code)
    target.searchParams.set('flow', flow)
  }

  return returnPage(target.toString())
}

function returnPage(appUrl: string) {
  return nativeHandbackPage(appUrl, 'Your sign-in continues in the app.')
}
