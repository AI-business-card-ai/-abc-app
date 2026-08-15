'use client'

import {
  IconBrandFacebook,
  IconBrandGithub,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandThreads,
  IconBrandTiktok,
  IconBrandWhatsapp,
  IconBrandX,
  IconBrandYoutube,
  IconCalendarEvent,
  IconChevronRight,
  IconDownload,
  IconMail,
  IconMapPin,
  IconPhone,
  IconSend,
  IconWorld,
} from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'
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

const SOCIAL_ICONS: Record<SocialNetwork, { Icon: TablerIcon; label: string; urlKey: keyof DigitalCardData }> = {
  linkedin: { Icon: IconBrandLinkedin, label: 'LinkedIn', urlKey: 'linkedinUrl' },
  instagram: { Icon: IconBrandInstagram, label: 'Instagram', urlKey: 'instagramUrl' },
  x: { Icon: IconBrandX, label: 'X', urlKey: 'xUrl' },
  facebook: { Icon: IconBrandFacebook, label: 'Facebook', urlKey: 'facebookUrl' },
  youtube: { Icon: IconBrandYoutube, label: 'YouTube', urlKey: 'youtubeUrl' },
  tiktok: { Icon: IconBrandTiktok, label: 'TikTok', urlKey: 'tiktokUrl' },
  github: { Icon: IconBrandGithub, label: 'GitHub', urlKey: 'githubUrl' },
  threads: { Icon: IconBrandThreads, label: 'Threads', urlKey: 'threadsUrl' },
}

function linkEmoji(icon: string): string {
  return LINK_ICON_OPTIONS.find((o) => o.id === icon)?.emoji || '🔗'
}

