'use client'

import { IconMapPin } from '@tabler/icons-react'
import type { DigitalCardData } from '@/lib/card/types'
import {
  backgroundStyle,
  hasHeroSubject,
  heroAspectRatio,
  isHeroLayout,
  transformStyle,
  type GraphicLayer,
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

/**
 * One optional layer, anchored the same way the person and the logo are.
 *
 * Width is a share of the hero rather than a pixel size, so a badge keeps its
 * proportion between the full card and the compact preview.
 */
function GraphicLayerView({
  graphic,
  zIndex,
  index,
}: {
  graphic: GraphicLayer
  zIndex: number
  index: number
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex, overflow: 'hidden' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        data-hero-layer={`graphic-${index}`}
        src={graphic.url}
        alt=""
        style={{
          position: 'absolute',
          left: `${graphic.x}%`,
          top: `${graphic.y}%`,
          transform: `translate(-${graphic.x}%, -${graphic.y}%)`,
          width: `${GRAPHIC_BASE_WIDTH * graphic.scale}%`,
          height: 'auto',
          objectFit: 'contain',
          opacity: graphic.opacity,
        }}
      />
    </div>
  )
}

/** A graphic at scale 1 covers this share of the hero's width. */
const GRAPHIC_BASE_WIDTH = 26

/*
  The hero logo's box, in proportions rather than pixels.

  These reproduce what the full card already draws: on a 390px hero the inset
  works out at 19.5px across and 18.6px down against the previous 20px and
  18px, and the logo stands 33.4px tall against the previous 34px. Under a
  pixel a side, so nobody's published card visibly moves — while the compact
  preview, which used to draw a smaller logo inside a tighter box, now matches
  the card it is previewing.
*/
const LOGO_INSET_X = 5
const LOGO_INSET_Y = 5
/** Share of the inset box's height the logo occupies at scale 1. */
const LOGO_BASE_HEIGHT = 10
/** The same visual size measured against the whole hero, for anchored logos. */
const LOGO_BASE_HEIGHT_ANCHOR = 9

/**
 * A short fade at the very bottom only. The head and face are far outside it,
 * so nothing that matters is ever softened.
 */
const PERSON_FADE =
  'linear-gradient(180deg, #000 0%, #000 88%, rgba(0,0,0,0.45) 96%, transparent 100%)'

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
  const logo = card.media.logo
  // Indexed before filtering so a layer keeps its identity in the saved list
  // no matter which ones are hidden.
  const graphics = card.media.graphics
    .map((layer, index) => ({ layer, index }))
    .filter(({ layer }) => layer.visible && layer.url)
  const graphicsBehind = hero ? graphics.filter((g) => g.layer.placement === 'behind-person') : []
  const graphicsFront = hero ? graphics.filter((g) => g.layer.placement === 'front-person') : []
  const subtitle = [card.jobTitle, card.companyName].filter(Boolean).join(' · ')
  const scrim = heroScrimGradient(card.media.background.overlay, t)

  return (
    <div style={{ position: 'relative' }}>
      {/*
        The hero, in explicit layers: background 0, scrim 1, graphics-behind 2,
        person 3, graphics-front 4, logo 5, identity above all of them. The
        order is a property of the markup rather than of document flow, so a
        scrim can never paint over a face, and no design layer can ever land on
        top of the name or the actions.

        The data-hero-layer attributes are how the editor's canvas finds a
        layer to hit-test against. They are inert everywhere else.
      */}
      <header
        data-hero-frame
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
        {graphicsBehind.map((g) => (
          <GraphicLayerView key={`behind-${g.index}`} graphic={g.layer} zIndex={2} index={g.index} />
        ))}

        {person ? (
          <div style={{ position: 'absolute', inset: 0, zIndex: 3, overflow: 'hidden' }}>
            {/*
              Two ways to place one person, and which one applies is recorded
              on the card rather than inferred.

              Legacy is the original markup, unchanged: the image fills the
              frame, object-position slides it through whatever space is left
              over, and the scale pivots on the frame's bottom centre. Every
              card saved before the composer renders through exactly this, so
              deploying the composer moves nobody's portrait.

              Anchored puts the subject's centre at the chosen point of the
              frame. That is what allows real vertical movement — the legacy
              reading has no spare vertical space to slide through, so up and
              down did nothing — and at the centre it lands precisely where the
              legacy path already drew a full-height subject, which is why the
              conversion is invisible.
            */}
            {portrait.positionModel === 'anchor' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                data-hero-layer="person"
                src={portrait.cutoutUrl as string}
                alt={card.fullName}
                style={{
                  position: 'absolute',
                  left: `${portrait.x}%`,
                  top: `${portrait.y}%`,
                  transform: `translate(-50%, -50%) scale(${portrait.scale})`,
                  height: '100%',
                  width: 'auto',
                  // Contained in both orientations: a wide cutout is limited
                  // by the frame's width, a tall one by its height.
                  maxWidth: '100%',
                  objectFit: 'contain',
                  WebkitMaskImage: PERSON_FADE,
                  maskImage: PERSON_FADE,
                }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                data-hero-layer="person"
                src={portrait.cutoutUrl as string}
                alt={card.fullName}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  // contain, never cover: a person must not be cropped or
                  // stretched to fill a frame they were composed into.
                  objectFit: 'contain',
                  objectPosition: `${portrait.x}% ${portrait.y}%`,
                  transform: `scale(${portrait.scale})`,
                  transformOrigin: 'center bottom',
                  WebkitMaskImage: PERSON_FADE,
                  maskImage: PERSON_FADE,
                }}
              />
            )}
          </div>
        ) : null}

        {graphicsFront.map((g) => (
          <GraphicLayerView key={`front-${g.index}`} graphic={g.layer} zIndex={4} index={g.index} />
        ))}

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
          In hero mode the logo is a placed layer, not a corner ornament. It
          keeps its own z-index above the person and its own object-contain, so
          it never inherits the person's or the background's scaling, and the
          scrim below never dims it.

          Every number here is a proportion of the hero, and that is the whole
          point. The inset and the logo's height used to be pixel tokens that
          differed by surface — 20px and 34px on the full card, 16px and 24px
          on the compact one — so the same saved x/y resolved against a
          differently-shaped box and against a logo that was a different
          fraction of it. One transform came out at 82% of the way across on
          the public card and 85% in the editor. A composer whose preview
          disagrees with the card is not a composer.

          Position is an anchor: the named point of the logo is placed at the
          same point of the inset box, so 0 pins its left edge to the left
          inset and 100 pins its right edge to the right inset. With the box
          and the logo both sized in percentages, that anchor now lands on the
          same normalized point at every width. The constants are chosen to
          reproduce the previous full-card geometry to within a pixel, so no
          existing card moves — it is the editor's preview that was wrong, and
          it is the preview that changes.
        */}
        {hero && card.logoUrl && logo.visible ? (
          <div
            style={{
              position: 'absolute',
              zIndex: 5,
              /*
                An anchored logo is placed against the hero itself, so a saved
                82/18 is 82/18 of the card — the number the owner sees in the
                editor is the number the recipient's card resolves. The legacy
                box keeps its inset, because that inset is what its edge
                anchoring has always been measured against.
              */
              inset:
                logo.positionModel === 'anchor'
                  ? 0
                  : `${LOGO_INSET_Y}% ${LOGO_INSET_X}%`,
              pointerEvents: 'none',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              data-hero-layer="logo"
              src={card.logoUrl}
              alt={card.companyName || ''}
              style={{
                position: 'absolute',
                left: `${logo.x}%`,
                top: `${logo.y}%`,
                /*
                  Anchored logos hold their centre, so resizing one grows it
                  around the point it was put rather than sliding it toward the
                  middle. Legacy logos keep pinning an edge, which is how every
                  card saved before the composer was drawn.
                */
                transform:
                  logo.positionModel === 'anchor'
                    ? 'translate(-50%, -50%)'
                    : `translate(-${logo.x}%, -${logo.y}%)`,
                height: `${(logo.positionModel === 'anchor' ? LOGO_BASE_HEIGHT_ANCHOR : LOGO_BASE_HEIGHT) * logo.scale}%`,
                width: 'auto',
                maxWidth: '60%',
                objectFit: 'contain',
                opacity: logo.opacity,
              }}
            />
          </div>
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
