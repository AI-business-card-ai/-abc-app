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

/**
 * How the owner's photograph is presented.
 *
 * `classic` is the circular portrait every existing card already uses, and
 * stays the default so nobody's card changes because this type gained a field.
 * `hero` treats the person as a foreground layer composed into the artwork,
 * which only looks right with a transparent source — hence `cutoutUrl`, kept
 * separate from card_photo_url so the original is never overwritten.
 */
export type PortraitMode = 'classic' | 'hero'

/**
 * How a hero person's x/y should be read.
 *
 * `legacy` is every card saved before the composer existed. Those two numbers
 * were an object-position — a crop offset through whatever space the subject
 * did not already fill — which is why a full-height person could never be
 * moved up or down at all.
 *
 * `anchor` places the subject's centre at that point of the frame, which is
 * what makes free positioning possible in both axes.
 *
 * The two are not interchangeable readings of the same numbers, so the model
 * is recorded rather than guessed. A legacy card keeps rendering through the
 * legacy path — the same code, pixel for pixel — until the owner actually
 * moves the person, at which point the editor converts the position from the
 * geometry on screen and marks it anchored. Nobody's card moves on deploy.
 */
export type PortraitPositionModel = 'legacy' | 'anchor'

export type PortraitTransform = MediaTransform & {
  mode: PortraitMode
  cutoutUrl: string | null
  positionModel: PortraitPositionModel
}

/**
 * The company logo as a placed layer rather than a fixed corner ornament.
 *
 * x/y are anchor percentages read the way a background-position is: the point
 * named on the logo is put at the same point of the hero's padded box, so 0
 * pins its left edge to the left inset and 100 pins its right edge to the
 * right inset. That is what lets the default reproduce the old hardcoded
 * top-right placement exactly, rather than approximately.
 *
 * scale multiplies the surface's own logo height, so a logo stays proportional
 * between the full card and the compact preview instead of being pinned to a
 * pixel size that only looks right on one of them.
 */
export type LogoTransform = {
  x: number
  y: number
  scale: number
  /** 0–1. */
  opacity: number
  visible: boolean
  /**
   * Read the same way the person's is, and for the same reason.
   *
   * `legacy` anchors an edge: 0 pins the logo's left edge to the left inset,
   * 100 pins its right edge to the right inset. That places it correctly but
   * couples position to size — a bigger logo has less room to travel, so
   * resizing it slides its centre across the card.
   *
   * `anchor` places the logo's centre at the named point, so it grows and
   * shrinks around the spot the owner chose instead of drifting away from it.
   */
  positionModel: PortraitPositionModel
}

/**
 * An optional extra layer: an event badge, a product mark, a partner logo.
 *
 * Placement is the only ordering control the owner ever sees. Raw z-indexes
 * are an implementation detail, and "in front of me or behind me" is the only
 * question anyone actually has about a badge on their own card.
 */
export type GraphicPlacement = 'behind-person' | 'front-person'

export type GraphicLayer = {
  url: string
  x: number
  y: number
  scale: number
  opacity: number
  visible: boolean
  placement: GraphicPlacement
}

/** Two is plenty for a business card, and it keeps this out of canvas territory. */
export const MAX_GRAPHIC_LAYERS = 2

export const GRAPHIC_TRANSFORM_DEFAULT: Omit<GraphicLayer, 'url'> = {
  x: 25,
  y: 75,
  scale: 1,
  opacity: 1,
  visible: true,
  placement: 'front-person',
}

/** A graphic is sized against the hero's width, so it scales with the card. */
export const GRAPHIC_SCALE_LIMITS: ScaleLimits = { min: 0.3, max: 2.5 }

export type CardMediaTransforms = {
  background: BackgroundTransform
  portrait: PortraitTransform
  logo: LogoTransform
  graphics: GraphicLayer[]
}

export const BACKGROUND_TRANSFORM_DEFAULT: BackgroundTransform = {
  scale: 1,
  x: 50,
  y: 50,
  overlay: 55,
}

/**
 * Top right, full size, fully opaque — the placement every existing hero card
 * already has. A card saved before this existed normalizes to exactly this,
 * so nobody's logo moves because the control was added.
 */
export const LOGO_TRANSFORM_DEFAULT: LogoTransform = {
  x: 100,
  y: 0,
  scale: 1,
  opacity: 1,
  visible: true,
  // Every card that predates the composer means this the old way, and keeps
  // rendering that way until the owner actually places the logo themselves.
  positionModel: 'legacy',
}

/** How far the logo may be scaled against the surface's own logo height. */
export const LOGO_SCALE_LIMITS: ScaleLimits = { min: 0.5, max: 2.5 }

/**
 * Portraits sit above centre, so the default keeps the face in frame.
 *
 * y is 30 because that is what the circular crop has always used, and this
 * same default seeds Classic. Hero's anchored default is separate below —
 * changing this one to suit Hero would have quietly recropped every new
 * Classic portrait.
 */
export const PORTRAIT_TRANSFORM_DEFAULT: PortraitTransform = {
  scale: 1,
  x: 50,
  y: 30,
  mode: 'classic',
  cutoutUrl: null,
  positionModel: 'legacy',
}

