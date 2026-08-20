import {
  GRAPHIC_SCALE_LIMITS,
  LOGO_SCALE_LIMITS,
  backgroundPanTravel,
  portraitScaleLimits,
  type CardMediaTransforms,
  type ScaleLimits,
} from '@/lib/card/types'

/**
 * What a gesture does to a layer, independent of which surface produced it.
 *
 * The card canvas and each layer's own editor both drag the same layers, and
 * they must agree exactly — a person who moves one way under a finger on the
 * card and another way under a finger in the panel is worse than either
 * behaviour alone. So the arithmetic lives here once, takes a frame size and a
 * pixel delta, and returns new transforms. Neither caller owns it.
 */

export type HeroLayerId = 'background' | 'person' | 'logo' | 'graphic-0' | 'graphic-1'

export function layerScaleLimits(layer: HeroLayerId, backgroundLimits: ScaleLimits): ScaleLimits {
  if (layer === 'background') return backgroundLimits
  if (layer === 'person') return portraitScaleLimits('hero')
  if (layer === 'logo') return LOGO_SCALE_LIMITS
  return GRAPHIC_SCALE_LIMITS
}

const clampPercent = (v: number) => Math.min(100, Math.max(0, Math.round(v)))

/**
 * The same clamp, kept to two decimals.
 *
 * Whole percents are fine for a layer whose travel is roughly the frame, which
 * is every anchored layer. A background's travel is its overflow, and a
 * zoomed-in picture can overflow by several thousand pixels — at which point
 * one percent is tens of pixels and rounding to it turns a smooth drag into a
 * series of jumps.
 */
const clampFraction = (v: number) => Math.min(100, Math.max(0, Math.round(v * 100) / 100))

/**
 * Move one layer by a pixel delta measured on a frame of the given size.
 *
 * `layerSize` is the layer's own rendered box where the caller can measure it.
 * It only affects the graphics layers, whose anchor travels through the space
 * they do not already fill; everything else maps one-to-one against the frame.
 */
export function moveLayer(
  transforms: CardMediaTransforms,
  layer: HeroLayerId,
  dx: number,
  dy: number,
  frame: { width: number; height: number },
  layerSize?: { width: number; height: number } | null,
  /**
   * The background source's own pixel size, when the background is the layer
   * being moved. How far it can travel depends on how `object-fit` sized it
   * against this frame, which cannot be recovered from the rendered element —
   * that element fills the frame whatever the picture inside it is doing.
   */
  artworkNatural?: { width: number; height: number } | null
): CardMediaTransforms {
  if (!frame.width || !frame.height) return transforms
  const t = transforms

  if (layer === 'background') {
    /*
      The artwork goes where the finger goes, in every mode and at every size.

      This used to divide the drag by the frame's width and subtract, which is
      correct for exactly one case: a picture larger than its box, panned by
      object-position. It is wrong in both directions elsewhere. When the
      artwork is smaller than the box the same two numbers stop being a crop
      offset and become a placement — 0 is hard against the left edge, not the
      right — so the picture ran backwards under the finger. That was always
      true of Fit; opening the scale floor to a quarter made it easy to reach.

      What decides the mapping is how far x/y can actually carry the picture.
      Positive travel is overflow panned by a window, so the picture goes
      against the number; negative travel is slack the picture is placed
      within, so it goes with it. The sign is the direction and the magnitude
      is what one percent is worth, which makes a single expression cover
      cropping, letterboxing and stretching alike:

        Δpercent = −Δpixels × 100 ÷ travel

      Within that range the artwork tracks the finger exactly. Where the range
      is shorter than the gesture the picture reaches its edge and stops, which
      is the honest answer rather than a mapping that lies about how far the
      composition can move.

      The travel itself comes from the one helper that knows how each sizing
      mode places its picture, so this stays arithmetic and the geometry stays
      next to the styles it has to agree with. The caller supplies only what it
      alone can know: the frame it is dragging on, and the source's own pixel
      size.
    */
    const travel = backgroundPanTravel(t.background, frame, artworkNatural)
    /*
      A picture that exactly fills its box has nowhere to go, and dividing by
      that would send it to an edge on the first pixel of movement. Holding
      still is the honest answer.
    */
    const stepX = Math.abs(travel.x) < 1 ? 0 : (dx / travel.x) * 100
    const stepY = Math.abs(travel.y) < 1 ? 0 : (dy / travel.y) * 100
    return {
      ...t,
      background: {
        ...t.background,
        x: clampFraction(t.background.x - stepX),
        y: clampFraction(t.background.y - stepY),
      },
    }
  }

  if (layer === 'person') {
    /*
      Anchored by the centre, so the anchor moves exactly as far as the finger
      does. This is the layer the owner drags most, and it has to feel like
      moving a sticker rather than nudging a slider through a proxy.
    */
    return {
      ...t,
      portrait: {
        ...t.portrait,
        x: clampPercent(t.portrait.x + (dx / frame.width) * 100),
        y: clampPercent(t.portrait.y + (dy / frame.height) * 100),
        positionModel: 'anchor',
      },
    }
  }

  if (layer === 'logo') {
    return {
      ...t,
      logo: {
        ...t.logo,
        x: clampPercent(t.logo.x + (dx / frame.width) * 100),
        y: clampPercent(t.logo.y + (dy / frame.height) * 100),
        positionModel: 'anchor',
      },
    }
  }

  /*
    A graphic's anchor travels across the room it does not occupy, so a wide
    badge needs a larger percentage change than a small one to cross the same
    pixels. The floor is half the frame: without it, a layer that nearly fills
    its axis divides by a sliver and shoots to the edge on the first nudge.
  */
  const freeX = Math.max(frame.width / 2, frame.width - (layerSize?.width ?? 0))
  const freeY = Math.max(frame.height / 2, frame.height - (layerSize?.height ?? 0))
  const index = layer === 'graphic-0' ? 0 : 1
  return {
    ...t,
    graphics: t.graphics.map((g, i) =>
      i === index
        ? {
            ...g,
            x: clampPercent(g.x + (dx / freeX) * 100),
            y: clampPercent(g.y + (dy / freeY) * 100),
          }
        : g
    ),
  }
}

/** Multiply one layer's scale, held inside that layer's own range. */
export function scaleLayer(
  transforms: CardMediaTransforms,
  layer: HeroLayerId,
  factor: number,
  limits: ScaleLimits
): CardMediaTransforms {
  const t = transforms
  const fit = (v: number) => Math.min(limits.max, Math.max(limits.min, Math.round(v * 100) / 100))

  if (layer === 'background') {
    return { ...t, background: { ...t.background, scale: fit(t.background.scale * factor) } }
  }
  if (layer === 'person') {
    return {
      ...t,
      portrait: { ...t.portrait, scale: fit(t.portrait.scale * factor), positionModel: 'anchor' },
    }
  }
  if (layer === 'logo') {
    return {
      ...t,
      logo: { ...t.logo, scale: fit(t.logo.scale * factor), positionModel: 'anchor' },
    }
  }
  const index = layer === 'graphic-0' ? 0 : 1
  return {
    ...t,
    graphics: t.graphics.map((g, i) => (i === index ? { ...g, scale: fit(g.scale * factor) } : g)),
  }
}
