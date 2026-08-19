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
 * It stops short of opaque on purpose. At 0.9 the image is still perceptibly
 * there behind the rows — which is the difference between a card that is one
 * composition and a card that is a picture with a panel bolted underneath.
 *
 * It also reaches its working strength fast, by the sixth percent, because the
 * name starts almost immediately and this cannot lean on the owner's darkening
 * to carry it: darkening can be set to zero. Against the brightest cover a
 * white name still lands around 4:1 here, and the smaller text below it, where
 * the wash has settled further, better than 5:1.
 */
export function heroContentScrimGradient(tokens: CardThemeTokens): string {
  return [
    'linear-gradient(180deg,',
    `${bgAlpha(tokens, 0.55)} 0%,`,
    `${bgAlpha(tokens, 0.82)} 6%,`,
    `${bgAlpha(tokens, 0.88)} 24%,`,
    `${bgAlpha(tokens, 0.9)} 100%)`,
  ].join(' ')
}

export function initialsFromName(name: string | null | undefined): string {
  const parts = (name || 'ABC').trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return (parts[0]?.slice(0, 2) || 'AB').toUpperCase()
}