/**
 * Dead centre, which for a full-height subject is exactly where the legacy
 * path already drew them — so a hero card starting here looks the same as one
 * that started before the composer existed.
 */
export const HERO_PERSON_ANCHOR_DEFAULT = { x: 50, y: 50, scale: 1 } as const

/**
 * Zoom range depends on what the image has to cover, so one pair of numbers
 * cannot serve all four cases.
 *
 * A `fill` background and a `classic` portrait both have to leave no gap in
 * their frame, and at scale 1 an object-fit: cover image exactly covers it —
 * so 1 is the mathematical floor, not a preference. Going below it would
 * expose the surface behind the image.
 *
 * A `fit` background is meant to show the whole artwork, and a `hero` portrait
 * is a subject floating on the composition; both may legitimately be smaller
 * than their frame, and the space around them is the card's own background.
 * Those are the two cases where the owner can genuinely zoom out — which is
 * what a wordmark cover and a full-length person actually need.
 */
export const SCALE_LIMITS = {
  backgroundFill: { min: 1, max: 3 },
  backgroundFit: { min: 0.4, max: 3 },
  portraitClassic: { min: 1, max: 3 },
  portraitHero: { min: 0.45, max: 2 },
} as const

export type ScaleLimits = { min: number; max: number }

export function backgroundScaleLimits(fit: CardCoverFit): ScaleLimits {
  return fit === 'fit' ? SCALE_LIMITS.backgroundFit : SCALE_LIMITS.backgroundFill
}

export function portraitScaleLimits(mode: PortraitMode): ScaleLimits {
  return mode === 'hero' ? SCALE_LIMITS.portraitHero : SCALE_LIMITS.portraitClassic
}