function formatEventDates(from: string | null, to: string | null): string {
  if (!from && !to) return ''
  const fmt = (d: string) => {
    try {
      return new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', {
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

/**
 * The public digital card — what a visitor sees straight after scanning.
 *
 * Deliberately shallow: who this is, then one primary action (save the
 * contact), then the handful of ways to reach them. Nothing from the CRM side
 * of the product appears here — no scores, stages, notes or meeting context.
 */
export default function DigitalCardView({
  card,
  preview = false,
  onExchange,
  onLinkClick,
  onSaveContact,
}: Props) {
  const t = getCardThemeTokens(card.theme)
  const accent = card.accent
  const initials = initialsFromName(card.fullName)
  const subtitle = [card.jobTitle, card.companyName].filter(Boolean).join(' · ')

  const socials = (Object.keys(SOCIAL_ICONS) as SocialNetwork[])
    .map((key) => {
      const meta = SOCIAL_ICONS[key]
      const url = card[meta.urlKey] as string | null
      if (!isSocialVisible(card, key, url)) return null
      return { key, url: url as string, ...meta }
    })
    .filter(Boolean) as {
    key: SocialNetwork
    url: string
    Icon: TablerIcon
    label: string
  }[]

  /** Only genuinely saved channels become actions. */
  const actions: {
    key: string
    label: string
    value: string
    href: string
    Icon: TablerIcon
    external?: boolean
  }[] = []

  if (card.showPhone && card.phone) {
    actions.push({
      key: 'call',
      label: 'Call',
      value: card.phone,
      href: `tel:${card.phone}`,
      Icon: IconPhone,
    })
  }
  if (card.showEmail && card.email) {
    actions.push({
      key: 'email',
      label: 'Email',
      value: card.email,
      href: `mailto:${card.email}`,
      Icon: IconMail,
    })
  }
  if (card.showWhatsapp && card.whatsapp) {
    actions.push({
      key: 'whatsapp',
      label: 'WhatsApp',
      value: card.whatsapp,
      href: whatsappMeUrl(card.whatsapp),
      Icon: IconBrandWhatsapp,
      external: true,
    })
  }
  if (card.showWebsite && card.website) {
    actions.push({
      key: 'website',
      label: 'Website',
      value: card.website.replace(/^https?:\/\//i, '').replace(/\/$/, ''),
      href: card.website,
      Icon: IconWorld,
      external: true,
    })
  }
  const linkedin = socials.find((s) => s.key === 'linkedin')
  if (linkedin) {
    actions.push({
      key: 'linkedin',
      label: 'LinkedIn',
      value: linkedin.url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''),
      href: linkedin.url,
      Icon: IconBrandLinkedin,
      external: true,
    })
  }
  if (card.showCalendar && card.calendarUrl) {
    actions.push({
      key: 'calendar',
      label: 'Book a time',
      value: card.calendarUrl.replace(/^https?:\/\//i, ''),
      href: card.calendarUrl,
      Icon: IconCalendarEvent,
      external: true,
    })
  }

  const otherSocials = socials.filter((s) => s.key !== 'linkedin')

  function handleSave() {
    if (onSaveContact) {
      onSaveContact()
      return
    }
    window.location.href = `/api/card/vcard/${encodeURIComponent(card.slug)}`
  }

  const meta = [
    card.showLocation && card.location ? card.location : null,
    ...card.languages,
  ].filter(Boolean) as string[]

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 460,
        margin: '0 auto',
        minHeight: preview ? '100%' : '100vh',
        background: t.bg,
        color: t.text,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      {/* Cover — a saved image, otherwise a restrained accent wash */}
      <div
        style={{
          position: 'relative',
          height: card.coverUrl ? 148 : 96,
          background: t.surface,
        }}
      >
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
            background: `linear-gradient(180deg, transparent 30%, ${t.bg})`,
          }}
        />
        <span
          style={{
            position: 'absolute',
            top: 16,
            left: 20,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: t.muted,
          }}
        >
          ABC Card
        </span>
      </div>

      <div style={{ padding: '0 20px 40px', marginTop: -40 }}>
        {/* Identity */}
        <div
          style={{
            width: 92,
            height: 92,
            borderRadius: '50%',
            overflow: 'hidden',
            background: t.surface2,
            boxShadow: `inset 0 0 0 2px ${accent}, 0 10px 28px rgba(0,0,0,0.45)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {card.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.photoUrl}
              alt={card.fullName}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{ color: t.secondary, fontSize: 30, fontWeight: 700 }}>{initials}</span>
          )}
        </div>

        <div style={{ marginTop: 16 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 26,
              lineHeight: 1.15,
              fontWeight: 700,
              letterSpacing: '-0.02em',
            }}
          >
            {card.fullName}
          </h1>

          {subtitle ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 7 }}>
              <p style={{ margin: 0, fontSize: 14.5, color: t.secondary, lineHeight: 1.45 }}>
                {subtitle}
              </p>
              {card.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.logoUrl}
                  alt=""
                  style={{ height: 20, width: 'auto', maxWidth: 56, objectFit: 'contain' }}
                />
              ) : null}
            </div>
          ) : null}

          {card.tagline ? (
            <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.5, fontWeight: 500 }}>
              {card.tagline}
            </p>
          ) : null}

          {meta.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {card.showLocation && card.location ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 12,
                    color: t.secondary,
                    background: t.surface,
                    border: `1px solid ${t.border}`,
                    borderRadius: 999,
                    padding: '5px 11px',
                  }}
                >
                  <IconMapPin size={13} stroke={1.8} />
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
                    padding: '5px 11px',
                  }}
                >
                  {lang}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Primary action */}
        <div style={{ marginTop: 24 }}>
          <button
            type="button"
            className="interactive"
            onClick={handleSave}
            style={{
              width: '100%',
              minHeight: 54,
              borderRadius: 13,
              border: 'none',
              background: accent,
              color: '#1a1205',
              fontWeight: 600,
              fontSize: 15.5,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 9,
            }}
          >
            <IconDownload size={19} stroke={1.9} />
            Save contact
          </button>
          <p
            style={{
              margin: '9px 0 0',
              fontSize: 12,
              lineHeight: 1.45,
              color: t.muted,
              textAlign: 'center',
            }}
          >
            Downloads a .vcf card — your phone asks where to save it.
          </p>
        </div>

        {/* Genuine reach-me actions */}
        {actions.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
            {actions.map((action) => (
              <a
                key={action.key}
                href={action.href}
                target={action.external ? '_blank' : undefined}
                rel={action.external ? 'noopener noreferrer' : undefined}
                className="interactive"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 13,
                  padding: '13px 15px',
                  borderRadius: 13,
                  background: t.surface,
                  border: `1px solid ${t.border}`,
                  color: t.text,
                  textDecoration: 'none',
                  minHeight: 54,
                }}
              >
                <action.Icon size={19} stroke={1.75} style={{ color: accent, flexShrink: 0 }} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600 }}>
                    {action.label}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 12.5,
                      color: t.secondary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginTop: 1,
                    }}
                  >
                    {action.value}
                  </span>
                </span>
                <IconChevronRight size={17} stroke={1.8} style={{ color: t.muted, flexShrink: 0 }} />
              </a>
            ))}
          </div>
        ) : null}

        {/* Remaining social profiles */}
        {otherSocials.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 9,
              marginTop: 18,
              justifyContent: 'center',
            }}
          >
            {otherSocials.map((s) => (
              <a
                key={s.key}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                title={s.label}
                className="interactive"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: t.surface,
                  border: `1px solid ${t.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: t.secondary,
                  textDecoration: 'none',
                }}
              >
                <s.Icon size={19} stroke={1.7} />
              </a>
            ))}
          </div>
        ) : null}

        {/* About */}
        {card.whatIDo ? (
          <section style={{ marginTop: 26 }}>
            <h2
              style={{
                margin: '0 0 9px',
                fontSize: 11,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: t.muted,
                fontWeight: 600,
              }}
            >
              About
            </h2>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: t.secondary }}>
              {card.whatIDo}
            </p>
          </section>
        ) : null}

        {/* Looking for */}
        {card.lookingFor ? (
          <section
            style={{
              marginTop: 20,
              padding: '15px 17px',
              borderRadius: 15,
              background: t.surface,
              border: `1px solid ${t.border}`,
              borderLeft: `3px solid ${accent}`,
            }}
          >
            <h2
              style={{
                margin: '0 0 7px',
                fontSize: 11,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: t.muted,
                fontWeight: 600,
              }}
            >
              Looking for
            </h2>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>{card.lookingFor}</p>
          </section>
        ) : null}

        {/* Saved links */}
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
                    borderRadius: 13,
                    background: t.surface,
                    border: `1px solid ${t.border}`,
                    color: t.text,
                    textDecoration: 'none',
                    fontSize: 14,
                    fontWeight: 600,
                    minHeight: 54,
                  }}
                >
                  <span style={{ fontSize: 18 }} aria-hidden>
                    {linkEmoji(link.icon)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>{link.label}</span>
                  <IconChevronRight size={17} stroke={1.8} style={{ color: t.muted }} />
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {/* Where to meet them */}
        {card.events.length > 0 ? (
          <section style={{ marginTop: 26 }}>
            <h2
              style={{
                margin: '0 0 12px',
                fontSize: 11,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: t.muted,
                fontWeight: 600,
              }}
            >
              Where to meet me
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {card.events.map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    display: 'flex',
                    gap: 12,
                    padding: '13px 15px',
                    borderRadius: 13,
                    background: t.surface,
                    border: `1px solid ${t.border}`,
                  }}
                >
                  <IconCalendarEvent
                    size={18}
                    stroke={1.75}
                    style={{ color: accent, marginTop: 2, flexShrink: 0 }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{ev.name}</div>
                    <div style={{ fontSize: 12.5, color: t.secondary, marginTop: 3 }}>
                      {[ev.city, formatEventDates(ev.date_from, ev.date_to)]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    {ev.booth ? (
                      <div style={{ fontSize: 12.5, color: accent, marginTop: 3 }}>
                        Stand {ev.booth}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Reciprocal exchange — secondary by design */}
        <div style={{ marginTop: 26 }}>
          <button
            type="button"
            className="interactive"
            onClick={() => onExchange?.()}
            style={{
              width: '100%',
              minHeight: 52,
              borderRadius: 13,
              border: `1px solid ${t.border}`,
              background: t.surface,
              color: t.text,
              fontWeight: 600,
              fontSize: 14.5,
              cursor: preview && !onExchange ? 'default' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 9,
            }}
          >
            <IconSend size={18} stroke={1.75} style={{ color: t.secondary }} />
            Send {card.fullName.split(' ')[0]} my details
          </button>
        </div>

        {!card.brandingRemoved ? (
          <footer style={{ marginTop: 34, textAlign: 'center' }}>
            <a
              href={`https://abccard.io?ref=card_${encodeURIComponent(card.slug)}`}
              style={{ color: t.muted, fontSize: 12, textDecoration: 'none' }}
            >
              Powered by ABC Card
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
