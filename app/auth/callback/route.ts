import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { isGoogleUser } from '@/lib/google-oauth'
import { saveGoogleOAuthTokens } from '@/lib/google-gmail-auth'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  const supabase = createRouteHandlerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('OAuth callback error:', error)
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const googleLogin = isGoogleUser(user)
  const googleEmail = user.email ?? null

  const { data: profile } = await supabase
    .from('abc_profiles')
    .select('id, onboarding_completed')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) {
    await supabase.from('abc_profiles').insert({
      id: user.id,
      email: googleEmail,
      google_connected: googleLogin,
      google_email: googleLogin ? googleEmail : null,
      google_refresh_token: googleLogin ? session?.provider_refresh_token ?? null : null,
      google_access_token: googleLogin ? session?.provider_token ?? null : null,
      onboarding_completed: false,
    })
    return NextResponse.redirect(`${origin}/onboarding`)
  }

  if (googleLogin) {
    await saveGoogleOAuthTokens(user.id, {
      accessToken: session?.provider_token,
      refreshToken: session?.provider_refresh_token,
      email: googleEmail,
    })
  }

  const destination = profile.onboarding_completed ? safeNext : '/onboarding'
  return NextResponse.redirect(`${origin}${destination}`)
}
