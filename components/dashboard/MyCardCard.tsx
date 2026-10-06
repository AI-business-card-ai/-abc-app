'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  IconMail,
  IconMapPin,
  IconPencil,
  IconPhone,
  IconQrcode,
  IconShare,
  IconUser,
  IconWallet,
  IconWorld,
} from '@tabler/icons-react'
import CardQrImage from '@/components/card/CardQrImage'
import CardQrModal from '@/components/card/CardQrModal'
import Avatar from '@/components/ui/abc/Avatar'
import { IconTile } from '@/components/ui/abc/Bits'
import { getCardThemeTokens } from '@/lib/card/theme'
import { CARD_PUBLIC_BASE } from '@/lib/card/types'
import type { DashboardCard } from '@/lib/dashboard-data'

/**
 * Between 430px and 640px this card sits in a half-width column, which leaves
 * ~34px per action tile — too narrow for the labels. The icons (and their
 * accessible names) stay; only the visible micro-labels drop out in that band.
 */
const LABEL = 'min-[430px]:hidden min-[640px]:inline'

export default function MyCardCard({ card }: { card: DashboardCard }) {
  const [qrOpen, setQrOpen] = useState(false)
  const [shareNote, setShareNote] = useState<string | null>(null)

  const cardUrl = card.slug ? `${CARD_PUBLIC_BASE}/${card.slug}` : null

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

  const details = [
    card.phone ? { icon: IconPhone, value: card.phone } : null,
    card.email ? { icon: IconMail, value: card.email } : null,
    card.location ? { icon: IconMapPin, value: card.location } : null,
    card.website ? { icon: IconWorld, value: card.website } : null,
  ].filter(Boolean) as { icon: typeof IconPhone; value: string }[]

  const t = getCardThemeTokens(card.theme)

  // 'abccard.io/d/slug' — the address printed on the card, without the scheme.
  const cardAddress = card.slug ? `${CARD_PUBLIC_BASE.split('//').pop()}/${card.slug}` : null

  return (
    <section className="abc-surface abc-surface-interactive flex flex-col p-5">
      <header className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-abc-muted">
          My ABC
        </p>
        {/*
          No chevron here any more. It pointed at /my-card, which is exactly
          where the card underneath now goes, so it was a second link to the
          same place — and at 32px it was the only control on this tile under
          the 44px the rest of the product holds to. The card is the affordance.
        */}
        {/* "Not published yet" already has its line under the card. */}
      </header>

      {/*
        The card itself, as the owner built it.

        This used to be an icon, a heading and a sentence, with a small dark
        rectangle underneath that was the same near-black whatever the owner's
        card actually looked like. Home now shows the card: their theme, their
        accent, their portrait, their QR. Opening Home should answer "what does
        my ABC look like right now" without a tap.

        The frame is ABC's champagne; the artwork inside is theirs, which is
        why the inner surface reads from getCardThemeTokens rather than from
        the app palette. A graphite card stays graphite here — it is not a dark
        island, it is what the owner made.

        With no card yet there is nothing honest to draw, so the silhouette
        takes its place rather than a mock-up filled with "Your name" — a
        dashboard that shows somebody a card they have not made is a dashboard
        they stop believing.
      */}
      {!card.slug ? (
        <Link
          href="/settings/card"
          className="abc-card-empty mt-3.5 flex-1 abc-focus-ring"
          aria-label="Create your ABC card"
        >
          <IconUser size={26} stroke={1.4} style={{ color: 'var(--abc-gold-accent)' }} />
          <span className="text-[15px] font-semibold text-abc-text">Create your ABC</span>
          <span className="text-[12.5px] leading-[1.5] text-abc-secondary">
            Your name, your photo and a QR people can scan.
          </span>
        </Link>
      ) : (
      <Link
        href="/my-card"
        aria-label="Open your ABC card"
        className="abc-card-live mt-3.5 flex-1 rounded-inner p-4 abc-focus-ring"
        style={{ background: t.bg, borderColor: 'var(--abc-gold-border)', color: t.text }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {card.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.logoUrl}
                alt={card.companyName || ''}
                className="mb-3 h-6 w-auto max-w-[130px] object-contain object-left"
              />
            ) : card.companyName ? (
              <p
                className="mb-3 truncate text-[12px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: card.accent }}
              >
                {card.companyName}
              </p>
            ) : null}

            <p className="truncate text-[19px] font-bold leading-tight" style={{ color: t.text }}>
              {card.fullName}
            </p>
            {card.jobTitle ? (
              <p className="mt-0.5 truncate text-[13px]" style={{ color: card.accent }}>
                {card.jobTitle}
              </p>
            ) : null}
            {card.companyName ? (
              <p className="mt-0.5 truncate text-[13px]" style={{ color: t.secondary }}>
                {card.companyName}
              </p>
            ) : null}
          </div>

          <Avatar src={card.photoUrl} name={card.fullName} size={54} ring />
        </div>

        {/*
          The same QR the fullscreen modal shows, from the same server route —
          one generator, two sizes. It keeps its white plate and quiet zone
          whatever the card theme is doing, because scanning is the whole job.
        */}
        {card.slug ? (
          <div className="mt-3.5 flex items-end justify-between gap-3">
            <p className="text-[11px] leading-[1.4]" style={{ color: t.muted }}>
              Scan to open
              <br />
              <span style={{ color: t.secondary }}>{cardAddress}</span>
            </p>
            {/* The hairline keeps the white plate visible on a light-themed card. */}
            <CardQrImage
              slug={card.slug}
              width="104px"
              size={320}
              className="!rounded-[10px] border border-black/10 !p-2"
            />
          </div>
        ) : null}

        {details.length > 0 ? (
          <ul className="mt-3.5 hidden space-y-1.5 lg:block">
            {details.map((detail) => (
              <li key={detail.value} className="flex items-center gap-2 text-[12px]" style={{ color: t.secondary }}>
                <detail.icon size={14} stroke={1.75} style={{ color: card.accent }} />
                <span className="truncate">{detail.value}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Link>
      )}

      {card.slug ? (
        <div className="mt-3 flex gap-2">
          <IconTile
            icon={IconPencil}
            label="Edit"
            href="/settings/card"
            iconColor="var(--abc-green)"
            labelClassName={LABEL}
          />
          <IconTile icon={IconShare} label="Share" onClick={share} labelClassName={LABEL} />
          <IconTile
            icon={IconQrcode}
            label="QR Code"
            onClick={() => setQrOpen(true)}
            labelClassName={LABEL}
          />
          {/*
            A link, not a second copy of the wallet logic. Whether a pass can
            actually be issued is a server question with two providers behind
            it, and answering it twice is how the dashboard ends up disagreeing
            with My Card. This tile knows where the answer lives.
          */}
          <IconTile
            icon={IconWallet}
            label="Wallet"
            href="/my-card#wallet"
            title="Add your card to Apple Wallet or Google Wallet"
            labelClassName={LABEL}
          />
        </div>
      ) : null}

      {shareNote ? (
        <p className="mt-2 text-center text-[12px] text-abc-gold-accent" role="status">
          {shareNote}
        </p>
      ) : null}

      {!card.published && card.slug ? (
        <p className="mt-2 text-center text-[11.5px] text-abc-muted">
          Not published yet — only you can see it.
        </p>
      ) : null}

      {card.slug ? (
        <CardQrModal
          slug={card.slug}
          open={qrOpen}
          onClose={() => setQrOpen(false)}
          name={card.fullName}
          company={card.companyName}
        />
      ) : null}
    </section>
  )
}
