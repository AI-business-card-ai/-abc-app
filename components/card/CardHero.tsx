'use client'

import { IconMapPin } from '@tabler/icons-react'
import type { DigitalCardData } from '@/lib/card/types'
import {
  backgroundStretchTransform,
  backgroundStyle,
  hasHeroSubject,
  heroAspectRatio,
  isHeroLayout,
  transformStyle,
  type BackgroundSizing,
  type BackgroundTransform,
  type GraphicLayer,
} from '@/lib/card/types'
import {
  HERO_TEXT_SHADOW,
  getCardThemeTokens,
  glassTokens,
  heroBleedScrimGradient,
  heroContentScrimGradient,
  heroScrimGradient,
  initialsFromName,
} from '@/lib/card/theme'

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
 * How the crisp hero artwork hands over to the softened continuation beneath
 * it. A cut would put a visible line across the card at the hero's edge, which
 * is the exact seam the full-bleed treatment exists to remove.
 */
const COVER_DISSOLVE =
  'linear-gradient(180deg, #000 0%, #000 62%, rgba(0,0,0,0.55) 86%, transparent 100%)'

/**
 * How far the identity block is pulled up over the hero.
 *
 * Shared with the content wash, which must stay perfectly clear for exactly
 * this distance so that pulling the name into the artwork never puts a wash
 * over the person standing in it.
 */
const HERO_CONTENT_OVERLAP = 18

/** Keeps the blur's own soft edges outside the card rather than along it. */
const BLEED_MARGIN = 1.14

/**
 * The artwork sized to the whole card rather than to the hero.
 *
 * Two of the three sizing modes are answered the same way here, and
 * deliberately. Fit is a statement about the hero — show the whole picture,
 * letterbox it if the composition needs that — and a layer whose only job is
 * to reach every corner of a card three times taller cannot honour it without
 * painting a band of picture across the middle and plain background above and
 * below. So fit and cover both cover down here, which is what keeps the lower
 * background from disappearing because of a choice made about the top.
 *
 * Stretch is different: it is the owner sizing this layer to this card
 * explicitly, so their axes are passed through — floored at 1 each, since
 * `object-fit: fill` already reaches every corner at 1× and anything under
 * that is the same bare gap arriving by a different route.
 */
