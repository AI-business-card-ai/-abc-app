import { normalizeAbcProfile, stripProfileSecrets, PROFILE_SAFE_COLUMNS } from '@/lib/profile-defaults'
import { createServerComponentClient } from '@/lib/supabase-server'
import type { ABCProfile } from '@/lib/types'

/**
 * The profile row every settings page starts from.
 *
 * Written once because five pages now need it and five copies of a query that
 * selects credential columns is five chances to forget the stripping step. The
 * row is normalized and stripped here, before it can become a client component
 * prop — `PROFILE_SAFE_COLUMNS` selects the whole profile, and the whole
 * profile includes OAuth tokens.
 *
 * Returns null only when there is no session; the middleware already keeps
 * signed-out visitors away from these routes, so the pages treat null as
 * "render nothing" rather than as an error.
 */
export async function loadSettingsProfile(): Promise<Partial<ABCProfile> | null> {
  const supabase = createServerComponentClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data, error } = await supabase
    .from('abc_profiles')
    .select(PROFILE_SAFE_COLUMNS)
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    console.error('[settings] abc_profiles query failed:', error)
  }

  return stripProfileSecrets(normalizeAbcProfile((data ?? {}) as Partial<ABCProfile>, user.email))
}
