'use client'

import { IconMapPin } from '@tabler/icons-react'
import type { DigitalCardData } from '@/lib/card/types'
import {
  backgroundStyle,
  hasHeroSubject,
  heroAspectRatio,
  isHeroLayout,
  transformStyle,
} from '@/lib/card/types'
import { getCardThemeTokens, heroScrimGradient, initialsFromName } from '@/lib/card/theme'

/**
 * The card's media identity surface — background, person, logo, identity —
 * and the single renderer for all of it.
 *
 * This exists because there were two. The public card and the full preview
 * read the owner's saved framing; /my-card and the editor's side preview drew
 * their own circle with a hardcoded object-position, so a portrait the owner
 * had carefully framed came out cropped on their own dashboard and correct
 * everywhere else. Sizes may differ between surfaces. The composition may not,
 * so it is computed once, here.
 *
 * Everything that varies with surface is a size token; everything that varies
 * with the card is a saved value. There is deliberately no prop for adjusting
 * the crop — a caller cannot opt out of the owner's framing.
 */

export type CardHeroSize = 'full' | 'compact'

/** The one place a surface's proportions are decided. */
const SIZES = {
  full: {
    padding: '0 20px',
    nameSize: 'clamp(26px, 7.4vw, 30px)',
    subtitleSize: 14.5,
    logoHeight: 34,
    ringWidth: 3,
    badge: true,
  },
  compact: {
    padding: '0 16px',
    nameSize: 'clamp(18px, 5vw, 23px)',
    subtitleSize: 12.5,
    logoHeight: 24,
    ringWidth: 2,
    badge: false,
  },
} as const

/**
 * Percentages, not pixels, so the person occupies the same fraction of the
 * card on a 350px dashboard tile as on a 460px public card. A percentage width
 * resolves against the containing block, which is the card itself in both
 * cases — that is what keeps the two compositions identical rather than merely
 * similar.
 */
const PORTRAIT_WIDTH = 'clamp(84px, 48%, 196px)'
/**
 * Slightly under half, because the two percentages resolve against different
 * boxes: the portrait's width against the padded content box, the pull-up
 * margin against the card. 0.47 lands the visible overlap at the approved
 * ~52% across the phone widths that matter, drifting a few points only once
 * the card hits its 460px ceiling.
 */
const PORTRAIT_OVERLAP = 0.47

