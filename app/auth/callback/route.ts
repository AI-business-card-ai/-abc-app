import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'
import { isGoogleUser } from '@/lib/google-oauth'
import { saveGoogleOAuthTokens } from '@/lib/google-gmail-auth'
import { formatSupabaseError } from '@/lib/supabase-errors'

function authErrorRedirect(origin: string, reason: string) {
  console.error('[auth/callback] redirecting to login:', reason)
  return NextResponse.redirect(
    `${origin}/login?error=auth&reason=${encodeURIComponent(reason)}`
  )
}

function summarizeToken(value: string | null | undefined) {
  if (!value) return 'missing'
  return `present (${value.length} chars)`
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'

  console.log('[auth/callback] request received', {
    hasCode: Boolean(code),
    next: safeNext,
    origin,
  })

  if (!code) {
    return authErrorRedirect(origin, 'missing_oauth_code')
  }

  try {
    const supabase = createRouteHandlerClient()
    console.log('[auth/callback] exchanging OAuth code for session')

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      console.error('[auth/callback] exchangeCodeForSession failed', {
        message: exchangeError.message,
        status: exchangeError.status,
        name: exchangeError.name,
      })
      return authErrorRedirect(origin, `exchange_failed:${exchangeError.message}`)
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
      return authErrorRedirect(origin, `get_user_failed:${userError.message}`)
    }

    if (!user) {
      console.error('[auth/callback] no user after successful session exchange')
      return authErrorRedirect(origin, 'user_missing_after_exchange')
    }

    console.log('[auth/callback] authenticated user loaded', {
      userId: user.id,
      email: user.email ?? null,
      provider: user.app_metadata?.provider ?? null,
    })

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) {
      console.error('[auth/callback] getSession failed', {
        message: sessionError.message,
        status: sessionError.status,
      })
      return authErrorRedirect(origin, `get_session_failed:${sessionError.message}`)
    }

    const googleLogin = isGoogleUser(user)
    const googleEmail = user.email ?? null

    console.log('[auth/callback] session loaded', {
      hasSession: Boolean(session),
      googleLogin,
      providerToken: summarizeToken(session?.provider_token),
      providerRefreshToken: summarizeToken(session?.provider_refresh_token),
    })

    console.log('[auth/callback] checking abc_profiles row', { userId: user.id })

    const { data: profile, error: profileSelectError } = await supabase
      .from('abc_profiles')
      .select('id, onboarding_completed')
      .eq('id', user.id)
      .maybeSingle()

    if (profileSelectError) {
      console.error('[auth/callback] profile select failed (possible RLS issue)', {
        message: profileSelectError.message,
        code: profileSelectError.code,
        details: profileSelectError.details,
        hint: profileSelectError.hint,
      })
      return authErrorRedirect(origin, `profile_select_failed:${profileSelectError.message}`)
    }

    console.log('[auth/callback] profile lookup result', {
      profileExists: Boolean(profile),
      onboardingCompleted: profile?.onboarding_completed ?? null,
    })

    const serviceClient = createServiceClient()

    if (!profile) {
      console.log('[auth/callback] creating abc_profiles via service role', {
        userId: user.id,
        googleLogin,
        providerRefreshToken: summarizeToken(session?.provider_refresh_token),
      })

      const { error: insertError } = await serviceClient.from('abc_profiles').insert({
        id: user.id,
        email: googleEmail,
        google_connected: googleLogin,
        google_email: googleLogin ? googleEmail : null,
        google_refresh_token: googleLogin ? session?.provider_refresh_token ?? null : null,
        google_access_token: googleLogin ? session?.provider_token ?? null : null,
        onboarding_completed: false,
      })

      if (insertError) {
        console.error('[auth/callback] profile insert failed', {
          message: insertError.message,
          code: insertError.code,
          details: insertError.details,
          hint: insertError.hint,
        })

        if (insertError.code === '23505') {
          console.log('[auth/callback] profile already exists (race with trigger), continuing with token save')
          if (googleLogin) {
            try {
              await saveGoogleOAuthTokens(user.id, {
                accessToken: session?.provider_token,
                refreshToken: session?.provider_refresh_token,
                email: googleEmail,
              })
              console.log('[auth/callback] google tokens saved after duplicate-profile race')
            } catch (tokenError) {
              const message = formatSupabaseError(tokenError)
              console.error('[auth/callback] google token save failed after duplicate-profile race', {
                message,
                raw: tokenError,
              })
              return authErrorRedirect(origin, `google_token_save_failed:${message}`)
            }
          }
          console.log('[auth/callback] redirecting to onboarding after duplicate-profile race')
          return NextResponse.redirect(`${origin}/onboarding`)
        }

        return authErrorRedirect(origin, `profile_insert_failed:${insertError.message}`)
      }

      console.log('[auth/callback] profile created with google tokens', {
        googleRefreshToken: summarizeToken(session?.provider_refresh_token),
      })
      console.log('[auth/callback] redirecting to onboarding (new profile)')
      return NextResponse.redirect(`${origin}/onboarding`)
    }

    if (googleLogin) {
      console.log('[auth/callback] saving Google OAuth tokens via service role', {
        userId: user.id,
        providerRefreshToken: summarizeToken(session?.provider_refresh_token),
      })

      try {
        await saveGoogleOAuthTokens(user.id, {
          accessToken: session?.provider_token,
          refreshToken: session?.provider_refresh_token,
          email: googleEmail,
        })
      } catch (tokenError) {
        const message = formatSupabaseError(tokenError)
        console.error('[auth/callback] saveGoogleOAuthTokens failed', {
          message,
          userId: user.id,
          raw: tokenError,
        })
        return authErrorRedirect(origin, `google_token_save_failed:${message}`)
      }

      console.log('[auth/callback] google tokens saved to abc_profiles', {
        googleRefreshToken: summarizeToken(session?.provider_refresh_token),
      })
    } else {
      console.log('[auth/callback] non-Google login, skipping google token save')
    }

    const destination = profile.onboarding_completed ? safeNext : '/onboarding'
    console.log('[auth/callback] redirecting to final destination', { destination })
    return NextResponse.redirect(`${origin}${destination}`)
  } catch (err) {
    const message = formatSupabaseError(err)
    console.error('[auth/callback] unhandled error', err)
    return authErrorRedirect(origin, `unhandled:${message}`)
  }
}
