import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ONBOARDING_EXEMPT = ['/onboarding', '/login', '/register', '/', '/settings', '/profile', '/pricing']

export async function middleware(req: NextRequest) {
  let response = NextResponse.next({ request: req })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          response = NextResponse.next({ request: req })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  const pathname = req.nextUrl.pathname

  const protectedRoutes = ['/scan', '/contacts', '/contact', '/chat', '/settings', '/profile', '/pipeline', '/onboarding', '/dashboard']
  const isProtected = protectedRoutes.some((r) => pathname.startsWith(r))

  if (isProtected && !session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const isOnboardingExempt =
    ONBOARDING_EXEMPT.includes(pathname) ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next')

  if (session && !isOnboardingExempt) {
    const { data: profile } = await supabase
      .from('abc_profiles')
      .select('onboarding_completed')
      .eq('id', session.user.id)
      .maybeSingle()

    if (!profile?.onboarding_completed) {
      return NextResponse.redirect(new URL('/onboarding', req.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
