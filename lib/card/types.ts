export type CardTheme = 'graphite' | 'light'

/** How the cover image fills its header area. */
export type CardCoverFit = 'fill' | 'fit'

export const COVER_FIT_DEFAULT: CardCoverFit = 'fill'
export const COVER_POSITION_DEFAULT = 'center center'

export const COVER_POSITIONS_Y = ['top', 'center', 'bottom'] as const
export const COVER_POSITIONS_X = ['left', 'center', 'right'] as const

/**
 * A portrait's subject sits above the middle of the frame, so centring the
 * source crops the face. Every circular avatar on a card uses this instead.
 */
export const PHOTO_OBJECT_POSITION = '50% 30%'

export function normalizeCoverPosition(value: unknown): string {
  if (typeof value !== 'string') return COVER_POSITION_DEFAULT
  const parts = value.trim().toLowerCase().split(/\s+/)
  const x = (COVER_POSITIONS_X as readonly string[]).includes(parts[0]) ? parts[0] : 'center'
  const y = (COVER_POSITIONS_Y as readonly string[]).includes(parts[1]) ? parts[1] : 'center'
  return `${x} ${y}`
}

export function normalizeCoverFit(value: unknown): CardCoverFit {
  return value === 'fit' ? 'fit' : COVER_FIT_DEFAULT
}

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

/**
 * The deployed card_events table names the title column `event_name`, while
 * the original migration declared `name`. Rather than spread that split across
 * the UI, every read goes through here and every write through
 * cardEventToRow — the app only ever sees `name`.
 */
export function normalizeCardEventRow(row: Record<string, unknown>): CardEvent {
  const title =
    (typeof row.event_name === 'string' && row.event_name) ||
    (typeof row.name === 'string' && row.name) ||
    ''

  return {
    id: String(row.id),
    user_id: String(row.user_id ?? ''),
    name: title,
    city: (row.city as string | null) ?? null,
    date_from: (row.date_from as string | null) ?? null,
    date_to: (row.date_to as string | null) ?? null,
    booth: (row.booth as string | null) ?? null,
    created_at: typeof row.created_at === 'string' ? row.created_at : undefined,
  }
}

export function cardEventToRow(event: CardEvent, userId: string): Record<string, unknown> {
  return {
    id: event.id,
    user_id: userId,
    event_name: event.name.trim() || 'Event',
    city: event.city?.trim() || null,
    date_from: event.date_from || null,
    date_to: event.date_to || null,
    booth: event.booth?.trim() || null,
  }
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
  /** CSS object-position for the cover — one stored value, used by every renderer. */
  coverPosition: string
  coverFit: CardCoverFit
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

// Ids are stored in card_links.icon — only the labels are presentational.
export const LINK_ICON_OPTIONS: { id: CardLinkIcon; label: string; emoji: string }[] = [
  { id: 'presentation', label: 'Presentation', emoji: '📊' },
  { id: 'video', label: 'Video', emoji: '🎥' },
  { id: 'portfolio', label: 'Portfolio', emoji: '📁' },
  { id: 'pricing', label: 'Pricing', emoji: '💰' },
  { id: 'case', label: 'Case study', emoji: '📄' },
  { id: 'shop', label: 'Shop', emoji: '🛒' },
  { id: 'booking', label: 'Booking', emoji: '📅' },
  { id: 'link', label: 'Other', emoji: '🔗' },
]

/** Quick-insert suggestions for "Looking for" — generic, not event-specific. */
export const LOOKING_FOR_SUGGESTIONS = [
  'Investors',
  'Distributors',
  'B2B partners',
  'Clients',
  'Suppliers',
  'Talent',
] as const

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
