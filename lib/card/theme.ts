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
  return {
    bg: '#0f0f0f',
    surface: '#1a1a1a',
    surface2: '#242424',
    border: '#2a2a2a',
    text: '#ffffff',
    secondary: '#999999',
    muted: '#555555',
  }
}

export function initialsFromName(name: string | null | undefined): string {
  const parts = (name || 'ABC').trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return (parts[0]?.slice(0, 2) || 'AB').toUpperCase()
}
