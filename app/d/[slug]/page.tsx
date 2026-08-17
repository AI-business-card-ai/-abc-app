import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase'
import { loadPublishedCardBySlug, recordCardView } from '@/lib/card/public-data'
import PublicCardClient from '@/components/card/PublicCardClient'
import { walletCapabilities } from '@/lib/card/wallet'

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
    return { title: 'Card not found — ABC' }
  }

  const title = [card.fullName, card.jobTitle ? `${card.jobTitle} @ ${card.companyName || ''}`.trim() : card.companyName]
    .filter(Boolean)
    .join(' — ')
  const description = card.tagline || card.whatIDo || `Digital business card of ${card.fullName}`
  const ogImage = `https://abccard.io/api/card/og/${encodeURIComponent(slug)}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
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

  const capabilities = walletCapabilities()

  // Fire-and-forget tracking — never block / crash the page
  const referer = headers().get('referer')
  void recordCardView(supabase, card.userId, searchParams?.src || null, referer)

  return (
    <div style={{ minHeight: '100vh', background: card.theme === 'light' ? '#ffffff' : '#0f0f0f' }}>
      <PublicCardClient
        card={card}
        wallet={{ apple: capabilities.apple.configured, google: capabilities.google.configured }}
      />
    </div>
  )
}
