import {
  GRAPHIC_SCALE_LIMITS,
  LOGO_SCALE_LIMITS,
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
  layerSize?: { width: number; height: number } | null
): CardMediaTransforms {
  if (!frame.width || !frame.height) return transforms
  const t = transforms

  if (layer === 'background') {
    // A cropped background pans: the window moves, so the image travels
    // against the finger.
    return {
      ...t,
      background: {
        ...t.background,
        x: clampPercent(t.background.x - (dx / frame.width) * 100),
        y: clampPercent(t.background.y - (dy / frame.height) * 100),
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
