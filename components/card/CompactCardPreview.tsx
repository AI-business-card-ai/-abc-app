'use client'

import { IconMail, IconMapPin, IconPhone, IconWorld } from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'
import { getCardThemeTokens, initialsFromName } from '@/lib/card/theme'
import { PHOTO_OBJECT_POSITION } from '@/lib/card/types'
import type { DigitalCardData } from '@/lib/card/types'

/**
 * A small, honest stand-in for the public card: cover, photo, logo, identity
 * and the contact actions that actually have values. It exists to show the
 * effect of an edit immediately — the full rendering is one tap away, so this
 * one stays short enough to sit above the fold on a phone.
 */
export default function CompactCardPreview({
  card,
  size = 'compact',
}: {
  card: DigitalCardData
  /** 'large' gives the card top billing on /my-card; the editor column stays compact. */
  size?: 'compact' | 'large'
}) {
  const lg = size === 'large'
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
      <div style={{ position: 'relative', height: lg ? 132 : 96, background: t.surface }}>
        {card.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.coverUrl}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: card.coverFit === 'fit' ? 'contain' : 'cover',
              objectPosition: card.coverPosition,
              display: 'block',
            }}
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

      <div style={{ padding: lg ? '0 20px 20px' : '0 16px 16px', marginTop: lg ? -42 : -30 }}>
        <div className="flex items-end justify-between gap-3">
          <div
            style={{
              width: lg ? 86 : 62,
              height: lg ? 86 : 62,
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
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: PHOTO_OBJECT_POSITION,
                }}
              />
            ) : (
              <span style={{ color: t.secondary, fontSize: lg ? 28 : 20, fontWeight: 700 }}>
                {initialsFromName(card.fullName)}
              </span>
            )}
          </div>

          {card.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.logoUrl}
              alt=""
              style={{ height: lg ? 28 : 22, width: 'auto', maxWidth: lg ? 120 : 90, objectFit: 'contain' }}
            />
          ) : null}
        </div>

        <p
          style={{ color: t.text }}
          className={`mt-2.5 truncate font-bold leading-tight tracking-tight ${lg ? 'text-[23px]' : 'text-[18px]'}`}
        >
          {card.fullName || 'Your name'}
        </p>
        {subtitle ? (
          <p style={{ color: t.secondary }} className={`mt-0.5 truncate ${lg ? 'text-[14px]' : 'text-[12.5px]'}`}>
            {subtitle}
          </p>
        ) : null}
        {card.tagline ? (
          <p style={{ color: t.text }} className={`mt-2 line-clamp-2 leading-[1.45] ${lg ? 'text-[13.5px]' : 'text-[12.5px]'}`}>
            {card.tagline}
          </p>
        ) : null}

        <div
          className={`mt-3 flex items-center justify-center rounded-btn font-semibold ${lg ? 'text-[14.5px]' : 'text-[13px]'}`}
          style={{ background: accent, color: '#1a1205', height: lg ? 48 : 40 }}
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
