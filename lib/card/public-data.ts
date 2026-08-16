import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CardEvent,
  CardLink,
  CardTheme,
  DigitalCardData,
  SocialEnabledMap,
  SocialNetwork,
} from '@/lib/card/types'
import { CARD_ACCENT_DEFAULT, LEGACY_CARD_ACCENTS, normalizeCardEventRow } from '@/lib/card/types'
import { normalizeSocialUrl, normalizeWebsiteUrl } from '@/lib/card/social'

type ProfileRow = Record<string, unknown>

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function asBool(v: unknown, fallback = true): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function asLanguages(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  return []
}

function asSocialEnabled(v: unknown): SocialEnabledMap {
  if (!v || typeof v !== 'object') return {}
  const out: SocialEnabledMap = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'boolean') out[k as SocialNetwork] = val
  }
  return out
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Legacy pink / turquoise / purple accents render as ABC gold. */
function normalizeAccent(value: string | null): string {
  if (!value) return CARD_ACCENT_DEFAULT
  const hex = value.trim().toLowerCase()
  if ((LEGACY_CARD_ACCENTS as readonly string[]).includes(hex)) return CARD_ACCENT_DEFAULT
  return hex
}

export function mapProfileToCardData(
  profile: ProfileRow,
  links: CardLink[] = [],
  events: CardEvent[] = []
): DigitalCardData {
  const fullName = asString(profile.full_name) || 'ABC User'
  const slug =
    asString(profile.card_slug) ||
    asString(profile.user_name) ||
    String(profile.id).slice(0, 8)

  const socialEnabled = asSocialEnabled(profile.social_enabled)

  return {
    userId: String(profile.id),
    slug,
    fullName,
    jobTitle: asString(profile.job_title) || asString(profile.role),
    companyName: asString(profile.company_name) || asString(profile.company),
    tagline: asString(profile.card_tagline) || asString(profile.tagline),
    whatIDo: asString(profile.what_i_do) || asString(profile.product_description),
    lookingFor: asString(profile.looking_for) || asString(profile.goals),
    photoUrl:
      asString(profile.card_photo_url) ||
      asString(profile.avatar_url) ||
      asString(profile.photo_url),
    coverUrl: asString(profile.card_cover_url) || asString(profile.cover_url),
    logoUrl: asString(profile.company_logo_url) || asString(profile.logo_url),
    phone: asString(profile.phone),
    whatsapp: asString(profile.whatsapp) || asString(profile.whatsapp_number),
    email: asString(profile.public_email) || asString(profile.email),
    website: normalizeWebsiteUrl(asString(profile.website)),
    calendarUrl: normalizeWebsiteUrl(asString(profile.calendar_url)),
    location: asString(profile.location),
    languages: asLanguages(profile.languages),
    showPhone: asBool(profile.show_phone, true),
    showWhatsapp: asBool(profile.show_whatsapp, true),
    showEmail: asBool(profile.show_email, true),
    showWebsite: asBool(profile.show_website, true),
    showCalendar: asBool(profile.show_calendar, true),
    showLocation: asBool(profile.show_location, true),
    linkedinUrl: normalizeSocialUrl('linkedin', asString(profile.linkedin_url)),
    instagramUrl: normalizeSocialUrl('instagram', asString(profile.instagram_url)),
    xUrl: normalizeSocialUrl('x', asString(profile.x_url)),
    facebookUrl: normalizeSocialUrl('facebook', asString(profile.facebook_url)),
    youtubeUrl: normalizeSocialUrl('youtube', asString(profile.youtube_url)),
    tiktokUrl: normalizeSocialUrl('tiktok', asString(profile.tiktok_url)),
    githubUrl: normalizeSocialUrl('github', asString(profile.github_url)),
    threadsUrl: normalizeSocialUrl('threads', asString(profile.threads_url)),
    socialEnabled,
    accent: normalizeAccent(asString(profile.card_accent)),
    theme: ((asString(profile.card_theme) as CardTheme) || 'graphite') === 'light' ? 'light' : 'graphite',
    brandingRemoved: asBool(profile.card_branding_removed, false),
    published: asBool(profile.card_published, false),
    links: links
      .filter((l) => l.is_active)
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order),
    events: events
      .filter((e) => !e.date_to || e.date_to >= todayISO())
      .slice()
      .sort((a, b) => (a.date_from || '').localeCompare(b.date_from || '')),
  }
}

export async function loadPublishedCardBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<DigitalCardData | null> {
  try {
    const { data: profile, error } = await supabase
      .from('abc_profiles')
      .select('*')
      .eq('card_slug', slug)
      .eq('card_published', true)
      .maybeSingle()

    if (error) {
      console.error('[card/public-data] profile load failed:', error)
      return null
    }
    if (!profile) return null

    const userId = profile.id as string

    const [{ data: links }, { data: events }] = await Promise.all([
      supabase
        .from('card_links')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('card_events')
        .select('*')
        .eq('user_id', userId)
        .gte('date_to', todayISO())
        .order('date_from', { ascending: true }),
    ])

    return redactHiddenFields(
      mapProfileToCardData(
        profile as ProfileRow,
        (links || []) as CardLink[],
        (events || []).map((row) => normalizeCardEventRow(row as Record<string, unknown>))
      )
    )
  } catch (err) {
    console.error('[card/public-data] unexpected error:', err)
    return null
  }
}

/**
 * Drops the values the owner has switched off before the card leaves the
 * server. Hiding a row in the UI is not enough: this object is serialized into
 * the page payload and is the source the vCard and OG image are built from, so
 * a hidden phone number would otherwise still be readable in the page source
 * and land in anyone's address book.
 */
export function redactHiddenFields(card: DigitalCardData): DigitalCardData {
  const socials: [SocialNetwork, keyof DigitalCardData][] = [
    ['linkedin', 'linkedinUrl'],
    ['instagram', 'instagramUrl'],
    ['x', 'xUrl'],
    ['facebook', 'facebookUrl'],
    ['youtube', 'youtubeUrl'],
    ['tiktok', 'tiktokUrl'],
    ['github', 'githubUrl'],
    ['threads', 'threadsUrl'],
  ]

  const redacted: DigitalCardData = {
    ...card,
    phone: card.showPhone ? card.phone : null,
    whatsapp: card.showWhatsapp ? card.whatsapp : null,
    email: card.showEmail ? card.email : null,
    website: card.showWebsite ? card.website : null,
    calendarUrl: card.showCalendar ? card.calendarUrl : null,
    location: card.showLocation ? card.location : null,
  }

  const writable = redacted as unknown as Record<string, unknown>
  for (const [network, key] of socials) {
    if (card.socialEnabled[network] === false) writable[key] = null
  }

  return redacted
}

export async function recordCardView(
  supabase: SupabaseClient,
  userId: string,
  source: string | null,
  referrer: string | null
): Promise<void> {
  try {
    const { error } = await supabase.from('card_views').insert({
      user_id: userId,
      source: source || null,
      referrer: referrer || null,
    })
    if (error) console.error('[card/public-data] view insert failed:', error)
  } catch (err) {
    console.error('[card/public-data] view tracking failed:', err)
  }
}

export function isSocialVisible(
  card: DigitalCardData,
  network: SocialNetwork,
  url: string | null
): boolean {
  if (!url) return false
  const flag = card.socialEnabled[network]
  return flag !== false
}
