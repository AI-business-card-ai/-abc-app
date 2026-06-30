import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'

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

  const { data: profile } = await supabase
    .from('abc_profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .maybeSingle()

  const destination = profile?.onboarding_completed ? safeNext : '/onboarding'
  return NextResponse.redirect(`${origin}${destination}`)
}
