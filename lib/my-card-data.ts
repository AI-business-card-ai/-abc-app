import { mapProfileToCardData } from '@/lib/card/public-data'
import { createServerComponentClient } from '@/lib/supabase-server'
import { CARD_PUBLIC_BASE, type CardEvent, type CardLink, type DigitalCardData } from '@/lib/card/types'

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

  const { data: profile, error } = await supabase
    .from('abc_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    console.error('[my-card] profile load failed:', error)
    return null
  }
  if (!profile) return null

  const [{ data: links }, { data: events }] = await Promise.all([
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
  ])

  const card = mapProfileToCardData(
    profile as Record<string, unknown>,
    (links || []) as CardLink[],
    (events || []) as CardEvent[]
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
