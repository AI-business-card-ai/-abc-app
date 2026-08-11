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
  IconCalendarEvent,
  IconChevronRight,
  IconMail,
  IconMapPin,
  IconPhone,
  IconWorld,
} from '@tabler/icons-react'
import type { DigitalCardData, SocialNetwork } from '@/lib/card/types'
import { LINK_ICON_OPTIONS, CARD_PUBLIC_BASE } from '@/lib/card/types'
import { isSocialVisible } from '@/lib/card/public-data'
import { whatsappMeUrl } from '@/lib/card/social'
import { getCardThemeTokens, initialsFromName } from '@/lib/card/theme'

type Props = {
  card: DigitalCardData
  /** Preview mode disables tracking / exchange callbacks optional */
  preview?: boolean
  onExchange?: () => void
  onLinkClick?: (linkId: string, url: string) => void
  onSaveContact?: () => void
}

const SOCIAL_ICONS: Record<
  SocialNetwork,
  { Icon: typeof IconBrandLinkedin; color: string; urlKey: keyof DigitalCardData }
> = {
  linkedin: { Icon: IconBrandLinkedin, color: '#0A66C2', urlKey: 'linkedinUrl' },
  instagram: { Icon: IconBrandInstagram, color: '#E1306C', urlKey: 'instagramUrl' },
  x: { Icon: IconBrandX, color: '#ffffff', urlKey: 'xUrl' },
  facebook: { Icon: IconBrandFacebook, color: '#1877F2', urlKey: 'facebookUrl' },
  youtube: { Icon: IconBrandYoutube, color: '#FF0000', urlKey: 'youtubeUrl' },
  tiktok: { Icon: IconBrandTiktok, color: '#ffffff', urlKey: 'tiktokUrl' },
  github: { Icon: IconBrandGithub, color: '#ffffff', urlKey: 'githubUrl' },
  threads: { Icon: IconBrandThreads, color: '#ffffff', urlKey: 'threadsUrl' },
}

function linkEmoji(icon: string): string {
  return LINK_ICON_OPTIONS.find((o) => o.id === icon)?.emoji || '🔗'
}

