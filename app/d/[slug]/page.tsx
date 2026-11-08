import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase'
import { loadPublishedCardBySlug, recordCardView } from '@/lib/card/public-data'
import PublicCardClient from '@/components/card/PublicCardClient'
import { CARD_PUBLIC_BASE } from '@/lib/card/types'
import { sanitizeCardViewSource } from '@/lib/card/view-source'
import { SITE_URL } from '@/lib/site'

/** A card must reflect the owner's latest edit the moment a visitor scans it. */
export const dynamic = 'force-dynamic'

type Props = {
  params: { slug: string }
  searchParams?: { src?: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = decodeURIComponent(params.slug || '').trim().toLowerCase()
  const supabase = createServerSupabase()
  const card = await loadPublishedCardBySlug(supabase, slug)

  if (!card) {
    return { title: 'Card not found — ABC', robots: { index: false, follow: false } }
  }

  const title = [card.fullName, card.jobTitle ? `${card.jobTitle} @ ${card.companyName || ''}`.trim() : card.companyName]
    .filter(Boolean)
    .join(' — ')
  const description = card.tagline || card.whatIDo || `Digital business card of ${card.fullName}`
  const ogImage = `${SITE_URL}/api/card/og/${encodeURIComponent(slug)}`
  // One address per card, whichever ?src= or host it was opened through.
  const canonical = `${CARD_PUBLIC_BASE}/${encodeURIComponent(slug)}`

  return {
    title,
    description,
    /*
      Open to anyone with the link, kept out of search results: a card is shared
      person to person, not published for search. `follow` keeps the owner's own
      links crawlable. Per-card opt-in to indexing is a separate, later decision.
    */
    robots: { index: false, follow: true },
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: 'profile',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  }
}

export default async function PublicDigitalCardPage({ params, searchParams }: Props) {
  const slug = decodeURIComponent(params.slug || '').trim().toLowerCase()
  const supabase = createServerSupabase()
  const card = await loadPublishedCardBySlug(supabase, slug)

  if (!card) notFound()

  // Fire-and-forget tracking — never block / crash the page. The marker is
  // checked against the allowlist first: `?src=` is public input, and an
  // owner's analytics should only ever record a source ABC itself minted.
  const referer = headers().get('referer')
  void recordCardView(supabase, card.userId, sanitizeCardViewSource(searchParams?.src), referer)

  return (
    <div style={{ minHeight: '100vh', background: card.theme === 'light' ? '#ffffff' : '#0f0f0f' }}>
      <PublicCardClient card={card} />
    </div>
  )
}
