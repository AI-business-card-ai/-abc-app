import { NextRequest, NextResponse } from 'next/server'
import { AUTH_ERROR_CODES, type AuthErrorCode } from '@/lib/auth/error-codes'
import { resolveSignInDestination } from '@/lib/auth/sign-in-destination'
import { isGoogleUser } from '@/lib/google-oauth'
import { exchangeNativeAuthCode, nativeNonceMatches, openNativeAuthFlow } from '@/lib/native/auth-flow'
import { NATIVE_AUTH_CODE_PATTERN } from '@/lib/native/deep-link'
import { handleQrConnect } from '@/lib/qr-connect'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Finish a native Google or Apple sign-in, from inside the app's WebView. See
 * lib/native/auth-flow.ts for the whole flow.
 *
 * Three proofs, in order, before anything reaches Supabase: the flow is ours,
 * unaltered and unexpired; the nonce behind its hash is presented, which only
 * the app that started the flow holds; and the code exchanges against the
 * verifier sealed inside it. Only then is the session written — onto this
 * response, which is the WebView's, so the app is signed in and no browser is.
 *
 * Every refusal answers with a stable code the login page already knows how to
 * word, and nothing else.
 */

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

function refuse(code: AuthErrorCode, status: number, detail: string) {
  console.error('[auth/native/complete] refused:', code, detail)
  return NextResponse.json({ code }, { status, headers: NO_STORE })
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { code?: unknown; flow?: unknown; nonce?: unknown } | null

  if (!body || typeof body.code !== 'string' || !NATIVE_AUTH_CODE_PATTERN.test(body.code)) {
    return refuse(AUTH_ERROR_CODES.missingCode, 400, 'code missing or malformed')
  }

  const opened = openNativeAuthFlow(typeof body.flow === 'string' ? body.flow : null)
  if (!opened.ok) {
    return opened.reason === 'not_configured'
      ? refuse(AUTH_ERROR_CODES.unexpected, 503, 'native sign-in is not configured')
      : refuse(AUTH_ERROR_CODES.exchangeFailed, 400, `flow ${opened.reason}`)
  }

  if (!nativeNonceMatches(body.nonce, opened.flow.nonceHash)) {
    return refuse(AUTH_ERROR_CODES.exchangeFailed, 400, 'nonce does not match the flow')
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return refuse(AUTH_ERROR_CODES.unexpected, 503, 'supabase is not configured')

  try {
    const exchanged = await exchangeNativeAuthCode({
      supabaseUrl,
      anonKey,
      code: body.code,
      verifier: opened.flow.verifier,
    })
    if (!exchanged.ok) return refuse(AUTH_ERROR_CODES.exchangeFailed, 400, `code exchange failed (${exchanged.status})`)

    const supabase = createRouteHandlerClient()
    const { data, error } = await supabase.auth.setSession({
      access_token: exchanged.accessToken,
      refresh_token: exchanged.refreshToken,
    })
    if (error || !data.user) {
      return refuse(AUTH_ERROR_CODES.sessionFailed, 400, error?.message ?? 'no user after setting the session')
    }

    const user = data.user
    console.log('[auth/native/complete] session established', {
      userId: user.id,
      provider: user.app_metadata?.provider ?? null,
    })

    if (opened.flow.connect) {
      // The same "Join ABC" contact the web callback saves. Fire-and-forget.
      const newUserName =
        (user.user_metadata?.full_name as string | undefined) ||
        (user.user_metadata?.name as string | undefined) ||
        user.email ||
        null
      handleQrConnect(user.id, newUserName, opened.flow.connect).catch((err) =>
        console.error('[auth/native/complete] qr-connect failed:', err)
      )
    }

    const outcome = await resolveSignInDestination({
      supabase,
      createService: createServiceClient,
      user: { id: user.id, email: user.email ?? null },
      next: opened.flow.next,
      googleLogin: isGoogleUser(user),
      logPrefix: '[auth/native/complete]',
    })
    if (!outcome.ok) return refuse(outcome.code, 400, outcome.detail)

    return NextResponse.json({ redirect: outcome.destination }, { headers: NO_STORE })
  } catch (err) {
    return refuse(AUTH_ERROR_CODES.unexpected, 500, err instanceof Error ? err.message : 'unexpected failure')
  }
}
