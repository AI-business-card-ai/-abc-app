import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { getOAuthCallbackUrl } from '@/lib/auth/redirect'

/**
 * Two different things ABC asks Google for, kept apart.
 *
 * Signing in is a question about identity: who is this person. Sending a
 * follow-up from their own mailbox is a question about permission, and a much
 * bigger one — Google classes `gmail.send` as a sensitive scope, which means a
 * consent screen that names it and a verification review before the public can
 * grant it.
 *
 * These used to be one call. Every sign-in asked for permission to send mail as
 * the user, whether or not they would ever use the feature, and forced a fresh
 * consent screen each time. So the question people actually answered at the
 * login button was not "is this you" but "may this app send email as you",
 * which is the wrong question to ask at the door.
 *
 * Identity is now the plain default, and this file holds only that. Asking for
 * the mailbox is an integration rather than a sign-in and lives in
 * `lib/google/gmail-connect.ts` with the other connectors — using a sign-in
 * primitive for it let a different Google account at the chooser take over the
 * ABC session, which is not a risk worth carrying for a shorter import path.
 */

export const GOOGLE_GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send'

/**
 * Kept as the name Google's callers already use; the construction itself moved
 * to `lib/auth/redirect` when Apple needed the same thing, so there is one
 * builder rather than one per provider.
 */
export function getGoogleOAuthRedirectTo(nextPath = '/dashboard', connectUserId?: string) {
  return getOAuthCallbackUrl(nextPath, connectUserId)
}

/**
 * Sign in. Identity only.
 *
 * No `scopes`, so Supabase asks for its defaults — openid, email, profile. No
 * `access_type: 'offline'`, because a sign-in has nothing to do offline. No
 * `prompt: 'consent'`, because re-consenting on every login is friction that
 * buys nothing once a grant exists.
 */
export async function signInWithGoogle(
  supabase: SupabaseClient,
  nextPath = '/dashboard',
  connectUserId?: string
) {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getGoogleOAuthRedirectTo(nextPath, connectUserId),
    },
  })
}

export function isGoogleProvider(session: Session | null): boolean {
  if (!session?.user) return false
  const provider = session.user.app_metadata?.provider
  const providers = session.user.app_metadata?.providers as string[] | undefined
  return provider === 'google' || providers?.includes('google') === true
}

export function isGoogleUser(user: { app_metadata?: Record<string, unknown> } | null | undefined): boolean {
  if (!user) return false
  const provider = user.app_metadata?.provider
  const providers = user.app_metadata?.providers as string[] | undefined
  return provider === 'google' || providers?.includes('google') === true
}

export function hasGmailAccess(session: Session | null): boolean {
  return Boolean(session?.provider_token && isGoogleProvider(session))
}

export function getGoogleAccountEmail(session: Session | null): string | null {
  if (!isGoogleProvider(session)) return null
  return session?.user.email ?? null
}