/** Kept for callers that only need the widest possible span. */
export const MEDIA_TRANSFORM_LIMITS = { minScale: 0.4, maxScale: 3 } as const

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
  coverPosition?: string,
  coverFit?: CardCoverFit
): CardMediaTransforms {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const bg = (source.background || {}) as Record<string, unknown>
  const portrait = (source.portrait || {}) as Record<string, unknown>
  const logo = (source.logo || {}) as Record<string, unknown>
  const graphics = Array.isArray(source.graphics) ? source.graphics : []

  const seeded = seedFromCoverPosition(coverPosition)

  // A card saved as "fit" at 0.6 and later switched to "fill" would otherwise
  // render with a gap, so each scale is clamped to the range its own mode
  // allows rather than to one global range.
  const mode: PortraitMode = portrait.mode === 'hero' ? 'hero' : 'classic'
  const bgLimits = backgroundScaleLimits(normalizeCoverFit(coverFit))

  const cutoutUrl =
    typeof portrait.cutoutUrl === 'string' && portrait.cutoutUrl.trim()
      ? portrait.cutoutUrl.trim()
      : null

  /*
    Clamp against the chosen mode. Hero no longer degrades into the circular
    portrait, so a hero transform stays a hero transform even when its cutout
    is missing — forcing it into the classic range would rewrite placement the
    owner set, purely because the subject had not been restored yet.
  */
  const portraitLimits = portraitScaleLimits(mode)

  return {
    background: {
      scale: clamp(bg.scale, bgLimits.min, bgLimits.max, BACKGROUND_TRANSFORM_DEFAULT.scale),
      x: clamp(bg.x, 0, 100, seeded.x),
      y: clamp(bg.y, 0, 100, seeded.y),
      overlay: clamp(bg.overlay, 0, 100, BACKGROUND_TRANSFORM_DEFAULT.overlay),
    },
    portrait: {
      scale: clamp(
        portrait.scale,
        portraitLimits.min,
        portraitLimits.max,
        PORTRAIT_TRANSFORM_DEFAULT.scale
      ),
      x: clamp(portrait.x, 0, 100, PORTRAIT_TRANSFORM_DEFAULT.x),
      y: clamp(portrait.y, 0, 100, PORTRAIT_TRANSFORM_DEFAULT.y),
      mode,
      // Legitimately null under hero: the renderer then draws the hero
      // composition with no foreground person, never a circular portrait.
      cutoutUrl,
      // Absent on every card saved before the composer, which is exactly the
      // set of cards that must keep rendering the old way.
      positionModel: portrait.positionModel === 'anchor' ? 'anchor' : 'legacy',
    },
    /*
      Absent on every card saved before the logo became a layer, which is the
      normal case rather than the exception — so each field falls back to the
      value that reproduces the old fixed placement. An existing card
      normalizes to the corner it is already in.
    */
    logo: {
      x: clamp(logo.x, 0, 100, LOGO_TRANSFORM_DEFAULT.x),
      y: clamp(logo.y, 0, 100, LOGO_TRANSFORM_DEFAULT.y),
      scale: clamp(
        logo.scale,
        LOGO_SCALE_LIMITS.min,
        LOGO_SCALE_LIMITS.max,
        LOGO_TRANSFORM_DEFAULT.scale
      ),
      opacity: clamp(logo.opacity, 0, 1, LOGO_TRANSFORM_DEFAULT.opacity),
      // Only an explicit false hides it; anything else is a card that predates
      // the setting and must keep showing the logo it has always shown.
      visible: logo.visible === false ? false : true,
      positionModel: logo.positionModel === 'anchor' ? 'anchor' : 'legacy',
    },
    /*
      Absent on every card that has never added one, so the empty list is the
      normal answer. Anything without a usable url is dropped rather than
      rendered as a broken layer, and the cap is enforced on read as well as on
      write — a hand-edited row cannot smuggle in a third.
    */
    graphics: graphics
      .filter((g): g is Record<string, unknown> => Boolean(g) && typeof g === 'object')
      .map((g) => ({
        url: typeof g.url === 'string' ? g.url.trim() : '',
        x: clamp(g.x, 0, 100, GRAPHIC_TRANSFORM_DEFAULT.x),
        y: clamp(g.y, 0, 100, GRAPHIC_TRANSFORM_DEFAULT.y),
        scale: clamp(
          g.scale,
          GRAPHIC_SCALE_LIMITS.min,
          GRAPHIC_SCALE_LIMITS.max,
          GRAPHIC_TRANSFORM_DEFAULT.scale
        ),
        opacity: clamp(g.opacity, 0, 1, GRAPHIC_TRANSFORM_DEFAULT.opacity),
        visible: g.visible === false ? false : true,
        placement: (g.placement === 'behind-person'
          ? 'behind-person'
          : 'front-person') as GraphicPlacement,
      }))
      .filter((g) => g.url)
      .slice(0, MAX_GRAPHIC_LAYERS),
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

/**
 * The composition a card is drawn in — hero or classic — and nothing else.
 *
 * This deliberately ignores the cutout. Hero used to mean "hero mode AND a
 * transparent source", which quietly turned every hero card missing its cutout
 * back into a circular portrait: a failed removal, a deleted image, or simply
 * an owner who had just chosen Hero. A circle is Classic's shape and belongs
 * to Classic alone, so a hero card without a subject is a hero card with
 * nobody standing in it — never a circle.
 *
 * Which layout to draw is one question; whether there is a person to place is
 * another. Keeping them apart is what lets the editor show the real
 * composition while the owner is still setting it up.
 */
export function isHeroLayout(portrait: PortraitTransform): boolean {
  return portrait.mode === 'hero'
}

/**
 * Whether a transparent subject exists to paint in front of the artwork. Only
 * the foreground layer asks this; the composition around it does not care.
 */
export function hasHeroSubject(portrait: PortraitTransform): boolean {
  return isHeroLayout(portrait) && Boolean(portrait.cutoutUrl)
}

/**
 * A generated cutout is an in-memory object URL until the owner accepts it and
 * it is uploaded. It renders, but it dies with the tab — so it may be shown
 * and never stored. The test lives here, next to the type, so the write
 * boundary can use it without importing the client-only cutout module.
 */
export function isPendingCutoutUrl(url: string | null): boolean {
  return typeof url === 'string' && url.startsWith('blob:')
}

/**
 * Whether Hero can genuinely be turned on: a subject that will still exist
 * after the save. Hero with nothing durable behind it must not become the
 * publicly active card, and the owner is told why rather than quietly handed
 * a different design.
 */
export function canPersistHero(portrait: PortraitTransform): boolean {
  if (!isHeroLayout(portrait)) return true
  return Boolean(portrait.cutoutUrl) && !isPendingCutoutUrl(portrait.cutoutUrl)
}

/** The image a card should show for the person, given the chosen mode. */
export function portraitSourceUrl(
  portrait: PortraitTransform,
  photoUrl: string | null
): string | null {
  return hasHeroSubject(portrait) ? portrait.cutoutUrl : photoUrl
}

/**
 * A person composed into the hero needs room for a head, shoulders and torso,
 * not a banner with a face wedged into it. Hero mode therefore gets a nearly
 * square frame — at 390px that is a 372px stage, enough for a chest-up
 * portrait with air above the head, which is what makes the composition read
 * as a photograph rather than a cover image.
 *
 * Both ratios are width-derived rather than fixed heights, so one number
 * governs the shape at every viewport and in every renderer.
 */
export const HERO_ASPECT_RATIO_PERSON = 1.05

export function heroAspectRatio(portrait: PortraitTransform): number {
  // Follows the chosen layout, not the presence of a cutout: the frame a hero
  // card is composed into must not change shape the moment its subject is
  // missing, or the setup state would preview a card nobody will receive.
  return isHeroLayout(portrait) ? HERO_ASPECT_RATIO_PERSON : HERO_ASPECT_RATIO
}

/** Background rendering, honouring fill/fit as well as the owner's framing. */
export function backgroundStyle(
  t: BackgroundTransform,
  fit: CardCoverFit
): {
  width: string
  height: string
  objectFit: 'cover' | 'contain'
  objectPosition: string
  transform: string
} {
  return {
    width: '100%',
    height: '100%',
    objectFit: fit === 'fit' ? 'contain' : 'cover',
    objectPosition: `${t.x}% ${t.y}%`,
    transform: `scale(${t.scale})`,
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
