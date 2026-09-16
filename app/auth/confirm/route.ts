import { NextResponse, type NextRequest } from 'next/server'
import { AUTH_ERROR_CODES, type AuthErrorCode } from '@/lib/auth/error-codes'
import { emailLinkDestination, parseEmailLink } from '@/lib/auth/email-link'
import { resolveSignInDestination } from '@/lib/auth/sign-in-destination'
import { createOAuthCallbackClient } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Where email links land: sign-up confirmation, password recovery, invitations,
 * magic links and email changes. See lib/auth/email-link.ts for why these are
 * verified by token hash rather than exchanged as PKCE codes.
 *
 * The link is checked for shape, verified by Supabase on the server, and only
 * then is a session written — onto this response, for the browser or app that
 * opened it. The token hash is never logged, never echoed into a redirect, and
 * never reaches a page: every refusal lands on /login with one stable code.
 *
 * A recovery link stops at the reset screen. Everything else is a sign-in and
 * ends where every other sign-in ends, through resolveSignInDestination.
 *
 * Requires the Supabase email templates to point here; until they do, emails
 * keep using /auth/callback, which is unchanged. docs/auth-email-links.md has
 * the exact template URLs.
 */

export const dynamic = 'force-dynamic'

/** Nothing about a verification is cached, and the link is not passed on as a referrer. */
function secured<T extends Response>(response: T): T {
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}

/** `stage` is fixed vocabulary for the server log. Never the token hash, never a provider message. */
function refuse(origin: string, code: AuthErrorCode, stage: string) {
  console.error('[auth/confirm] refused:', code, stage)
  return secured(NextResponse.redirect(`${origin}/login?error=auth&reason=${code}`))
}

export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url)
  const link = parseEmailLink(request.nextUrl.searchParams)
  if (!link.ok) return refuse(origin, AUTH_ERROR_CODES.emailLinkInvalid, link.reason)

  try {
    const { supabase, redirectWithAuthCookies } = createOAuthCallbackClient(request)

    const { data, error } = await supabase.auth.verifyOtp({ type: link.type, token_hash: link.tokenHash })
    if (error || !data?.user || !data.session) {
      return refuse(origin, AUTH_ERROR_CODES.emailLinkInvalid, `verify_failed_${error?.status ?? 'no_session'}`)
    }

    const user = data.user
    const destination = emailLinkDestination(link.type, link.next)

    if (link.type === 'recovery' || link.type === 'email_change') {
      return secured(redirectWithAuthCookies(`${origin}${destination}`))
    }

    const outcome = await resolveSignInDestination({
      supabase,
      createService: createServiceClient,
      user: { id: user.id, email: user.email ?? null },
      next: destination,
      googleLogin: false,
      logPrefix: '[auth/confirm]',
    })
    if (!outcome.ok) return refuse(origin, outcome.code, 'destination_failed')

    return secured(redirectWithAuthCookies(`${origin}${outcome.destination}`))
  } catch (err) {
    return refuse(origin, AUTH_ERROR_CODES.unexpected, `unexpected_${err instanceof Error ? err.constructor.name : 'error'}`)
  }
}
