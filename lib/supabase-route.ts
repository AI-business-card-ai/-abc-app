import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

function withCookieDefaults(options: CookieOptions = {}): CookieOptions {
  return {
    ...options,
    path: options.path ?? '/',
    sameSite: options.sameSite ?? 'lax',
    secure: options.secure ?? process.env.NODE_ENV === 'production',
  }
}

export function createRouteHandlerClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, withCookieDefaults(options))
          })
        },
      },
    }
  )
}

/**
 * OAuth callback must read PKCE cookies from the incoming request and write
 * session cookies onto the outgoing redirect response.
 */
export function createOAuthCallbackClient(request: NextRequest) {
  let cookieCarrier = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            cookieCarrier.cookies.set(name, value, withCookieDefaults(options))
          })
        },
      },
    }
  )

  function redirectWithAuthCookies(url: string | URL) {
    const redirect = NextResponse.redirect(url)
    cookieCarrier.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie.name, cookie.value)
    })
    return redirect
  }

  return { supabase, redirectWithAuthCookies }
}

export function getPkceCookieDebugInfo(request: NextRequest) {
  return request.cookies.getAll().map((cookie) => ({
    name: cookie.name,
    hasValue: Boolean(cookie.value),
    looksLikePkce:
      cookie.name.includes('code-verifier')
      || cookie.name.includes('auth-token')
      || cookie.name.startsWith('sb-'),
  }))
}
