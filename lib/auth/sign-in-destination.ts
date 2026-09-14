import type { SupabaseClient } from '@supabase/supabase-js'
import { AUTH_ERROR_CODES, type AuthErrorCode } from '@/lib/auth/error-codes'

/**
 * Where somebody goes once a sign-in has produced a session, and the profile a
 * first sign-in needs.
 *
 * Shared by the web callback (/auth/callback) and the native completion
 * (/api/auth/native/complete). Both must end the same way — an existing account
 * lands where it asked to go, or on onboarding if it never finished it; a first
 * sign-in gets its abc_profiles row and starts onboarding — and one
 * implementation is what keeps them from ever disagreeing about it.
 */

export type SignInDestination =
  | { ok: true; destination: string }
  | { ok: false; code: AuthErrorCode; detail: string }

type ProfileClient = Pick<SupabaseClient, 'from'>

export async function resolveSignInDestination(args: {
  /** The signed-in user's own client: the profile is read under row-level security. */
  supabase: ProfileClient
  /** The service role, for the one insert a brand-new account needs. Created only then. */
  createService: () => ProfileClient
  user: { id: string; email: string | null }
  /** Already checked to be a local path. */
  next: string
  googleLogin: boolean
  logPrefix: string
}): Promise<SignInDestination> {
  const { user, logPrefix } = args

  console.log(`${logPrefix} checking abc_profiles row`, { userId: user.id })

  const { data: profile, error: profileSelectError } = await args.supabase
    .from('abc_profiles')
    .select('id, onboarding_completed')
    .eq('id', user.id)
    .maybeSingle()

  if (profileSelectError) {
    console.error(`${logPrefix} profile select failed (possible RLS issue)`, {
      message: profileSelectError.message,
      code: profileSelectError.code,
      details: profileSelectError.details,
      hint: profileSelectError.hint,
    })
    return { ok: false, code: AUTH_ERROR_CODES.profileFailed, detail: profileSelectError.message }
  }

  console.log(`${logPrefix} profile lookup result`, {
    profileExists: Boolean(profile),
    onboardingCompleted: profile?.onboarding_completed ?? null,
  })

  if (!profile) {
    console.log(`${logPrefix} creating abc_profiles via service role`, {
      userId: user.id,
      googleLogin: args.googleLogin,
    })

    const { error: insertError } = await args.createService().from('abc_profiles').insert({
      id: user.id,
      email: user.email,
      /*
        A new profile carries no mailbox. Signing in with Google is not
        permission to send mail as them, and the tokens a sign-in returns
        cannot send anyway — the connector fills these in later, for whoever
        actually authorizes a mailbox.
      */
      google_connected: false,
      google_email: null,
      google_refresh_token: null,
      google_access_token: null,
      onboarding_completed: false,
    })

    if (insertError) {
      console.error(`${logPrefix} profile insert failed`, {
        message: insertError.message,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint,
      })

      if (insertError.code === '23505') {
        console.log(`${logPrefix} profile already exists (race with trigger), redirecting to onboarding`)
        return { ok: true, destination: '/onboarding' }
      }

      return { ok: false, code: AUTH_ERROR_CODES.profileFailed, detail: insertError.message }
    }

    console.log(`${logPrefix} profile created, redirecting to onboarding (new profile)`)
    return { ok: true, destination: '/onboarding' }
  }

  const destination = profile.onboarding_completed ? args.next : '/onboarding'
  console.log(`${logPrefix} redirecting to final destination`, { destination })
  return { ok: true, destination }
}
