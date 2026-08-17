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
 */
export function heroScrimGradient(overlay: number, tokens: CardThemeTokens): string {
  const strength = Math.min(100, Math.max(0, overlay)) / 100
  const top = (strength * 0.55).toFixed(3)
  const mid = (strength * 0.8).toFixed(3)
  return `linear-gradient(180deg, rgba(0,0,0,${top}) 0%, rgba(0,0,0,${mid}) 45%, ${tokens.bg} 100%)`
}

export function initialsFromName(name: string | null | undefined): string {
  const parts = (name || 'ABC').trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return (parts[0]?.slice(0, 2) || 'AB').toUpperCase()
}