function fullCardBackgroundStyle(t: BackgroundTransform): React.CSSProperties {
  if (t.sizing === 'stretch') {
    /*
      Each axis floors at 1 here and only here. An owner who pulls the height
      down to a quarter is composing the hero band, and honouring that literally
      on a layer three times taller leaves most of the card as bare base colour
      — the gap this layer exists to close. The hero above still shows their
      exact stretch; this shows the same picture, never shorter than the card.
      Render-only: the stored transform keeps the owner's numbers.
    */
    const sx = Math.max(1, t.scale * t.scaleX) * BLEED_MARGIN
    const sy = Math.max(1, t.scale * t.scaleY) * BLEED_MARGIN
    return {
      width: '100%',
      height: '100%',
      objectFit: 'fill',
      objectPosition: '50% 50%',
      transform: backgroundStretchTransform(t, sx, sy),
    }
  }
  return {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: `${t.x}% ${t.y}%`,
    /*
      The owner's zoom is honoured only where it can add coverage. Below 1 it
      would shrink this layer back off the edges — a gap by another route — so
      it floors at 1. Nothing here is written back: the stored transform is
      untouched, this is a rendering treatment.
    */
    transform: `scale(${Math.max(1, t.scale) * BLEED_MARGIN})`,
  }
}

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
  const base = getCardThemeTokens(card.theme)
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
  /*
    Hero with a cover runs the picture through the entire card. Without a
    cover there is nothing to run, and classic's composition depends on the
    artwork ending where the circle straddles it — so both keep the original
    treatment.
  */
  const fullBleed = hero && Boolean(card.coverUrl)
  /*
    Surfaces turn to glass over artwork, from the same helper the rest of the
    card uses. This component drew the location pill from the raw tokens, so
    while every other chip went translucent that one stayed a solid lozenge on
    the photograph — the last opaque thing on the card.

    Only surfaces change; `bg` is untouched, which is what keeps the scrims
    below opaque enough to do their job.
  */
  const t = glassTokens(base, fullBleed)
  const background = card.media.background
  /*
    Classic reads the artwork the way it always has, and nothing added for Hero
    reaches it.

    The sizing modes and the artwork's opacity are Hero's controls, but they
    live on the one background transform a card has — so a card that had them
    set under Hero and was later switched to Classic would arrive here carrying
    a stretch and a half-faded cover, and classic's header would render
    something no classic card has ever rendered. Reading the old Fill/Fit column
    and a flat opacity here means the freeze holds whatever is in the record.
  */
  const heroSizing: BackgroundSizing = hero
    ? background.sizing
    : card.coverFit === 'fit'
      ? 'fit'
      : 'cover'
  const artworkOpacity = hero ? background.opacity : 1
  /*
    One transform, two boxes. The hero frames it crisply at the owner's chosen
    sizing; the card carries the same picture the whole way down. Both read the
    same numbers through the same helper, so there is no second composition to
    drift out of step with the first.
  */
  const heroStyle = backgroundStyle(background, heroSizing)
  const bleedStyle = fullCardBackgroundStyle(background)
  const scrim = heroScrimGradient(background.overlay, t)
  const bleedScrim = heroBleedScrimGradient(background.overlay, t)
  const contentScrim = heroContentScrimGradient(t, HERO_CONTENT_OVERLAP)

  return (
    /*
      isolate, but deliberately not overflow:hidden. The artwork's own wrapper
      already clips the blurred, scaled continuation, and clipping here would
      quietly crop anything a caller renders that reaches past the card — the
      kind of regression nobody notices until a focus ring or a menu disappears.
    */
    <div
      style={{
        position: 'relative',
        isolation: 'isolate',
        /*
          Inert unless the caller is a flex column, which the public card is:
          there it makes this root — and so the artwork pinned to it — reach the
          bottom of a card that is taller than its own content.
        */
        flexGrow: 1,
        /*
          And a column in turn, so the content block can be told to take up the
          slack. Without that the wash would stop where the content stops and
          the artwork would step from washed to bare across a horizontal line —
          the same seam in a new place.
        */
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/*
        In hero the artwork belongs to the whole card, not to a band at the top
        of it.

        It used to live inside the header, in a box with a fixed ratio and its
        own overflow, under a scrim that closed on solid card background. That
        made the picture end on an invisible horizontal line and everything
        below it read as a separate dark panel — a photograph with a form
        bolted underneath rather than one composition. Lifting it to the root
        lets it run behind the name, the location, the actions and the rows,
        which is what makes the card read as a single poster.

        Classic keeps its artwork inside the header, where a circular portrait
        straddling the hero edge needs it.
      */}
      {fullBleed ? (
        <>
          <div style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden' }}>
            {/*
              The same picture, carried down the card — and now actually
              legible as that picture.

              It used to be blurred 26px and locked to cover, on the reasoning
              that a card is roughly three times taller than the hero, so any
              honest crop of a wide photograph would show as a narrow vertical
              strip. That reasoning was sound and the conclusion was wrong: the
              answer to "this shape cannot hold that image" is to let the owner
              reshape the image, not to smear it until the mismatch stops being
              visible. Stretch is that control, and with it here the softening
              no longer has to carry the whole problem.

              So the blur drops to a depth-of-field rather than a smear. Enough
              that the hero's crisp framing above still reads as the sharp
              subject and this reads as the room behind it — and that the
              inevitable difference in crop between the two does not present as
              a mis-registration — while leaving the artwork recognisably the
              owner's own photograph rather than its colours.

              The scale hides the blur's own soft edges, which would otherwise
              show as a pale border along the card.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.coverUrl as string}
              alt=""
              aria-hidden
              style={{
                ...bleedStyle,
                display: 'block',
                filter: 'blur(9px) saturate(1.08)',
                /*
                  Opacity belongs to the artwork, and to the artwork alone. It
                  is set on the image element rather than on any wrapper,
                  because a wrapper is shared: the same declaration on the
                  layer above would fade the person, the logo, the graphics and
                  the name along with the picture, which is precisely the bug
                  this layer is arranged to make impossible.
                */
                opacity: artworkOpacity,
              }}
            />
          </div>
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1,
              background: bleedScrim,
              pointerEvents: 'none',
            }}
          />
        </>
      ) : null}

      {/*
        The hero, in explicit layers: background 0, scrim 1, graphics-behind 2,
        person 3, graphics-front 4, logo 5, identity above all of them. The
        order is a property of the markup rather than of document flow, so a
        scrim can never paint over a face, and no design layer can ever land on
        top of the name or the actions.

        The frame keeps its ratio and its coordinates whether or not the
        artwork sits inside it, because every saved person, logo and graphic
        position is measured against this box. Moving the picture out from
        under them must not move them.

        The data-hero-layer attributes are how the editor's canvas finds a
        layer to hit-test against. They are inert everywhere else.
      */}
      <header
        data-hero-frame
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: String(heroAspectRatio(portrait)),
          /*
            Transparent once the artwork is at the root — painting the card's
            surface here would hide the very picture this frame now sits on.
            Otherwise the card's own surface shows through wherever a "fit"
            background or a transparent person does not cover it, which is what
            keeps a checkerboard off the card.
          */
          background: fullBleed ? 'transparent' : t.surface,
          zIndex: 2,
          isolation: 'isolate',
          overflow: 'hidden',
          // A flex item now, and one whose ratio decides its height.
          flexShrink: 0,
        }}
      >
        <div style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden' }}>
          {card.coverUrl ? (
            /*
              The owner's framing, exactly as they set it, at full sharpness.
              This is the crop they dragged and zoomed, and it does not change
              because the artwork now continues past it — the hero region is
              pixel-for-pixel what it was.

              Under full bleed its bottom edge is dissolved rather than cut, so
              it melts into the softened continuation below instead of ending
              on a line.
            */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              data-hero-layer="background"
              src={card.coverUrl}
              alt=""
              style={{
                ...heroStyle,
                display: 'block',
                // The artwork's own opacity, on the artwork's own element. See
                // the full-card layer above for why it is never on a wrapper.
                opacity: artworkOpacity,
                ...(fullBleed
                  ? { WebkitMaskImage: COVER_DISSOLVE, maskImage: COVER_DISSOLVE }
                  : null),
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
        </div>

        {/*
          Darkening, applied inside the frame so it governs the crisp artwork
          the owner is looking at. Under full bleed it never closes on an
          opaque stop, which is what used to end the picture on a hard line.
        */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            background: fullBleed ? bleedScrim : scrim,
          }}
        />

        {/*
          The person, above the scrim by construction. Darkening protects the
          artwork's readability; darkening the human being would defeat the
          entire composition.

          They carry no generated mask. There used to be a short fade across
          their bottom twelve percent, on the reasoning that a cutout standing
          on nothing wants a soft foot — but a fade is partial alpha, and
          partial alpha composites against whatever is behind it. That made the
          person's lower body a window onto the background: raising Darken
          dissolved their legs into black, lowering the artwork's opacity
          thinned them, and neither their own opacity nor any wrapper's ever
          changed. Being solid where the source is solid is the only version of
          this that is genuinely independent of the layer underneath.

          Transparency is now entirely the uploaded cutout's own — which is the
          one place it can come from without coupling the layers.
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
          zIndex: 3,
          // Takes up whatever the card has beyond the content, so the wash
          // reaches the bottom edge instead of stopping at the last row.
          flexGrow: 1,
          padding: s.padding,
          marginTop: hero ? -HERO_CONTENT_OVERLAP : `calc(${PORTRAIT_WIDTH} * -${PORTRAIT_OVERLAP})`,
          /*
            The content's own wash, and only when the artwork runs behind it.
            The pull-up above means this starts inside the hero, so the
            gradient opens nearly clear and deepens as it descends — the
            picture visibly continues out of the hero and past the name, and is
            still there behind the action rows without ever being what a reader
            has to see through.
          */
          background: fullBleed ? contentScrim : undefined,
          /*
            Set once and inherited by everything the caller renders inside —
            name, role, actions, row labels. text-shadow inherits, so one
            declaration here does what thirteen would have done downstream, and
            it is what lets the wash above stay light enough to still show a
            picture.
          */
          textShadow: fullBleed ? HERO_TEXT_SHADOW : undefined,
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
