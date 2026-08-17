import type { ShowcaseItem } from '@/lib/card/showcase'

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
  /** Zoom/pan/overlay framing for the hero images — same source for every renderer. */
  media: CardMediaTransforms
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
  /**
   * The owner's optional gallery. `showcaseItems` is emptied server-side when
   * the section is switched off, so a hidden gallery is absent from the page
   * payload rather than merely unrendered.
   */
  showcaseEnabled: boolean
  showcaseTitle: string
  showcaseItems: ShowcaseItem[]
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

/* ─── Hero image framing ─── */

/** scale is a multiplier (1 = fit); x/y are object-position percentages. */
export type MediaTransform = { scale: number; x: number; y: number }
export type BackgroundTransform = MediaTransform & { overlay: number }

export type CardMediaTransforms = {
  background: BackgroundTransform
  portrait: MediaTransform
}

export const BACKGROUND_TRANSFORM_DEFAULT: BackgroundTransform = {
  scale: 1,
  x: 50,
  y: 50,
  overlay: 55,
}

/** Portraits sit above centre, so the default keeps the face in frame. */
export const PORTRAIT_TRANSFORM_DEFAULT: MediaTransform = { scale: 1, x: 50, y: 30 }

export const MEDIA_TRANSFORM_LIMITS = { minScale: 1, maxScale: 3 } as const

/**
 * Width ÷ height of the hero. The public card derives its hero height from
 * this and the framing editor shapes its background preview with it, so the
 * crop the owner lines up is the crop a visitor sees. Changing it in one place
 * would silently make the editor lie.
 */
export const HERO_ASPECT_RATIO = 1.85

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/**
 * Reads the stored framing, tolerating a missing column, a null value, or
 * partial JSON. `coverPosition` is the previous nine-point setting and seeds
 * the background pan so cards framed before this existed look unchanged.
 */
export function normalizeMediaTransforms(
  raw: unknown,
  coverPosition?: string
): CardMediaTransforms {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const bg = (source.background || {}) as Record<string, unknown>
  const portrait = (source.portrait || {}) as Record<string, unknown>

  const seeded = seedFromCoverPosition(coverPosition)

  return {
    background: {
      scale: clamp(bg.scale, MEDIA_TRANSFORM_LIMITS.minScale, MEDIA_TRANSFORM_LIMITS.maxScale, BACKGROUND_TRANSFORM_DEFAULT.scale),
      x: clamp(bg.x, 0, 100, seeded.x),
      y: clamp(bg.y, 0, 100, seeded.y),
      overlay: clamp(bg.overlay, 0, 100, BACKGROUND_TRANSFORM_DEFAULT.overlay),
    },
    portrait: {
      scale: clamp(portrait.scale, MEDIA_TRANSFORM_LIMITS.minScale, MEDIA_TRANSFORM_LIMITS.maxScale, PORTRAIT_TRANSFORM_DEFAULT.scale),
      x: clamp(portrait.x, 0, 100, PORTRAIT_TRANSFORM_DEFAULT.x),
      y: clamp(portrait.y, 0, 100, PORTRAIT_TRANSFORM_DEFAULT.y),
    },
  }
}

/** "left top" → { x: 0, y: 0 }, so the earlier nine-point choice is preserved. */
function seedFromCoverPosition(position?: string): { x: number; y: number } {
  if (!position) return { x: BACKGROUND_TRANSFORM_DEFAULT.x, y: BACKGROUND_TRANSFORM_DEFAULT.y }
  const [rawX, rawY] = position.trim().toLowerCase().split(/\s+/)
  const map: Record<string, number> = { left: 0, top: 0, center: 50, right: 100, bottom: 100 }
  return {
    x: rawX in map ? map[rawX] : BACKGROUND_TRANSFORM_DEFAULT.x,
    y: rawY in map ? map[rawY] : BACKGROUND_TRANSFORM_DEFAULT.y,
  }
}

/** The CSS an image needs to honour a transform inside an overflow-hidden frame. */
export function transformStyle(t: MediaTransform): {
  width: string
  height: string
  objectFit: 'cover'
  objectPosition: string
  transform: string
} {
  return {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: `${t.x}% ${t.y}%`,
    transform: `scale(${t.scale})`,
  }
}
