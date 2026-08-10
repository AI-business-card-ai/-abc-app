import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

function withCookieDefaults(options: CookieOptions = {}): CookieOptions {
  return {
    ...options,
    path: options.path ?? '/',
    sameSite: options.sameSite ?? 'lax',
    secure: options.secure ?? process.env.NODE_ENV === 'production',
  }
}

/** Cookie-based Supabase client for Server Components / Route Handlers (user session). */
export function createServerComponentClient() {
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
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, withCookieDefaults(options))
            )
          } catch {
            // Called from a Server Component — middleware refreshes the session.
          }
        },
      },
    }
  )
}
