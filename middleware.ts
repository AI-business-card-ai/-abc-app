import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { webCheckoutAvailable } from '@/lib/billing/commerce'
import { nativePlatformFromHeaders } from '@/lib/native/runtime'

  const ONBOARDING_EXEMPT = [
    '/onboarding',
    '/login',
    '/register',
    // Recovery has to work for an account that never finished onboarding —
    // otherwise the gate below sends someone with a valid reset link to
    // /onboarding instead of letting them set their password.
    '/forgot-password',
    '/reset-password',
    '/',
    '/settings',
    '/profile',
    '/pricing',
    '/offline',
    // Deleting an account has to work for one that never finished onboarding
    // too: nobody should have to fill in a profile in order to remove it.
    '/settings/account/delete',
    '/account-deletion',
  ]

function withCookieDefaults(options: CookieOptions = {}): CookieOptions {
  return {
    ...options,
    path: options.path ?? '/',
    sameSite: options.sameSite ?? 'lax',
    secure: options.secure ?? process.env.NODE_ENV === 'production',
  }
}

export async function middleware(req: NextRequest) {
  /*
    The store apps do not offer the web checkout (lib/billing/commerce.ts), and
    the pricing pages are nothing but that checkout and its return screens. The
    app is taken to Plan & Billing instead, which reports the plan and says
    purchases are not available in the app.
  */
  const { pathname: requestedPath } = req.nextUrl
  if (
    (requestedPath === '/pricing' || requestedPath.startsWith('/pricing/')) &&
    !webCheckoutAvailable(nativePlatformFromHeaders(req.headers))
  ) {
    return NextResponse.redirect(new URL('/settings/billing', req.url))
  }

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
            response.cookies.set(name, value, withCookieDefaults(options))
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = req.nextUrl.pathname

  const protectedRoutes = [
    '/home',
    '/my-card',
    '/scan',
    '/contacts',
    '/follow-ups',
    '/events',
    '/chat',
    '/settings',
    '/profile',
    '/pipeline',
    '/onboarding',
    '/dashboard',
  ]
  const isProtected = protectedRoutes.some((r) => pathname.startsWith(r))

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const isOnboardingExempt =
    ONBOARDING_EXEMPT.includes(pathname) ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/card') ||
    pathname.startsWith('/u/') ||
    pathname.startsWith('/d/') ||
    pathname.startsWith('/privacy') ||
    pathname.startsWith('/terms') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next')

  if (user && !isOnboardingExempt) {
    const { data: profile } = await supabase
      .from('abc_profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.onboarding_completed) {
      return NextResponse.redirect(new URL('/onboarding', req.url))
    }
  }

  return response
}

/*
  Static files and service-worker infrastructure skip the middleware.

  The worker fetches these while it installs: it precaches the public images
  and loads its helper scripts with importScripts. Run through the onboarding
  gate, a signed-in account that has not finished onboarding got a redirect to
  /onboarding instead of the file, which failed the worker's install (a script
  that is really HTML) or stored the onboarding page under an image URL.
*/
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|icon.svg|icons/|hero/|wallet/|sw.js|sw-cache-cleanup.js|workbox-|swe-worker-|fallback-|manifest.json|offline).*)',
  ],
}
