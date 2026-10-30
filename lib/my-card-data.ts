import { loadShowcaseItems, mapProfileToCardData } from '@/lib/card/public-data'
import { PROFILE_SAFE_COLUMNS } from '@/lib/profile-defaults'
import { createServerComponentClient } from '@/lib/supabase-server'
import {
  CARD_PUBLIC_BASE,
  normalizeCardEventRow,
  type CardLink,
  type DigitalCardData,
} from '@/lib/card/types'

export type MyCardData = {
  userId: string
  card: DigitalCardData
  /**
   * The real `card_slug` only. `card.slug` falls back to user_name / id so the
   * preview always renders — but only a real slug has a working public URL.
   */
  slug: string | null
  publicUrl: string | null
  published: boolean
}

export function publicCardUrl(slug: string): string {
  return `${CARD_PUBLIC_BASE}/${slug}`
}

/**
 * The authenticated user's own card. Read through the user session (RLS),
 * not the service role — this never reads anyone else's row.
 */
export async function getMyCard(): Promise<MyCardData | null> {
  const supabase = createServerComponentClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  /*
    One round trip, not two. Every read below is keyed by the user id alone, so
    none of them waits on the profile. They used to start only once the profile
    had arrived, which put a second full database round trip on My Card and on
    Home (which loads this card beside its dashboard) for every navigation.
    The profile is still checked first, before anything is built from the rest.
  */
  const [{ data: profileRow, error }, { data: links }, { data: events }, showcase] = await Promise.all([
    supabase
      .from('abc_profiles')
      .select(PROFILE_SAFE_COLUMNS)
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('card_links')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('card_events')
      .select('*')
      .eq('user_id', user.id)
      .order('date_from', { ascending: true }),
    // Only the count is shown here, and a missing table must not cost the
    // owner their card page.
    loadShowcaseItems(supabase, user.id),
  ])

  // Cast once, here: the column list is a runtime constant, so supabase-js cannot
  // infer the row shape from it the way it does for a literal select string.
  const profile = profileRow as unknown as Record<string, unknown> | null

  if (error) {
    console.error('[my-card] profile load failed:', error)
    return null
  }
  if (!profile) return null

  const card = mapProfileToCardData(
    // Cast through unknown: the column list is a runtime constant, so supabase-js
    // cannot infer the row shape from it the way it does for a literal select.
    profile as Record<string, unknown>,
    (links || []) as CardLink[],
    (events || []).map((row) => normalizeCardEventRow(row as Record<string, unknown>)),
    showcase
  )

  const slug = typeof profile.card_slug === 'string' && profile.card_slug.trim()
    ? profile.card_slug.trim()
    : null

  return {
    userId: user.id,
    card,
    slug,
    publicUrl: slug ? publicCardUrl(slug) : null,
    published: Boolean(profile.card_published),
  }
}
