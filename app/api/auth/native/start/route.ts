import { NextRequest, NextResponse } from 'next/server'
import {
  NATIVE_FLOW_TTL_SECONDS,
  NATIVE_NONCE_PATTERN,
  buildNativeAuthorizeUrl,
  createPkcePair,
  isNativeAuthConfigured,
  isNativeAuthProvider,
  nativeAuthReturnOrigin,
  safeConnectUserId,
  safeNativeNextPath,
  sealNativeAuthFlow,
} from '@/lib/native/auth-flow'
import { NATIVE_AUTH_RETURN_PATH } from '@/lib/native/deep-link'

/**
 * Start a native Google or Apple sign-in. See lib/native/auth-flow.ts.
 *
 * The request names a provider, where to land and the hash of a nonce the app
 * keeps. Nothing here is secret on the way out: the verifier travels sealed, and
 * the answer is an authorize URL for the system browser.
 */

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(request: NextRequest) {
  const origin = nativeAuthReturnOrigin(process.env.NEXT_PUBLIC_APP_URL)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!isNativeAuthConfigured() || !origin || !supabaseUrl) {
    console.error('[auth/native/start] native sign-in is not configured')
    return NextResponse.json({ code: 'native_auth_unavailable' }, { status: 503, headers: NO_STORE })
  }

  const body = (await request.json().catch(() => null)) as {
    provider?: unknown
    next?: unknown
    nonceHash?: unknown
    connect?: unknown
  } | null

  if (
    !body ||
    !isNativeAuthProvider(body.provider) ||
    typeof body.nonceHash !== 'string' ||
    !NATIVE_NONCE_PATTERN.test(body.nonceHash)
  ) {
    return NextResponse.json({ code: 'invalid_request' }, { status: 400, headers: NO_STORE })
  }

  const { verifier, challenge } = createPkcePair()
  const flow = sealNativeAuthFlow({
    provider: body.provider,
    verifier,
    nonceHash: body.nonceHash,
    next: safeNativeNextPath(body.next),
    connect: safeConnectUserId(body.connect),
    expiresAt: Math.floor(Date.now() / 1000) + NATIVE_FLOW_TTL_SECONDS,
  })

  const redirectTo = `${origin}${NATIVE_AUTH_RETURN_PATH}?flow=${encodeURIComponent(flow)}`
  return NextResponse.json(
    { authorizeUrl: buildNativeAuthorizeUrl({ supabaseUrl, provider: body.provider, redirectTo, challenge }) },
    { headers: NO_STORE }
  )
}
