import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase'

type Props = { params: { username: string } }

/** A legacy link must stop working the moment its owner unpublishes; nothing here may be cached. */
export const dynamic = 'force-dynamic'

/*
  The publish state and nothing else. This client uses the service role, so no
  row-level rule stands between this page and the owner's contact details; the
  page itself is the rule, and it never needs more than these two columns.
*/
async function getPublishState(username: string) {
  const supabase = createServerSupabase()
  const { data: profile, error } = await supabase
    .from('abc_profiles')
    .select('card_slug, card_published')
    .eq('user_name', decodeURIComponent(username).toLowerCase())
    .maybeSingle()
  if (error) console.error('getPublishState error:', error)
  return profile
}

/** Names no one: a published card redirects, and its /d/ page carries its own metadata. */
export const metadata: Metadata = {
  title: 'Card not found — ABC',
  robots: { index: false, follow: false },
}

export default async function PublicCardByUsernamePage({ params }: Props) {
  const profile = await getPublishState(params.username)

  // Legacy alias. Printed /u/ links keep working for a published card, which
  // lives at /d/. Anything else is a 404, the same rule /d/ applies.
  if (profile?.card_slug && profile.card_published) {
    redirect(`/d/${profile.card_slug}`)
  }

  notFound()
}
