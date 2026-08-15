export type CardTheme = 'graphite' | 'light'

export type CardLinkIcon =
  | 'presentation'
  | 'video'
  | 'portfolio'
  | 'pricing'
  | 'case'
  | 'shop'
  | 'booking'
  | 'link'

export type SocialNetwork =
  | 'linkedin'
  | 'instagram'
  | 'x'
  | 'facebook'
  | 'youtube'
  | 'tiktok'
  | 'github'
  | 'threads'

export type SocialEnabledMap = Partial<Record<SocialNetwork, boolean>>

export interface CardLink {
  id: string
  user_id: string
  label: string
  url: string
  icon: CardLinkIcon | string
  sort_order: number
  is_active: boolean
  click_count: number
  created_at?: string
}

export interface CardEvent {
  id: string
  user_id: string
  name: string
  city: string | null
  date_from: string | null
  date_to: string | null
  booth: string | null
  created_at?: string
}

export interface CardAnalytics {
  views: number
  vcardSaves: number
  exchanges: number
  linkClicks: number
}

/** Normalized public card payload (preview + /d/[slug]). */
export interface DigitalCardData {
  userId: string
  slug: string
  fullName: string
  jobTitle: string | null
  companyName: string | null
  tagline: string | null
  whatIDo: string | null
  lookingFor: string | null
  photoUrl: string | null
  coverUrl: string | null
  logoUrl: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  website: string | null
  calendarUrl: string | null
  location: string | null
  languages: string[]
  showPhone: boolean
  showWhatsapp: boolean
  showEmail: boolean
  showWebsite: boolean
  showCalendar: boolean
  showLocation: boolean
  linkedinUrl: string | null
  instagramUrl: string | null
  xUrl: string | null
  facebookUrl: string | null
  youtubeUrl: string | null
  tiktokUrl: string | null
  githubUrl: string | null
  threadsUrl: string | null
  socialEnabled: SocialEnabledMap
  accent: string
  theme: CardTheme
  brandingRemoved: boolean
  published: boolean
  links: CardLink[]
  events: CardEvent[]
}

/** The ABC accent every card falls back to. */
export const CARD_ACCENT_DEFAULT = '#d9a441'

/**
 * Accents from the pre-ABC design (pink / turquoise / purple). Rows still hold
 * these values, so they are mapped to the ABC gold rather than migrated.
 */
export const LEGACY_CARD_ACCENTS = ['#f0197d', '#00d4d4', '#8b5cf6'] as const

export const CARD_ACCENTS = [
  { key: 'gold', value: CARD_ACCENT_DEFAULT, label: 'Gold' },
  { key: 'green', value: '#4ade80', label: 'Green' },
  { key: 'orange', value: '#fb923c', label: 'Orange' },
  { key: 'slate', value: '#a1a1aa', label: 'Slate' },
] as const

export const LINK_ICON_OPTIONS: { id: CardLinkIcon; label: string; emoji: string }[] = [
  { id: 'presentation', label: 'Prezentace', emoji: '📊' },
  { id: 'video', label: 'Video', emoji: '🎥' },
  { id: 'portfolio', label: 'Portfolio', emoji: '📁' },
  { id: 'pricing', label: 'Ceník', emoji: '💰' },
  { id: 'case', label: 'Case study', emoji: '📄' },
  { id: 'shop', label: 'E-shop', emoji: '🛒' },
  { id: 'booking', label: 'Rezervace', emoji: '📅' },
  { id: 'link', label: 'Ostatní', emoji: '🔗' },
]

export const LANGUAGE_OPTIONS = ['CZ', 'EN', 'DE', 'SK', 'PL', 'FR', 'ES'] as const

export const PRESET_EVENTS = [
  'Expo Real Mnichov',
  'Gitex Dubaj',
  'Medica Düsseldorf',
  'Web Summit Lisabon',
  'APEXPO',
] as const

export const LOOKING_FOR_CHIPS = [
  'Investory',
  'Distributory',
  'B2B partnery',
  'Klienty',
  'Dodavatele',
  'Talenty',
] as const

export const MAX_CARD_LINKS = 10
export const CARD_PUBLIC_BASE = 'https://abccard.io/d'
