'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  IconChevronRight,
  IconId,
  IconPencil,
  IconQrcode,
  IconShare,
  IconUser,
  IconWallet,
} from '@tabler/icons-react'
import CardHero from '@/components/card/CardHero'
import CardQrImage from '@/components/card/CardQrImage'
import CardQrModal from '@/components/card/CardQrModal'
import GoldTrace from '@/components/dashboard/GoldTrace'
import { getCardThemeTokens } from '@/lib/card/theme'
import { CARD_PUBLIC_BASE } from '@/lib/card/types'
import type { DashboardCard } from '@/lib/dashboard-data'
import type { MyCardData } from '@/lib/my-card-data'

/**
 * MY ABC — the owner's real card, with a QR someone can scan off the screen.
 *
 * The card is drawn by CardHero, the same renderer /my-card, the card editor
 * and the public card use, from the same getMyCard() data: the owner's own
 * hero or portrait, cover, framing, logo, theme and accent. There is no second
 * card design on Home to drift away from the real one. The frame around it is
 * ABC's champagne; the card inside is theirs, so a graphite card stays
 * graphite on the light workspace.
 *
 * The QR is CardQrImage, from the one server route that draws QRs, and it is
 * only drawn for a published card. The QR route answers 404 for an
 * unpublished one, and a broken image where the QR should be is worse than an
 * honest line saying what to do.
 */
export default function MyCardCard({ card, myCard }: { card: DashboardCard; myCard: MyCardData | null }) {
  const [qrOpen, setQrOpen] = useState(false)
  const [shareNote, setShareNote] = useState<string | null>(null)

  const cardUrl = card.slug ? `${CARD_PUBLIC_BASE}/${card.slug}` : null
  const live = Boolean(card.slug && card.published)

  async function share() {
    if (!cardUrl) return
    const payload = {
      title: `${card.fullName} — ABC Card`,
      text: 'My digital business card',
      url: cardUrl,
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(payload)
        return
      }
      await navigator.clipboard.writeText(cardUrl)
      setShareNote('Link copied')
      setTimeout(() => setShareNote(null), 2000)
    } catch (err) {
      // A cancelled share sheet is not an error worth surfacing.
      if ((err as Error)?.name !== 'AbortError') {
        console.error('[MyCardCard] share failed:', err)
      }
    }
  }

  return (
    <section className="abc-dash-card abc-lift flex h-full flex-col" aria-labelledby="home-myabc-title">
      <GoldTrace phase={0.62} />

      <div className="relative flex h-full flex-col p-4 sm:p-5 min-[1360px]:px-[18px] min-[1360px]:pb-[18px] min-[1360px]:pt-5">
        <header className="flex items-center justify-between px-1">
          <h2 id="home-myabc-title" className="flex items-center gap-2.5">
            <IconId size={28} stroke={1.5} style={{ color: 'var(--abc-gold)' }} aria-hidden="true" />
            <span className="text-[17px] font-semibold uppercase tracking-[0.04em] text-[#3a352d] min-[1360px]:text-[18px]">
              My ABC
            </span>
          </h2>
          <Link href="/my-card" aria-label="Open My Card" className="abc-dash-chevron abc-card-link abc-focus-ring">
            <IconChevronRight size={22} stroke={1.75} />
          </Link>
        </header>

        {!card.slug ? (
          <div className="abc-showcase mt-3.5 flex-1">
            <Link
              href="/settings/card"
              className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2.5 rounded-[15px] border border-dashed p-6 text-center abc-focus-ring"
              style={{ borderColor: 'var(--abc-gold-border)' }}
              aria-label="Create your ABC card"
            >
              <IconUser size={28} stroke={1.4} style={{ color: 'var(--abc-gold-accent)' }} aria-hidden="true" />
              <span className="text-[16px] font-semibold text-abc-text">Create your ABC</span>
              <span className="max-w-[26ch] text-[13px] leading-[1.5] text-abc-secondary">
                Your name, your photo and a QR people can scan.
              </span>
            </Link>
          </div>
        ) : (
          <div className="abc-showcase mt-3.5 flex flex-1 flex-col">
            {myCard ? (
              <OwnerCard myCard={myCard} slug={card.slug} live={live} />
            ) : (
              /* The card's data did not load. Say so and point at the page that
                 shows it, rather than drawing an approximation of it here. */
              <Link
                href="/my-card"
                className="flex min-h-[220px] flex-1 flex-col items-center justify-center gap-2 rounded-[15px] p-6 text-center abc-focus-ring"
              >
                <span className="text-[15px] font-semibold text-abc-text">Your card is on My Card</span>
                <span className="text-[13px] text-abc-secondary">It could not be shown here just now.</span>
              </Link>
            )}
          </div>
        )}

        {card.slug ? (
          <div className="mt-3 flex gap-2.5 min-[1360px]:mt-3.5">
            <Link href="/settings/card" className="abc-myabc-action abc-dash-well abc-lift abc-focus-ring" aria-label="Edit">
              <IconPencil size={21} stroke={1.7} aria-hidden="true" />
              Edit
            </Link>
            <button type="button" onClick={share} className="abc-myabc-action abc-dash-well abc-lift abc-focus-ring" aria-label="Share">
              <IconShare size={21} stroke={1.7} aria-hidden="true" />
              Share
            </button>
            <button
              type="button"
              onClick={() => setQrOpen(true)}
              disabled={!live}
              className="abc-myabc-action abc-dash-well abc-lift abc-focus-ring disabled:pointer-events-none disabled:opacity-45"
              aria-label="QR Code"
            >
              <IconQrcode size={21} stroke={1.7} aria-hidden="true" />
              QR Code
            </button>
            {/*
              A link, not a second copy of the wallet logic. Whether a pass can
              actually be issued is a server question with two providers behind
              it, and answering it twice is how the dashboard ends up disagreeing
              with My Card. This tile knows where the answer lives.
            */}
            <Link
              href="/my-card#wallet"
              className="abc-myabc-action abc-dash-well abc-lift abc-focus-ring"
              title="Add your card to Apple Wallet or Google Wallet"
              aria-label="Wallet"
            >
              <IconWallet size={21} stroke={1.7} aria-hidden="true" />
              Wallet
            </Link>
          </div>
        ) : null}

        {shareNote ? (
          <p className="mt-2 text-center text-[12px] font-medium text-[#8f6812]" role="status">
            {shareNote}
          </p>
        ) : null}

        {card.slug && !card.published ? (
          <p className="mt-2 text-center text-[12px] text-[#756d63]">
            Not published yet — only you can see it.
          </p>
        ) : null}

        {live && card.slug ? (
          <CardQrModal
            slug={card.slug}
            open={qrOpen}
            onClose={() => setQrOpen(false)}
            name={card.fullName}
            company={card.companyName}
          />
        ) : null}
      </div>
    </section>
  )
}