function formatEventDates(from: string | null, to: string | null): string {
  if (!from && !to) return ''
  const fmt = (d: string) => {
    try {
      return new Date(d + 'T12:00:00').toLocaleDateString('cs-CZ', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return d
    }
  }
  if (from && to && from !== to) return `${fmt(from)} – ${fmt(to)}`
  return fmt(from || to || '')
}

export default function DigitalCardView({
  card,
  preview = false,
  onExchange,
  onLinkClick,
  onSaveContact,
}: Props) {
  const t = getCardThemeTokens(card.theme)
  const accent = card.accent || '#f0197d'
  const initials = initialsFromName(card.fullName)
  const subtitle = [card.jobTitle, card.companyName].filter(Boolean).join(' · ')

  const socials = (Object.keys(SOCIAL_ICONS) as SocialNetwork[])
    .map((key) => {
      const meta = SOCIAL_ICONS[key]
      const url = card[meta.urlKey] as string | null
      if (!isSocialVisible(card, key, url)) return null
      return { key, url: url!, ...meta }
    })
    .filter(Boolean) as {
    key: SocialNetwork
    url: string
    Icon: typeof IconBrandLinkedin
    color: string
  }[]

  const contactTiles: {
    key: string
    label: string
    href: string
    Icon: typeof IconPhone
    highlight?: boolean
  }[] = []

  if (card.showPhone && card.phone) {
    contactTiles.push({
      key: 'phone',
      label: card.phone,
      href: `tel:${card.phone}`,
      Icon: IconPhone,
    })
  }
  if (card.showWhatsapp && card.whatsapp) {
    contactTiles.push({
      key: 'whatsapp',
      label: 'WhatsApp',
      href: whatsappMeUrl(card.whatsapp),
      Icon: IconPhone,
    })
  }
  if (card.showEmail && card.email) {
    contactTiles.push({
      key: 'email',
      label: card.email,
      href: `mailto:${card.email}`,
      Icon: IconMail,
    })
  }
  if (card.showWebsite && card.website) {
    contactTiles.push({
      key: 'web',
      label: card.website.replace(/^https?:\/\//i, ''),
      href: card.website,
      Icon: IconWorld,
    })
  }
  if (card.showCalendar && card.calendarUrl) {
    contactTiles.push({
      key: 'calendar',
      label: 'Rezervovat čas',
      href: card.calendarUrl,
      Icon: IconCalendarEvent,
      highlight: true,
    })
  }

  async function handleSave() {
    if (onSaveContact) {
      onSaveContact()
      return
    }
    window.location.href = `/api/card/vcard/${encodeURIComponent(card.slug)}`
  }

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 480,
        margin: '0 auto',
        minHeight: preview ? '100%' : '100vh',
        background: t.bg,
        color: t.text,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Cover */}
      <div style={{ position: 'relative', height: card.coverUrl ? 140 : 72, background: t.surface }}>
        {card.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.coverUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              background: `linear-gradient(135deg, ${accent}33, transparent)`,
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

      <div style={{ padding: '0 20px 40px', marginTop: -48 }}>
        {/* Photo */}
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: '50%',
            border: `3px solid ${accent}`,
            boxShadow: `0 0 24px ${accent}55`,
            overflow: 'hidden',
            background: 'linear-gradient(135deg,#f0197d,#00d4d4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {card.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ color: '#fff', fontSize: 28, fontWeight: 800 }}>{initials}</span>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {card.fullName}
          </h1>
          {subtitle ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <p style={{ margin: 0, fontSize: 14, color: t.secondary }}>{subtitle}</p>
              {card.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.logoUrl}
                  alt=""
                  style={{ height: 18, width: 'auto', maxWidth: 48, objectFit: 'contain' }}
                />
              ) : null}
            </div>
          ) : null}
          {card.tagline ? (
            <p style={{ margin: '8px 0 0', fontSize: 15, color: accent, fontWeight: 600 }}>
              {card.tagline}
            </p>
          ) : null}

          {(card.showLocation && card.location) || card.languages.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {card.showLocation && card.location ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 12,
                    color: t.secondary,
                    background: t.surface,
                    border: `1px solid ${t.border}`,
                    borderRadius: 999,
                    padding: '4px 10px',
                  }}
                >
                  <IconMapPin size={12} />
                  {card.location}
                </span>
              ) : null}
              {card.languages.map((lang) => (
                <span
                  key={lang}
                  style={{
                    fontSize: 12,
                    color: t.secondary,
                    background: t.surface,
                    border: `1px solid ${t.border}`,
                    borderRadius: 999,
                    padding: '4px 10px',
                  }}
                >
                  {lang}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Primary CTAs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 20 }}>
          <button
            type="button"
            className="interactive"
            onClick={() => void handleSave()}
            style={{
              minHeight: 48,
              borderRadius: 12,
              border: 'none',
              background: `linear-gradient(135deg, ${accent}, #00d4d4)`,
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              padding: '10px 8px',
            }}
          >
            💾 Uložit kontakt
          </button>
          <button
            type="button"
            className="interactive"
            onClick={() => onExchange?.()}
            style={{
              minHeight: 48,
              borderRadius: 12,
              border: `1px solid ${accent}`,
              background: t.surface,
              color: t.text,
              fontWeight: 700,
              fontSize: 13,
              cursor: preview && !onExchange ? 'default' : 'pointer',
              padding: '10px 8px',
            }}
          >
            🔄 Poslat mi svou vizitku
          </button>
        </div>

        {/* Socials */}
        {socials.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              marginTop: 18,
              justifyContent: 'center',
            }}
          >
            {socials.map((s) => (
              <a
                key={s.key}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.key}
                className="interactive"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: t.surface,
                  border: `1px solid ${t.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: s.color === '#ffffff' && card.theme === 'graphite' ? t.text : s.color,
                  textDecoration: 'none',
                }}
              >
                <s.Icon size={18} />
              </a>
            ))}
          </div>
        ) : null}

        {/* Contact tiles */}
        {contactTiles.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
            {contactTiles.map((tile) => (
              <a
                key={tile.key}
                href={tile.href}
                target={tile.key === 'web' || tile.key === 'calendar' || tile.key === 'whatsapp' ? '_blank' : undefined}
                rel="noopener noreferrer"
                className="interactive"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  borderRadius: 12,
                  background: tile.highlight ? `${accent}18` : t.surface,
                  border: `1px solid ${tile.highlight ? accent : t.border}`,
                  color: t.text,
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: tile.highlight ? 700 : 500,
                }}
              >
                <tile.Icon size={18} style={{ color: accent, flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tile.label}
                </span>
              </a>
            ))}
          </div>
        ) : null}

        {/* About */}
        {card.whatIDo ? (
          <section style={{ marginTop: 24 }}>
            <h2
              style={{
                margin: '0 0 8px',
                fontSize: 11,
                letterSpacing: '0.08em',
                color: accent,
                fontWeight: 700,
              }}
            >
              O MNĚ
            </h2>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: t.secondary }}>{card.whatIDo}</p>
          </section>
        ) : null}

        {/* Looking for */}
        {card.lookingFor ? (
          <section
            style={{
              marginTop: 20,
              padding: '14px 16px',
              borderRadius: 12,
              background: t.surface,
              borderLeft: `3px solid ${accent}`,
            }}
          >
            <h2
              style={{
                margin: '0 0 6px',
                fontSize: 11,
                letterSpacing: '0.08em',
                color: accent,
                fontWeight: 700,
              }}
            >
              CO HLEDÁM
            </h2>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: t.text }}>{card.lookingFor}</p>
          </section>
        ) : null}

        {/* Custom links */}
        {card.links.length > 0 ? (
          <section style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {card.links.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="interactive"
                  onClick={() => {
                    if (!preview) onLinkClick?.(link.id, link.url)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 16px',
                    borderRadius: 12,
                    background: t.surface,
                    border: `1px solid ${t.border}`,
                    color: t.text,
                    textDecoration: 'none',
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  <span style={{ fontSize: 18 }}>{linkEmoji(link.icon)}</span>
                  <span style={{ flex: 1 }}>{link.label}</span>
                  <IconChevronRight size={16} style={{ color: t.muted }} />
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {/* Events */}
        {card.events.length > 0 ? (
          <section style={{ marginTop: 24 }}>
            <h2
              style={{
                margin: '0 0 12px',
                fontSize: 11,
                letterSpacing: '0.08em',
                color: accent,
                fontWeight: 700,
              }}
            >
              KDE MĚ POTKÁŠ
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {card.events.map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    display: 'flex',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: t.surface,
                    border: `1px solid ${t.border}`,
                  }}
                >
                  <IconCalendarEvent size={18} style={{ color: accent, marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{ev.name}</div>
                    <div style={{ fontSize: 12, color: t.secondary, marginTop: 2 }}>
                      {[ev.city, formatEventDates(ev.date_from, ev.date_to)].filter(Boolean).join(' · ')}
                    </div>
                    {ev.booth ? (
                      <div style={{ fontSize: 12, color: accent, marginTop: 2 }}>Stánek {ev.booth}</div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Footer branding */}
        {!card.brandingRemoved ? (
          <footer style={{ marginTop: 36, textAlign: 'center' }}>
            <a
              href={`https://abccard.io?ref=card_${encodeURIComponent(card.slug)}`}
              style={{
                color: t.muted,
                fontSize: 12,
                textDecoration: 'none',
              }}
            >
              ⚡ Powered by ABC — vytvoř si svou vizitku zdarma
            </a>
          </footer>
        ) : null}

        {preview ? (
          <p style={{ display: 'none' }} aria-hidden>
            {CARD_PUBLIC_BASE}/{card.slug}
          </p>
        ) : null}
      </div>
    </div>
  )
}