export default function CardHero({
  card,
  size = 'full',
  children,
}: {
  card: DigitalCardData
  size?: CardHeroSize
  /** Rendered inside the identity block, below the name — actions, chips. */
  children?: React.ReactNode
}) {
  const s = SIZES[size]
  const t = getCardThemeTokens(card.theme)
  const accent = card.accent
  const portrait = card.media.portrait
  /*
    Two separate questions, never collapsed into one.

    `hero` is the composition the owner chose. It decides the frame, the logo
    placement and the identity block, and it holds even when there is no
    cutout — a hero card missing its subject renders as a hero card with an
    empty foreground, not as a circular portrait. The circle is Classic's, and
    showing it under Hero is what made the two designs indistinguishable.

    `person` is only ever about whether there is a transparent subject to
    paint. It gates one layer.
  */
  const hero = isHeroLayout(portrait)
  const person = hasHeroSubject(portrait)
  const subtitle = [card.jobTitle, card.companyName].filter(Boolean).join(' · ')
  const scrim = heroScrimGradient(card.media.background.overlay, t)

  return (
    <div style={{ position: 'relative' }}>
      {/*
        The hero, in explicit layers: background 0, scrim 1, person 2, logo 3,
        identity 4. The order is a property of the markup rather than of
        document flow, so a scrim can never paint over a face.
      */}
      <header
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: String(heroAspectRatio(portrait)),
          // The card's own surface shows through wherever a "fit" background
          // or a transparent person does not cover it — never a checkerboard.
          background: t.surface,
          isolation: 'isolate',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden' }}>
          {card.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.coverUrl}
              alt=""
              style={{ ...backgroundStyle(card.media.background, card.coverFit), display: 'block' }}
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
        </div>

        <div
          aria-hidden
          style={{ position: 'absolute', inset: 0, zIndex: 1, background: scrim }}
        />

        {/*
          The person, above the scrim by construction. Darkening protects the
          artwork's readability; darkening the human being would defeat the
          entire composition.
        */}
        {person ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={portrait.cutoutUrl as string}
            alt={card.fullName}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 2,
              width: '100%',
              height: '100%',
              // contain, never cover: a person must not be cropped or stretched
              // to fill a frame they were composed into.
              objectFit: 'contain',
              objectPosition: `${portrait.x}% ${portrait.y}%`,
              transform: `scale(${portrait.scale})`,
              transformOrigin: 'center bottom',
              // A short fade at the very bottom only. The head and face are far
              // outside it, so nothing that matters is ever softened.
              WebkitMaskImage:
                'linear-gradient(180deg, #000 0%, #000 88%, rgba(0,0,0,0.45) 96%, transparent 100%)',
              maskImage:
                'linear-gradient(180deg, #000 0%, #000 88%, rgba(0,0,0,0.45) 96%, transparent 100%)',
            }}
          />
        ) : null}

        {s.badge ? (
          <span
            style={{
              position: 'absolute',
              zIndex: 4,
              top: 16,
              left: 20,
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.75)',
            }}
          >
            ABC Card
          </span>
        ) : null}

        {/*
          In hero mode the logo belongs inside the composition, opposite the
          person. It keeps its own layer and its own object-contain — it never
          inherits the person's or the background's scaling.
        */}
        {hero && card.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.logoUrl}
            alt={card.companyName || ''}
            style={{
              position: 'absolute',
              zIndex: 3,
              top: size === 'full' ? 18 : 12,
              right: size === 'full' ? 20 : 16,
              height: s.logoHeight,
              width: 'auto',
              maxWidth: '38%',
              objectFit: 'contain',
            }}
          />
        ) : null}
      </header>

      {/*
        Identity. In classic it is pulled up so the circular portrait straddles
        the hero edge — and that circle is classic's alone, gated on the layout
        below, so hero can never produce one. In hero it is pulled up too, but
        for the opposite reason: the scrim already fades the artwork into the
        card background, so overlapping slightly lets the name sit in that fade
        instead of starting after a hard horizontal seam.
      */}
      <div
        style={{
          position: 'relative',
          zIndex: 4,
          padding: s.padding,
          marginTop: hero ? -18 : `calc(${PORTRAIT_WIDTH} * -${PORTRAIT_OVERLAP})`,
        }}
      >
        {!hero ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14 }}>
            <div
              style={{
                width: PORTRAIT_WIDTH,
                aspectRatio: '1',
                borderRadius: '50%',
                overflow: 'hidden',
                background: t.surface2,
                boxShadow: `inset 0 0 0 ${s.ringWidth}px ${accent}, 0 18px 44px rgba(0,0,0,0.6)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {card.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.photoUrl} alt={card.fullName} style={transformStyle(portrait)} />
              ) : (
                <span style={{ color: t.secondary, fontSize: 'clamp(24px, 14%, 52px)', fontWeight: 700 }}>
                  {initialsFromName(card.fullName)}
                </span>
              )}
            </div>

            {card.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.logoUrl}
                alt={card.companyName || ''}
                style={{
                  height: s.logoHeight,
                  width: 'auto',
                  maxWidth: 120,
                  objectFit: 'contain',
                  marginBottom: 6,
                }}
              />
            ) : null}
          </div>
        ) : null}

        <div style={{ marginTop: hero ? 0 : 16 }}>
          <h1
            style={{
              margin: 0,
              fontSize: s.nameSize,
              lineHeight: 1.15,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: t.text,
            }}
          >
            {card.fullName || 'Your name'}
          </h1>

          {subtitle ? (
            <p style={{ margin: '7px 0 0', fontSize: s.subtitleSize, color: t.secondary, lineHeight: 1.45 }}>
              {subtitle}
            </p>
          ) : null}

          {card.showLocation && card.location ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                marginTop: 10,
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
        </div>

        {children}
      </div>
    </div>
  )
}
