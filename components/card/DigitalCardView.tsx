'use client'

import { useState } from 'react'
import {
  IconBrandApple,
  IconBrandFacebook,
  IconBrandGoogle,
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
  IconShare2,
  IconWorld,
} from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'
import type { DigitalCardData, SocialNetwork } from '@/lib/card/types'
import { LINK_ICON_OPTIONS, CARD_PUBLIC_BASE, isHeroLayout } from '@/lib/card/types'
import CardHero from '@/components/card/CardHero'
import ShowcaseGallery from '@/components/card/ShowcaseGallery'
import { isSocialVisible } from '@/lib/card/public-data'
import { whatsappMeUrl } from '@/lib/card/social'
import { getCardThemeTokens, glassBorder, glassSurface } from '@/lib/card/theme'

type Props = {
  card: DigitalCardData
  /** Preview mode disables tracking / exchange callbacks optional */
  preview?: boolean
  onExchange?: () => void
  onLinkClick?: (linkId: string, url: string) => void
  onSaveContact?: () => void
  /** Which wallets can actually issue a pass in this deployment. */
  wallet?: { apple: boolean; google: boolean }
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
  wallet = { apple: false, google: false },
}: Props) {
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle')
  const base = getCardThemeTokens(card.theme)
  const accent = card.accent
  // The action hierarchy follows the chosen composition, not the cutout: a
  // hero card whose subject is missing is still a hero card.
  const hero = isHeroLayout(card.media.portrait)

  /*
    Over a full-bleed card the chrome turns to glass.

    Every row, chip and tile below reads `t.surface`, and `t.surface` is
    opaque — so the artwork ran behind the content and was then covered by it,
    panel by panel. Substituting the token here rather than at thirteen call
    sites keeps one definition of what a surface is, and means a control added
    later inherits the right answer instead of punching another hole in the
    composition.

    The artwork behind the content is already softened, so translucency alone
    is enough; no backdrop filter, which a phone would pay for on every row.
  */
  const glass = hero && Boolean(card.coverUrl)
  const t = glass
    ? {
        ...base,
        surface: glassSurface(base, 0.42),
        surface2: glassSurface(base, 0.58),
        border: glassBorder(base),
      }
    : base

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

  /** Native share where the browser has it, clipboard everywhere else. */
  async function handleShare() {
    const url = `${CARD_PUBLIC_BASE}/${card.slug}`
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: card.fullName, text: `${card.fullName} — ABC Card`, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setShareState('copied')
      setTimeout(() => setShareState('idle'), 2000)
    } catch (err) {
      // A dismissed share sheet is not a failure worth reporting.
      if ((err as Error)?.name !== 'AbortError') console.error('[card] share failed:', err)
    }
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
      {/*
        Hero, person, logo and identity all come from CardHero — the same
        component /my-card and the editor preview use, so a card cannot look
        one way here and another way on its owner's dashboard.
      */}
      <CardHero card={card} size="full">
        {card.tagline ? (
          <p style={{ margin: '4px 0 0', fontSize: 15, lineHeight: 1.5, fontWeight: 500 }}>
            {card.tagline}
          </p>
        ) : null}

        {/*
          Languages are metadata, not identity. In hero they move below the
          actions so nothing sits between the name and how to reach the person.
        */}
        {card.languages.length > 0 && !hero ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
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

        {/*
          Hero presents the same actions as a composed set rather than a list:
          a compact icon row for reaching the person, then one family of rows
          for what to do with the card. Classic keeps the list it already has,
          so an existing card is not restyled underneath its owner.
        */}
        {hero ? (
          <>
            {actions.length > 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: actions.length > 4 ? 'space-between' : 'flex-start',
                  gap: 10,
                  marginTop: 20,
                }}
              >
                {actions.map((action) => (
                  <a
                    key={action.key}
                    href={action.href}
                    target={action.external ? '_blank' : undefined}
                    rel={action.external ? 'noopener noreferrer' : undefined}
                    className="interactive"
                    aria-label={action.label}
                    style={{
                      flex: '1 1 60px',
                      minWidth: 58,
                      maxWidth: 84,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                      textDecoration: 'none',
                      color: t.secondary,
                    }}
                  >
                    <span
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: '50%',
                        background: t.surface,
                        border: `1px solid ${t.border}`,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: accent,
                      }}
                    >
                      <action.Icon size={21} stroke={1.7} />
                    </span>
                    <span style={{ fontSize: 11.5, fontWeight: 500, textAlign: 'center' }}>
                      {action.label}
                    </span>
                  </a>
                ))}
              </div>
            ) : null}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 22 }}>
              <ActionRow
                Icon={IconBrandApple}
                title="Add to Apple Wallet"
                subtitle="Not available yet"
                tokens={t}
                accent={accent}
              />
              <ActionRow
                Icon={IconBrandGoogle}
                title="Add to Google Wallet"
                subtitle="Not available yet"
                tokens={t}
                accent={accent}
              />
              <ActionRow
                Icon={IconDownload}
                title="Save Contact"
                subtitle="Save to your phone"
                tokens={t}
                accent={accent}
                onClick={handleSave}
              />
              <ActionRow
                Icon={IconShare2}
                title={shareState === 'copied' ? 'Link copied' : 'Share Card'}
                subtitle="Share link or QR code"
                tokens={t}
                accent={accent}
                onClick={() => void handleShare()}
              />
            </div>
          </>
        ) : null}

        {!hero && actions.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 22 }}>
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
              marginTop: 14,
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

        {hero && card.languages.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 18 }}>
            {card.languages.map((lang) => (
              <span
                key={lang}
                style={{
                  fontSize: 11.5,
                  color: t.muted,
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

        {/*
          Classic's save/share block. Hero renders the same four concepts as
          one row family above, so showing this too would give the card two
          competing Save buttons.
        */}
        <div style={{ marginTop: 24, display: hero ? 'none' : undefined }}>
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

          <button
            type="button"
            className="interactive"
            onClick={() => void handleShare()}
            style={{
              width: '100%',
              minHeight: 52,
              marginTop: 10,
              borderRadius: 13,
              border: `1px solid ${t.border}`,
              background: t.surface,
              color: t.text,
              fontWeight: 600,
              fontSize: 14.5,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 9,
            }}
          >
            <IconShare2 size={18} stroke={1.8} />
            {shareState === 'copied' ? 'Link copied' : 'Share card'}
          </button>

          {/* Wallet — shown only where a real pass can be issued */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <WalletButton
              label="Apple Wallet"
              Icon={IconBrandApple}
              href={`/api/card/wallet/apple/${encodeURIComponent(card.slug)}`}
              available={wallet.apple}
              tokens={t}
            />
            <WalletButton
              label="Google Wallet"
              Icon={IconBrandGoogle}
              href={`/api/card/wallet/google/${encodeURIComponent(card.slug)}`}
              available={wallet.google}
              tokens={t}
            />
          </div>

          {!wallet.apple && !wallet.google ? (
            <p
              style={{
                margin: '8px 0 0',
                fontSize: 11.5,
                lineHeight: 1.45,
                color: t.muted,
                textAlign: 'center',
              }}
            >
              Wallet passes are not available yet.
            </p>
          ) : null}
        </div>

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

        {/* What they actually do — below identity and contact, never above */}
        {card.showcaseEnabled && card.showcaseItems.length > 0 ? (
          <ShowcaseGallery
            title={card.showcaseTitle}
            items={card.showcaseItems}
            tokens={t}
            accent={accent}
          />
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

        <div style={{ height: 40 }} aria-hidden />
      </CardHero>
    </div>
  )
}

/**
 * One premium row, used for the whole save/share/wallet family so they read as
 * siblings rather than four unrelated controls.
 *
 * A row without an `onClick` is not merely styled as unavailable — it renders
 * as a non-interactive element with `aria-disabled`, so a Wallet row cannot be
 * tapped, focused or activated into pretending a pass was added.
 */
function ActionRow({
  Icon,
  title,
  subtitle,
  tokens,
  accent,
  onClick,
}: {
  Icon: TablerIcon
  title: string
  subtitle: string
  tokens: { surface: string; surface2: string; border: string; text: string; muted: string }
  accent: string
  onClick?: () => void
}) {
  const available = Boolean(onClick)

  const inner = (
    <>
      <span
        style={{
          width: 40,
          height: 40,
          borderRadius: 11,
          background: tokens.surface2,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: available ? accent : tokens.muted,
          flexShrink: 0,
        }}
      >
        <Icon size={20} stroke={1.7} />
      </span>
      <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
        <span
          style={{
            display: 'block',
            fontSize: 14.5,
            fontWeight: 600,
            color: available ? tokens.text : tokens.muted,
          }}
        >
          {title}
        </span>
        <span style={{ display: 'block', fontSize: 12.5, color: tokens.muted, marginTop: 1 }}>
          {subtitle}
        </span>
      </span>
      {available ? (
        <IconChevronRight size={17} stroke={1.8} style={{ color: tokens.muted, flexShrink: 0 }} />
      ) : null}
    </>
  )

  const shared: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 13,
    width: '100%',
    padding: '12px 15px',
    borderRadius: 14,
    background: tokens.surface,
    border: `1px solid ${tokens.border}`,
    minHeight: 64,
  }

  if (!available) {
    return (
      <span aria-disabled="true" style={{ ...shared, opacity: 0.6 }}>
        {inner}
      </span>
    )
  }

  return (
    <button type="button" className="interactive" onClick={onClick} style={{ ...shared, cursor: 'pointer' }}>
      {inner}
    </button>
  )
}

/**
 * A wallet action is rendered only as honestly as it can behave. When the
 * deployment has no signing credentials the control is visibly unavailable and
 * says so — it is never wired to a vCard download to appear functional.
 */
function WalletButton({
  label,
  Icon,
  href,
  available,
  tokens,
}: {
  label: string
  Icon: TablerIcon
  href: string
  available: boolean
  tokens: { surface: string; border: string; text: string; muted: string }
}) {
  const shared = {
    minHeight: 50,
    borderRadius: 13,
    border: `1px solid ${tokens.border}`,
    fontWeight: 600,
    fontSize: 13.5,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    textDecoration: 'none',
  } as const

  if (!available) {
    return (
      <span
        aria-disabled="true"
        title={`${label} is not available yet`}
        style={{
          ...shared,
          background: 'transparent',
          color: tokens.muted,
          cursor: 'not-allowed',
          opacity: 0.65,
        }}
      >
        <Icon size={17} stroke={1.8} />
        {label}
      </span>
    )
  }

  return (
    <a href={href} className="interactive" style={{ ...shared, background: tokens.surface, color: tokens.text }}>
      <Icon size={17} stroke={1.8} />
      {label}
    </a>
  )
}
