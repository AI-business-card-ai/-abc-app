'use client'

import { IconMail, IconPhone, IconWorld } from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'
import CardHero from '@/components/card/CardHero'
import { getCardThemeTokens } from '@/lib/card/theme'
import type { DigitalCardData } from '@/lib/card/types'

/**
 * A small, honest stand-in for the public card.
 *
 * It used to draw its own hero: a circle with a hardcoded object-position and
 * no zoom, and a cover that read the old nine-point setting. An owner who
 * framed their portrait saw it correctly in the full preview and cropped on
 * their own dashboard — the same card, disagreeing with itself. The hero now
 * comes from CardHero, so the only thing this component still decides is what
 * to show underneath it.
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

  const actions: { key: string; Icon: TablerIcon; label: string }[] = []
  if (card.showPhone && card.phone) actions.push({ key: 'call', Icon: IconPhone, label: 'Call' })
  if (card.showEmail && card.email) actions.push({ key: 'mail', Icon: IconMail, label: 'Email' })
  if (card.showWebsite && card.website) actions.push({ key: 'web', Icon: IconWorld, label: 'Website' })

  return (
    <div
      className="overflow-hidden rounded-card border"
      style={{ background: t.bg, borderColor: t.border }}
    >
      <CardHero card={card} size="compact">
        {card.tagline ? (
          <p
            className={`mt-2 line-clamp-2 leading-[1.45] ${lg ? 'text-[13.5px]' : 'text-[12.5px]'}`}
            style={{ color: t.text }}
          >
            {card.tagline}
          </p>
        ) : null}

        <div
          className={`mt-3 flex items-center justify-center rounded-btn font-semibold ${
            lg ? 'text-[14.5px]' : 'text-[13px]'
          }`}
          style={{ background: accent, color: '#1a1205', height: lg ? 48 : 40 }}
        >
          Save contact
        </div>

        {/*
          A count, not a gallery. This preview exists to be glanced at; eight
          thumbnails here would make the owner's own page heavier than the card
          it is previewing. The full public preview is where the work is shown.
        */}
        {card.showcaseEnabled && card.showcaseItems.length > 0 ? (
          <p className="mt-2 text-[11.5px]" style={{ color: t.muted }}>
            {card.showcaseTitle} · {card.showcaseItems.length}{' '}
            {card.showcaseItems.length === 1 ? 'image' : 'images'}
          </p>
        ) : null}

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

        <div style={{ height: lg ? 20 : 16 }} aria-hidden />
      </CardHero>
    </div>
  )
}
