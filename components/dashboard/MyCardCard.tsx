'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  IconChevronRight,
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
import CardQrModal from '@/components/card/CardQrModal'
import Avatar from '@/components/ui/abc/Avatar'
import { IconTile } from '@/components/ui/abc/Bits'
import Button from '@/components/ui/abc/Button'
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

  return (
    <section className="abc-surface abc-surface-interactive flex flex-col p-5">
      <header className="flex items-start justify-between">
        <IconUser size={30} stroke={1.5} style={{ color: 'var(--abc-green)' }} />
        <Link
          href="/profile/card"
          aria-label="Open your card"
          className="flex h-8 w-8 items-center justify-center rounded-full text-abc-muted transition-colors hover:text-abc-text abc-focus-ring"
        >
          <IconChevronRight size={20} stroke={1.75} />
        </Link>
      </header>

      <h2 className="mt-3.5 text-[19px] font-bold tracking-tight text-abc-text">MY CARD</h2>
      <p className="mt-1 text-[13.5px] leading-[1.5] text-abc-secondary">
        Your digital business card, always ready to share.
      </p>

      {/* Mini preview of the user's own card — their branding, not ABC's */}
      <div
        className="mt-4 flex-1 rounded-inner border p-4"
        style={{
          background: 'linear-gradient(160deg, #16161a, #0f0f11)',
          borderColor: 'rgba(217, 164, 65, 0.28)',
        }}
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

            <p className="truncate text-[19px] font-bold leading-tight text-abc-text">
              {card.fullName}
            </p>
            {card.jobTitle ? (
              <p className="mt-0.5 truncate text-[13px]" style={{ color: card.accent }}>
                {card.jobTitle}
              </p>
            ) : null}
            {card.companyName ? (
              <p className="mt-0.5 truncate text-[13px] text-abc-secondary">{card.companyName}</p>
            ) : null}
          </div>

          <Avatar src={card.photoUrl} name={card.fullName} size={54} ring />
        </div>

        {details.length > 0 ? (
          <ul className="mt-3.5 hidden space-y-1.5 lg:block">
            {details.map((detail) => (
              <li key={detail.value} className="flex items-center gap-2 text-[12px] text-abc-secondary">
                <detail.icon size={14} stroke={1.75} style={{ color: card.accent }} />
                <span className="truncate">{detail.value}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {card.slug ? (
        <div className="mt-3 flex gap-2">
          <IconTile
            icon={IconPencil}
            label="Edit"
            href="/profile/card"
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
          <IconTile
            icon={IconWallet}
            label="Wallet"
            disabled
            title="Apple Wallet — not available yet"
            labelClassName={LABEL}
          />
        </div>
      ) : (
        <div className="mt-3">
          <Button href="/profile/card" variant="surface" size="md" fullWidth>
            Create your digital card
          </Button>
        </div>
      )}

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
        <CardQrModal slug={card.slug} open={qrOpen} onClose={() => setQrOpen(false)} />
      ) : null}
    </section>
  )
}