/**
 * The owner's card, drawn by the real renderer, with its QR underneath the
 * identity — the place the card itself puts its own actions.
 *
 * The wrapper is the one CompactCardPreview gives CardHero (theme ground and
 * border), so the card sits on Home exactly as it sits on /my-card. Only the
 * recipient-facing parts of that preview — "Save contact" and the contact
 * chips — are replaced, by the thing the owner needs here: the QR.
 */
function OwnerCard({ myCard, slug, live }: { myCard: MyCardData; slug: string; live: boolean }) {
  const t = getCardThemeTokens(myCard.card.theme)

  return (
    // The lift sits on a wrapper: the link clips the card to its corners, which would clip the lift's shadow too.
    <div className="abc-lift rounded-[15px]">
      <Link
        href="/my-card"
        aria-label={`Your ABC card, ${myCard.card.fullName}. Open My Card`}
        className="block overflow-hidden rounded-[15px] border abc-focus-ring"
        style={{ background: t.bg, borderColor: t.border }}
      >
        <CardHero card={myCard.card} size="compact">
          <div className="mt-3 flex items-end justify-between gap-3">
            {/* The address itself is on /my-card; here the QR is the point. */}
            <p className="min-w-0 text-[12px] leading-[1.45]" style={{ color: t.secondary }}>
              {live ? (
                <>
                  Scan to save
                  <br />
                  this contact
                </>
              ) : (
                'Publish your card to get its QR'
              )}
            </p>

            {live ? (
              <div className="w-[42%] min-w-[112px] max-w-[150px] shrink-0 rounded-[12px] bg-white px-2 pb-1.5 pt-2 shadow-[0_8px_18px_-8px_rgba(0,0,0,0.45)]">
                <CardQrImage slug={slug} width="100%" size={512} className="!rounded-none !p-0" />
                <span className="mt-1 block text-center text-[9.5px] font-bold tracking-[0.06em] text-[#141414]">
                  SCAN TO SAVE
                </span>
              </div>
            ) : null}
          </div>
          <div style={{ height: 16 }} aria-hidden="true" />
        </CardHero>
      </Link>
    </div>
  )
}
