'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  IconChevronRight,
  IconId,
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
import GoldTrace from '@/components/dashboard/GoldTrace'
import { getCardThemeTokens, initialsFromName } from '@/lib/card/theme'
import { CARD_PUBLIC_BASE } from '@/lib/card/types'
import type { DashboardCard } from '@/lib/dashboard-data'

/**
 * MY ABC — the owner's card, whole, with a QR someone can scan off the screen.
 *
 * Not a preview tile. Home is presentation mode in miniature: the card is laid
 * on a glass showcase at the largest size the column allows, in the owner's
 * own theme and accent, with their portrait, their details and the real QR on
 * its white plate. Someone standing beside the laptop or phone can point a
 * camera at it without a tap.
 *
 * Everything on the card comes from DashboardCard — the same profile row the
 * public card reads — and the QR is CardQrImage, from the one server route
 * that draws QRs. The frame is ABC's champagne; the card inside is theirs, so
 * a graphite card stays graphite on the light dashboard.
 *
 * The QR is only drawn for a published card. The QR route answers 404 for an
 * unpublished one, and a broken image where the QR should be is worse than an
 * honest line saying what to do.
 */
export default function MyCardCard({ card }: { card: DashboardCard }) {
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
    <section className="abc-dash-card flex h-full flex-col" aria-labelledby="home-myabc-title">
      <GoldTrace phase={0.62} />

      <div className="relative flex h-full flex-col p-4 sm:p-5 min-[1360px]:px-[18px] min-[1360px]:pb-[18px] min-[1360px]:pt-5">
        <header className="flex items-center justify-between px-1">
          <h2 id="home-myabc-title" className="flex items-center gap-2.5">
            <IconId size={28} stroke={1.5} style={{ color: 'var(--abc-gold)' }} aria-hidden="true" />
            <span className="text-[17px] font-semibold uppercase tracking-[0.04em] text-[#3a352d] min-[1360px]:text-[18px]">
              My ABC
            </span>
          </h2>
          <Link href="/my-card" aria-label="Open My Card" className="abc-dash-chevron abc-focus-ring">
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
            <HomeCard card={card} live={live} />
          </div>
        )}

        {card.slug ? (
          <div className="mt-3 flex gap-2.5 min-[1360px]:mt-3.5">
            <Link href="/settings/card" className="abc-myabc-action abc-dash-well abc-focus-ring" aria-label="Edit">
              <IconPencil size={21} stroke={1.7} aria-hidden="true" />
              Edit
            </Link>
            <button type="button" onClick={share} className="abc-myabc-action abc-dash-well abc-focus-ring" aria-label="Share">
              <IconShare size={21} stroke={1.7} aria-hidden="true" />
              Share
            </button>
            <button
              type="button"
              onClick={() => setQrOpen(true)}
              disabled={!live}
              className="abc-myabc-action abc-dash-well abc-focus-ring disabled:pointer-events-none disabled:opacity-45"
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
              className="abc-myabc-action abc-dash-well abc-focus-ring"
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
 * The card itself, as the owner built it: their theme, accent, logo, portrait,
 * details and QR. Sizes inside are shares of the card's width (see .abc-hcard
 * in globals.css), so it keeps one composition from a phone to a wide desktop.
 */
function HomeCard({ card, live }: { card: DashboardCard; live: boolean }) {
  const t = getCardThemeTokens(card.theme)
  const light = card.theme === 'light'

  const details = [
    card.phone ? { icon: IconPhone, value: card.phone, label: 'Phone' } : null,
    card.email ? { icon: IconMail, value: card.email, label: 'Email' } : null,
    card.location ? { icon: IconMapPin, value: card.location, label: 'Location' } : null,
    card.website ? { icon: IconWorld, value: card.website, label: 'Website' } : null,
  ].filter(Boolean) as { icon: typeof IconPhone; value: string; label: string }[]

  return (
    <Link
      href="/my-card"
      aria-label={`Your ABC card, ${card.fullName}. Open My Card`}
      className="abc-hcard abc-focus-ring"
      data-theme={light ? 'light' : 'graphite'}
      style={{ background: t.bg, color: t.text }}
    >
      {/* Card stock: a dotted world and two threads in the owner's accent. */}
      <span
        className="abc-hcard-map"
        style={{ color: light ? '#000' : '#fff', opacity: light ? 0.07 : 0.13 }}
        aria-hidden="true"
      />
      <svg
        className="pointer-events-none absolute bottom-0 right-0 h-[46%] w-[78%]"
        viewBox="0 0 280 140"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden="true"
      >
        <path d="M0 132C70 128 150 106 200 70S262 14 290 0" stroke={card.accent} strokeOpacity="0.55" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        <path d="M30 142C100 134 170 112 218 80S270 30 292 14" stroke={card.accent} strokeOpacity="0.3" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d="M80 146C140 138 196 122 236 96S278 56 296 40" stroke={card.accent} strokeOpacity="0.18" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="abc-hcard-body">
        <div className="abc-hcard-main">
          {card.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.logoUrl} alt={card.companyName || ''} className="abc-hcard-logo" />
          ) : null}

          <div className="abc-hcard-name truncate" style={{ color: t.text }}>
            {card.fullName}
          </div>
          {card.jobTitle ? (
            <div className="abc-hcard-role truncate" style={{ color: card.accent }}>
              {card.jobTitle}
            </div>
          ) : null}
          {card.companyName ? (
            <div className="abc-hcard-company truncate" style={{ color: light ? t.secondary : t.text }}>
              {card.companyName}
            </div>
          ) : null}

          {details.length > 0 ? (
            <div className="abc-hcard-details">
              {details.map((detail) => (
                <div key={detail.label} className="abc-hcard-detail" style={{ color: light ? t.secondary : '#e7e4de' }}>
                  <detail.icon stroke={1.6} style={{ color: card.accent }} aria-hidden="true" />
                  <span className="truncate">{detail.value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="abc-hcard-side">
          <span
            className="abc-hcard-portrait flex items-center justify-center"
            style={{
              background: t.surface2,
              boxShadow: `0 0 0 2px ${card.accent}, 0 0 18px ${card.accent}55`,
            }}
          >
            {card.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={card.photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="font-semibold" style={{ color: t.secondary, fontSize: 'max(14px, 7cqw)' }}>
                {initialsFromName(card.fullName)}
              </span>
            )}
          </span>

          {/*
            The same QR the fullscreen modal shows, from the same server route —
            one generator, two sizes. It keeps its white plate whatever the card
            theme is doing, because scanning is the whole job.
          */}
          {live && card.slug ? (
            <div className="abc-hcard-qr">
              <CardQrImage slug={card.slug} width="100%" size={512} className="!rounded-none !p-0" />
              <span className="abc-hcard-qr-label">SCAN TO SAVE</span>
            </div>
          ) : (
            <span
              className="block w-full rounded-[10px] border border-dashed p-2 text-center text-[11px] leading-[1.35]"
              style={{ borderColor: t.border, color: t.secondary }}
            >
              Publish your card to show its QR here.
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
