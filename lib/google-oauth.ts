import type { Session, SupabaseClient } from '@supabase/supabase-js'

export const GOOGLE_GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send'

export function getGoogleOAuthRedirectTo(nextPath = '/dashboard') {
  // Always use the browser origin so PKCE cookies match the callback domain.
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const base = appUrl || ''
  return `${base}/auth/callback?next=${encodeURIComponent(nextPath)}`
}

export async function signInWithGoogle(
  supabase: SupabaseClient,
  nextPath = '/dashboard'
) {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getGoogleOAuthRedirectTo(nextPath),
      scopes: GOOGLE_GMAIL_SCOPE,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
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
