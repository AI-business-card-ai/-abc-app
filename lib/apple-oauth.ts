import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getOAuthCallbackUrl } from '@/lib/auth/redirect'

/**
 * Sign in with Apple.
 *
 * Identity only, and identity is all ABC wants from Apple — there is no Apple
 * API to integrate with here, so nothing to persist beyond the account itself.
 * That makes this the smaller sibling of the Google sign-in: same Supabase
 * provider mechanism, same canonical callback, no scopes, no tokens.
 *
 * Two things about Apple are worth knowing before reading the callback:
 *
 * Apple sends the person's name on the *first* authorization and never again.
 * ABC is unaffected, because the callback has never derived profile identity
 * from a provider — a new profile is created with no name and onboarding step
 * one asks for it. A repeat Apple login therefore has nothing to erase.
 *
 * Apple may also return a relay address ending @privaterelay.appleid.com when
 * somebody chooses Hide My Email. That is a real, verified, forwarding address
 * and a perfectly good identity; it simply is not the address they type
 * elsewhere. Nothing here treats it differently, and nothing should.
 */

export const APPLE_PROVIDER = 'apple' as const

/** Apple's relay domain, for describing an address rather than gating on it. */
const APPLE_RELAY_DOMAIN = '@privaterelay.appleid.com'

export async function signInWithApple(
  supabase: SupabaseClient,
  nextPath = '/dashboard',
  /*
    Carried for the same reason Google carries it: somebody who scans a card and
    then chooses Apple should get the card owner saved as a contact, exactly as
    they would signing up with Google. Omitting it would make the viral loop
    quietly depend on which button was pressed.
  */
  connectUserId?: string
) {
  return supabase.auth.signInWithOAuth({
    provider: APPLE_PROVIDER,
    options: {
      redirectTo: getOAuthCallbackUrl(nextPath, connectUserId),
    },
  })
}

export function isAppleUser(user: Pick<User, 'app_metadata'> | null | undefined): boolean {
  if (!user) return false
  const provider = user.app_metadata?.provider
  const providers = user.app_metadata?.providers as string[] | undefined
  return provider === APPLE_PROVIDER || providers?.includes(APPLE_PROVIDER) === true
}

/**
 * Whether an address is one of Apple's forwarding aliases.
 *
 * Informational only — for wording a screen, never for deciding whether a
 * sign-in counts. A relay address is a valid identity, and code that refuses
 * one is code that refuses a supported way of using Apple.
 */
export function isApplePrivateRelayEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.toLowerCase().endsWith(APPLE_RELAY_DOMAIN)
}
