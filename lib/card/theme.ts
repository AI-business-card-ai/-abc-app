import type { CardTheme } from '@/lib/card/types'

export type CardThemeTokens = {
  bg: string
  surface: string
  surface2: string
  border: string
  text: string
  secondary: string
  muted: string
}

export function getCardThemeTokens(theme: CardTheme): CardThemeTokens {
  if (theme === 'light') {
    return {
      bg: '#ffffff',
      surface: '#f7f7f7',
      surface2: '#eeeeee',
      border: '#e5e5e5',
      text: '#111111',
      secondary: '#555555',
      muted: '#888888',
    }
  }
  // Matches the approved ABC app palette so a public card reads as the same
  // product as the scanner that opened it.
  return {
    bg: '#0a0a0b',
    surface: '#121214',
    surface2: '#18181b',
    border: '#232326',
    text: '#ffffff',
    secondary: '#a1a1aa',
    muted: '#71717a',
  }
}

/**
 * The hero's readability scrim, from the owner's 0–100 darkening setting.
 *
 * One function for both renderers: the framing editor previewed a flat wash
 * while the card painted a gradient, so an owner who darkened just enough to
 * read the name was looking at a different photo from the one their visitors
 * got. The bottom stop is the card background, which is what lets the hero
 * meet the identity block without a seam.
 *
 * Classic still uses this. Hero does not — a scrim that ends on solid card
 * background is precisely what made the artwork stop dead at the hero's edge,
 * and hero now runs the picture through the whole card instead.
 */
export function heroScrimGradient(overlay: number, tokens: CardThemeTokens): string {
  const strength = Math.min(100, Math.max(0, overlay)) / 100
  const top = (strength * 0.55).toFixed(3)
  const mid = (strength * 0.8).toFixed(3)
  return `linear-gradient(180deg, rgba(0,0,0,${top}) 0%, rgba(0,0,0,${mid}) 45%, ${tokens.bg} 100%)`
}

/**
 * Card chrome that the artwork shows through.
 *
 * Every row, chip and tile used to paint solid `surface`. Over a full-bleed
 * card that turned the artwork off wherever the content was — a picture at the
 * top and a stack of opaque panels below it, which is exactly the "separate
 * surfaces" the full-bleed work set out to remove. Translucent, they read as
 * glass laid on the composition instead of lids covering it.
 *
 * Paired with a backdrop blur at the call site, this is legible over anything
 * without hiding what is underneath.
 */
export function glassSurface(tokens: CardThemeTokens, alpha = 0.42): string {
  return bgAlpha(tokens, alpha)
}

/** A hairline that reads on glass, where a solid border would look drawn-on. */
export function glassBorder(tokens: CardThemeTokens): string {
  return tokens.bg === '#ffffff' ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.14)'
}

/**
 * The card's tokens, as they should read over full-bleed artwork.
 *
 * This lived inline in one component, which is why it only reached that
 * component's chrome: everything DigitalCardView drew went translucent while
 * the location pill, drawn by CardHero from the raw tokens, stayed a solid
 * black lozenge sitting on the photograph. One definition, consumed by both,
 * is the only version of this that cannot drift apart again.
 *
 * Only the surfaces move. `bg` is deliberately untouched — the scrims are
 * built from it, and making those translucent would dissolve the very wash
 * that keeps text readable.
 */
export function glassTokens(tokens: CardThemeTokens, enabled: boolean): CardThemeTokens {
  if (!enabled) return tokens
  return {
    ...tokens,
    surface: glassSurface(tokens, 0.42),
    surface2: glassSurface(tokens, 0.58),
    border: glassBorder(tokens),
  }
}

/** The card background with an alpha, so a fade lands on white in light mode. */
function bgAlpha(tokens: CardThemeTokens, alpha: number): string {
  const hex = tokens.bg.replace('#', '')
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Hero's darkening, over artwork that no longer stops at the hero's edge.
 *
 * Same 0–100 setting and the same top-to-bottom deepening as the classic
 * scrim, with one deliberate difference: it never reaches an opaque stop. The
 * picture now runs the height of the card, so closing this gradient on solid
 * background would draw the exact seam the full-bleed treatment exists to
 * remove — the artwork would simply stop, mid-card, at an invisible line.
 */
export function heroBleedScrimGradient(overlay: number, tokens: CardThemeTokens): string {
  const strength = Math.min(100, Math.max(0, overlay)) / 100
  const top = (strength * 0.5).toFixed(3)
  const mid = (strength * 0.72).toFixed(3)
  const foot = (strength * 0.82).toFixed(3)
  return `linear-gradient(180deg, rgba(0,0,0,${top}) 0%, rgba(0,0,0,${mid}) 55%, rgba(0,0,0,${foot}) 100%)`
}

/**
 * What keeps the content legible once the artwork runs behind it.
 *
 * Text on a photograph is only as readable as the darkest thing behind its
 * lightest pixel, and a photograph makes no promises. So the content sits on
 * its own wash that deepens as it descends: light enough at the top that the
 * picture visibly continues out of the hero, settled by the time it reaches
 * the name, and heaviest under the actions, where a mis-read tap costs more
 * than a glimpse of artwork is worth.
 *
 * It is much lighter than it was. At 0.88 the artwork was technically still
 * present and practically invisible — the owner looked at their card and saw a
 * dark panel, which is the only verdict that counts. The wash now settles
 * around half, and the work of making text readable moves to the text itself:
 * the content carries a shadow, and the rows that need a solid footing carry
 * their own glass. A wash heavy enough to guarantee every pixel is a wash
 * heavy enough to erase the picture.
 */
export function heroContentScrimGradient(tokens: CardThemeTokens): string {
  return [
    'linear-gradient(180deg,',
    `${bgAlpha(tokens, 0.28)} 0%,`,
    `${bgAlpha(tokens, 0.46)} 8%,`,
    `${bgAlpha(tokens, 0.52)} 30%,`,
    `${bgAlpha(tokens, 0.55)} 100%)`,
  ].join(' ')
}

/**
 * What lets text sit on a photograph without a slab behind it.
 *
 * A short, tight shadow rather than a glow: it disappears against the dark
 * parts of the artwork and only does work against the bright parts, which is
 * where text on a picture actually fails.
 */
export const HERO_TEXT_SHADOW = '0 1px 2px rgba(0,0,0,0.55), 0 2px 10px rgba(0,0,0,0.45)'

export function initialsFromName(name: string | null | undefined): string {
  const parts = (name || 'ABC').trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return (parts[0]?.slice(0, 2) || 'AB').toUpperCase()
}
