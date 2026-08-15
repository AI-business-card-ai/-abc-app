'use client'

import {
  IconBrandFacebook,
  IconBrandGithub,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandThreads,
  IconBrandTiktok,
  IconBrandX,
  IconBrandYoutube,
  IconMail,
  IconMapPin,
  IconPhone,
  IconWorld,
} from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'
import Avatar from '@/components/ui/abc/Avatar'
import { isSocialVisible } from '@/lib/card/public-data'
import type { DigitalCardData, SocialNetwork } from '@/lib/card/types'

const SOCIAL_ICONS: Record<SocialNetwork, { Icon: TablerIcon; urlKey: keyof DigitalCardData }> = {
  linkedin: { Icon: IconBrandLinkedin, urlKey: 'linkedinUrl' },
  instagram: { Icon: IconBrandInstagram, urlKey: 'instagramUrl' },
  x: { Icon: IconBrandX, urlKey: 'xUrl' },
  facebook: { Icon: IconBrandFacebook, urlKey: 'facebookUrl' },
  youtube: { Icon: IconBrandYoutube, urlKey: 'youtubeUrl' },
  tiktok: { Icon: IconBrandTiktok, urlKey: 'tiktokUrl' },
  github: { Icon: IconBrandGithub, urlKey: 'githubUrl' },
  threads: { Icon: IconBrandThreads, urlKey: 'threadsUrl' },
}

/**
 * The card as the owner sees it on /my-card — a faithful, compact rendering of
 * what a visitor receives. Identity only: never a score, a stage or a note.
 * Rows with no value are not rendered at all, so an incomplete card looks
 * short rather than broken.
 */
export default function CardPreview({ card }: { card: DigitalCardData }) {
  const subtitleParts = [card.jobTitle, card.companyName].filter(Boolean) as string[]

  const rows: { key: string; Icon: TablerIcon; value: string }[] = []
  if (card.showPhone && card.phone) rows.push({ key: 'phone', Icon: IconPhone, value: card.phone })
  if (card.showEmail && card.email) rows.push({ key: 'email', Icon: IconMail, value: card.email })
  if (card.showWebsite && card.website) {
    rows.push({ key: 'web', Icon: IconWorld, value: card.website.replace(/^https?:\/\//i, '') })
  }
  if (card.showLocation && card.location) {
    rows.push({ key: 'loc', Icon: IconMapPin, value: card.location })
  }

  const socials = (Object.keys(SOCIAL_ICONS) as SocialNetwork[])
    .map((key) => {
      const url = card[SOCIAL_ICONS[key].urlKey] as string | null
      return isSocialVisible(card, key, url) ? { key, Icon: SOCIAL_ICONS[key].Icon } : null
    })
    .filter(Boolean) as { key: SocialNetwork; Icon: TablerIcon }[]

  return (
    <div
      className="overflow-hidden rounded-card border p-5 sm:p-6"
      style={{
        background: 'linear-gradient(158deg, #1b1a17 0%, #131315 46%, #0f0f11 100%)',
        borderColor: 'var(--abc-gold-border)',
        boxShadow: 'var(--abc-shadow-raised)',
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {card.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.logoUrl}
              alt={card.companyName || ''}
              className="mb-3.5 h-7 w-auto max-w-[140px] object-contain object-left"
            />
          ) : null}

          <h2 className="truncate text-[24px] font-bold leading-tight tracking-tight text-abc-text sm:text-[27px]">
            {card.fullName}
          </h2>

          {subtitleParts.length > 0 ? (
            <p className="mt-1.5 text-[14px] leading-[1.5] text-abc-secondary">
              {subtitleParts.map((part, i) => (
                <span key={part}>
                  {i === 0 ? (
                    <span style={{ color: 'var(--abc-gold-accent)' }}>{part}</span>
                  ) : (
                    part
                  )}
                  {i < subtitleParts.length - 1 ? (
                    <span className="px-1.5 text-abc-muted">·</span>
                  ) : null}
                </span>
              ))}
            </p>
          ) : null}
        </div>

        <Avatar src={card.photoUrl} name={card.fullName} size={68} ring />
      </div>

      {card.tagline ? (
        <p className="mt-4 text-[14px] font-medium leading-[1.55] text-abc-text">{card.tagline}</p>
      ) : null}

      {rows.length > 0 ? (
        <ul className="mt-5 space-y-2.5 border-t border-abc-border pt-4">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center gap-3 text-[13.5px] text-abc-secondary">
              <row.Icon
                size={16}
                stroke={1.75}
                className="shrink-0"
                style={{ color: 'var(--abc-gold-accent)' }}
              />
              <span className="truncate">{row.value}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {socials.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {socials.map((social) => (
            <span
              key={social.key}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-abc-border bg-abc-raised"
              aria-hidden="true"
            >
              <social.Icon size={16} stroke={1.7} style={{ color: 'var(--abc-text-secondary)' }} />
            </span>
          ))}
          <span className="sr-only">
            Linked profiles: {socials.map((s) => s.key).join(', ')}
          </span>
        </div>
      ) : null}
    </div>
  )
}
