import { NextResponse, type NextRequest } from 'next/server'
import { createOAuthCallbackClient, getPkceCookieDebugInfo } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'
import { isGoogleUser } from '@/lib/google-oauth'
import { AUTH_ERROR_CODES, type AuthErrorCode } from '@/lib/auth/error-codes'
import { resolveSignInDestination } from '@/lib/auth/sign-in-destination'
import { formatSupabaseError } from '@/lib/supabase-errors'
import { handleQrConnect } from '@/lib/qr-connect'

/**
 * `detail` is for the server log only. It never reaches the URL.
 */
function authErrorRedirect(origin: string, code: AuthErrorCode, detail?: unknown) {
  console.error('[auth/callback] redirecting to login:', code, detail ?? '')
  return NextResponse.redirect(`${origin}/login?error=auth&reason=${code}`)
}

function summarizeToken(value: string | null | undefined) {
  if (!value) return 'missing'
  return `present (${value.length} chars)`
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
  const connectUserId = searchParams.get('connect')

  /*
    Set by the reset email's redirect, and only ever compared to a literal —
    it selects a branch, it is never a destination. The recovery target is the
    fixed `/reset-password` below, so nothing from the URL can steer where the
    person lands.
  */
  const isRecovery = searchParams.get('flow') === 'recovery'

  console.log('[auth/callback] request received', {
    hasCode: Boolean(code),
    next: safeNext,
    origin,
    cookieSummary: getPkceCookieDebugInfo(request),
  })

  if (!code) {
    return authErrorRedirect(origin, AUTH_ERROR_CODES.missingCode)
  }

  const { supabase, redirectWithAuthCookies } = createOAuthCallbackClient(request)

  try {
    console.log('[auth/callback] exchanging OAuth code for session')

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      console.error('[auth/callback] exchangeCodeForSession failed', {
        message: exchangeError.message,
        status: exchangeError.status,
        name: exchangeError.name,
        cookieSummary: getPkceCookieDebugInfo(request),
      })
      return authErrorRedirect(origin, AUTH_ERROR_CODES.exchangeFailed, exchangeError.message)
    }

    console.log('[auth/callback] session exchange succeeded')

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) {
      console.error('[auth/callback] getUser failed', {
        message: userError.message,
        status: userError.status,
      })
      return authErrorRedirect(origin, AUTH_ERROR_CODES.userFailed, userError.message)
    }

    if (!user) {
      console.error('[auth/callback] no user after successful session exchange')
      return authErrorRedirect(origin, AUTH_ERROR_CODES.userFailed, 'user missing after exchange')
    }

    console.log('[auth/callback] authenticated user loaded', {
      userId: user.id,
      email: user.email ?? null,
      provider: user.app_metadata?.provider ?? null,
    })

    /*
      A password reset stops here.

      Everything below this point is sign-in bookkeeping: Google tokens, the
      "Join ABC" contact, creating a profile for a first-time account, and the
      rule that sends anyone with unfinished onboarding to /onboarding. None of
      it belongs to a recovery — the account already exists, and that last rule
      would send someone who abandoned onboarding to the wrong screen instead of
      letting them set the password they came here to set.

      The session from the exchange above is what proves the link was genuine,
      so it is carried through; the reset screen reads nothing from the URL.
    */
    if (isRecovery) {
      console.log('[auth/callback] recovery link exchanged, sending to reset')
      return redirectWithAuthCookies(`${origin}/reset-password`)
    }

    if (connectUserId) {
      // "Join ABC" viral loop — save the card owner as a contact in the new
      // user's account. Fire-and-forget: never blocks or fails the login.
      const newUserName =
        (user.user_metadata?.full_name as string | undefined) ||
        (user.user_metadata?.name as string | undefined) ||
        user.email ||
        null
      handleQrConnect(user.id, newUserName, connectUserId).catch((err) =>
        console.error('[auth/callback] qr-connect failed:', err)
      )
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) {
      console.error('[auth/callback] getSession failed', {
        message: sessionError.message,
        status: sessionError.status,
      })
      return authErrorRedirect(origin, AUTH_ERROR_CODES.sessionFailed, sessionError.message)
    }

    const googleLogin = isGoogleUser(user)
    // Whatever the provider gave us — a Google address, an Apple one, or one
    // of Apple's @privaterelay.appleid.com aliases. All are valid identities.
    const accountEmail = user.email ?? null

    console.log('[auth/callback] session loaded', {
      hasSession: Boolean(session),
      googleLogin,
      providerToken: summarizeToken(session?.provider_token),
      providerRefreshToken: summarizeToken(session?.provider_refresh_token),
    })

    /*
      No token handling here at all.

      Signing in asks for identity scopes only, so Google returns no refresh
      token and there is nothing a sign-in could usefully store. The mailbox is
      obtained by the connector at /api/auth/google-gmail, which proves both the
      signed state and the live session before it writes anything. Keeping a
      token-writing branch in this route would be unreachable code in the one
      place where "whose credentials are these" must never be ambiguous.

      What remains — the profile a first sign-in needs, and where to land — is
      shared with native sign-in, so the two can never treat an account
      differently.
    */
    const outcome = await resolveSignInDestination({
      supabase,
      createService: createServiceClient,
      user: { id: user.id, email: accountEmail },
      next: safeNext,
      googleLogin,
      logPrefix: '[auth/callback]',
    })

    if (!outcome.ok) return authErrorRedirect(origin, outcome.code, outcome.detail)
    return redirectWithAuthCookies(`${origin}${outcome.destination}`)
  } catch (err) {
    const message = formatSupabaseError(err)
    console.error('[auth/callback] unhandled error', err)
    return authErrorRedirect(origin, AUTH_ERROR_CODES.unexpected, message)
  }
}
