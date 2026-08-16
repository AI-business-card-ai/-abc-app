'use client'

import { IconMail, IconMapPin, IconPhone, IconWorld } from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'
import { getCardThemeTokens, initialsFromName } from '@/lib/card/theme'
import type { DigitalCardData } from '@/lib/card/types'

/**
 * A small, honest stand-in for the public card: cover, photo, logo, identity
 * and the contact actions that actually have values. It exists to show the
 * effect of an edit immediately — the full rendering is one tap away, so this
 * one stays short enough to sit above the fold on a phone.
 */
export default function CompactCardPreview({ card }: { card: DigitalCardData }) {
  const t = getCardThemeTokens(card.theme)
  const accent = card.accent
  const subtitle = [card.jobTitle, card.companyName].filter(Boolean).join(' · ')

  const actions: { key: string; Icon: TablerIcon; label: string }[] = []
  if (card.showPhone && card.phone) actions.push({ key: 'call', Icon: IconPhone, label: 'Call' })
  if (card.showEmail && card.email) actions.push({ key: 'mail', Icon: IconMail, label: 'Email' })
  if (card.showWebsite && card.website) actions.push({ key: 'web', Icon: IconWorld, label: 'Website' })
  if (card.showLocation && card.location) {
    actions.push({ key: 'loc', Icon: IconMapPin, label: card.location })
  }

  return (
    <div
      className="overflow-hidden rounded-card border"
      style={{ background: t.bg, borderColor: t.border }}
    >
      {/* Cover — the photo overlaps its lower edge, as on the public card */}
      <div style={{ position: 'relative', height: 96, background: t.surface }}>
        {card.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.coverUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div
            aria-hidden
            style={{
              width: '100%',
              height: '100%',
              background: `radial-gradient(120% 140% at 50% 0%, ${accent}26, transparent 70%)`,
            }}
          />
        )}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(180deg, transparent 40%, ${t.bg})`,
          }}
        />
      </div>

      <div style={{ padding: '0 16px 16px', marginTop: -30 }}>
        <div className="flex items-end justify-between gap-3">
          <div
            style={{
              width: 62,
              height: 62,
              borderRadius: '50%',
              overflow: 'hidden',
              background: t.surface2,
              boxShadow: `inset 0 0 0 2px ${accent}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {card.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.photoUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ color: t.secondary, fontSize: 20, fontWeight: 700 }}>
                {initialsFromName(card.fullName)}
              </span>
            )}
          </div>

          {card.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.logoUrl}
              alt=""
              style={{ height: 22, width: 'auto', maxWidth: 90, objectFit: 'contain' }}
            />
          ) : null}
        </div>

        <p
          style={{ color: t.text }}
          className="mt-2.5 truncate text-[18px] font-bold leading-tight tracking-tight"
        >
          {card.fullName || 'Your name'}
        </p>
        {subtitle ? (
          <p style={{ color: t.secondary }} className="mt-0.5 truncate text-[12.5px]">
            {subtitle}
          </p>
        ) : null}
        {card.tagline ? (
          <p style={{ color: t.text }} className="mt-2 line-clamp-2 text-[12.5px] leading-[1.45]">
            {card.tagline}
          </p>
        ) : null}

        <div
          className="mt-3 flex items-center justify-center rounded-btn text-[13px] font-semibold"
          style={{ background: accent, color: '#1a1205', height: 40 }}
        >
          Save contact
        </div>

        {actions.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {actions.map((action) => (
              <span
                key={action.key}
                className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2.5 py-1.5 text-[11.5px]"
                style={{ background: t.surface, border: `1px solid ${t.border}`, color: t.secondary }}
              >
                <action.Icon size={12} stroke={1.8} style={{ color: accent }} />
                {action.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
