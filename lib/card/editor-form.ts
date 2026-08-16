import { normalizeSocialUrl, normalizeWebsiteUrl } from '@/lib/card/social'
import { normalizeCardSlug, slugifyName } from '@/lib/card/slug'
import {
  CARD_ACCENT_DEFAULT,
  type CardTheme,
  type SocialEnabledMap,
  type SocialNetwork,
} from '@/lib/card/types'

export type EditorForm = {
  full_name: string
  job_title: string
  company_name: string
  card_tagline: string
  what_i_do: string
  looking_for: string
  card_photo_url: string
  card_cover_url: string
  company_logo_url: string
  phone: string
  whatsapp: string
  public_email: string
  website: string
  calendar_url: string
  location: string
  languages: string[]
  show_phone: boolean
  show_whatsapp: boolean
  show_email: boolean
  show_website: boolean
  show_calendar: boolean
  show_location: boolean
  linkedin_url: string
  instagram_url: string
  x_url: string
  facebook_url: string
  youtube_url: string
  tiktok_url: string
  github_url: string
  threads_url: string
  social_enabled: SocialEnabledMap
  card_accent: string
  card_theme: CardTheme
  card_slug: string
  card_published: boolean
  card_branding_removed: boolean
  email: string
  avatar_url: string
}

export const SOCIAL_FIELD_KEYS: Record<SocialNetwork, keyof EditorForm> = {
  linkedin: 'linkedin_url',
  instagram: 'instagram_url',
  x: 'x_url',
  facebook: 'facebook_url',
  youtube: 'youtube_url',
  tiktok: 'tiktok_url',
  github: 'github_url',
  threads: 'threads_url',
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function langs(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function socialEnabled(v: unknown): SocialEnabledMap {
  if (!v || typeof v !== 'object') return {}
  const out: SocialEnabledMap = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'boolean') out[k as SocialNetwork] = val
  }
  return out
}

export function defaultForm(): EditorForm {
  return {
    full_name: '',
    job_title: '',
    company_name: '',
    card_tagline: '',
    what_i_do: '',
    looking_for: '',
    card_photo_url: '',
    card_cover_url: '',
    company_logo_url: '',
    phone: '',
    whatsapp: '',
    public_email: '',
    website: '',
    calendar_url: '',
    location: '',
    languages: [],
    show_phone: true,
    show_whatsapp: true,
    show_email: true,
    show_website: true,
    show_calendar: true,
    show_location: true,
    linkedin_url: '',
    instagram_url: '',
    x_url: '',
    facebook_url: '',
    youtube_url: '',
    tiktok_url: '',
    github_url: '',
    threads_url: '',
    social_enabled: {},
    card_accent: CARD_ACCENT_DEFAULT,
    card_theme: 'graphite',
    card_slug: '',
    card_published: false,
    card_branding_removed: false,
    email: '',
    avatar_url: '',
  }
}

/** Profile row → editor state, with the same legacy column fallbacks as the public card. */
export function profileToForm(profile: Record<string, unknown>): EditorForm {
  const fullName = str(profile.full_name)
  const existingSlug = str(profile.card_slug)

  return {
    full_name: fullName,
    job_title: str(profile.job_title) || str(profile.role),
    company_name: str(profile.company_name) || str(profile.company),
    card_tagline: str(profile.card_tagline),
    what_i_do: str(profile.what_i_do) || str(profile.product_description),
    looking_for: str(profile.looking_for) || str(profile.goals),
    card_photo_url: str(profile.card_photo_url) || str(profile.avatar_url),
    card_cover_url: str(profile.card_cover_url),
    company_logo_url: str(profile.company_logo_url),
    phone: str(profile.phone),
    whatsapp: str(profile.whatsapp),
    public_email: str(profile.public_email) || str(profile.email),
    website: str(profile.website),
    calendar_url: str(profile.calendar_url),
    location: str(profile.location),
    languages: langs(profile.languages),
    show_phone: bool(profile.show_phone, true),
    show_whatsapp: bool(profile.show_whatsapp, true),
    show_email: bool(profile.show_email, true),
    show_website: bool(profile.show_website, true),
    show_calendar: bool(profile.show_calendar, true),
    show_location: bool(profile.show_location, true),
    linkedin_url: str(profile.linkedin_url),
    instagram_url: str(profile.instagram_url),
    x_url: str(profile.x_url),
    facebook_url: str(profile.facebook_url),
    youtube_url: str(profile.youtube_url),
    tiktok_url: str(profile.tiktok_url),
    github_url: str(profile.github_url),
    threads_url: str(profile.threads_url),
    social_enabled: socialEnabled(profile.social_enabled),
    card_accent: str(profile.card_accent) || CARD_ACCENT_DEFAULT,
    card_theme: str(profile.card_theme) === 'light' ? 'light' : 'graphite',
    card_slug: existingSlug || (fullName ? slugifyName(fullName) : ''),
    card_published: bool(profile.card_published, false),
    card_branding_removed: bool(profile.card_branding_removed, false),
    email: str(profile.email),
    avatar_url: str(profile.avatar_url),
  }
}

/**
 * Editor state → a profile-shaped row. Used both for the live preview and,
 * via buildSavePayload, for the write — so what the user previews is built
 * from exactly the same mapping that gets stored.
 */
export function formToProfileRow(form: EditorForm, userId: string): Record<string, unknown> {
  return {
    id: userId,
    full_name: form.full_name || null,
    job_title: form.job_title || null,
    role: form.job_title || null,
    company_name: form.company_name || null,
    company: form.company_name || null,
    card_tagline: form.card_tagline || null,
    what_i_do: form.what_i_do || null,
    looking_for: form.looking_for || null,
    card_photo_url: form.card_photo_url || null,
    avatar_url: form.card_photo_url || form.avatar_url || null,
    card_cover_url: form.card_cover_url || null,
    company_logo_url: form.company_logo_url || null,
    phone: form.phone || null,
    whatsapp: form.whatsapp || null,
    public_email: form.public_email || null,
    email: form.email || form.public_email || null,
    website: form.website || null,
    calendar_url: form.calendar_url || null,
    location: form.location || null,
    languages: form.languages,
    show_phone: form.show_phone,
    show_whatsapp: form.show_whatsapp,
    show_email: form.show_email,
    show_website: form.show_website,
    show_calendar: form.show_calendar,
    show_location: form.show_location,
    linkedin_url: form.linkedin_url || null,
    instagram_url: form.instagram_url || null,
    x_url: form.x_url || null,
    facebook_url: form.facebook_url || null,
    youtube_url: form.youtube_url || null,
    tiktok_url: form.tiktok_url || null,
    github_url: form.github_url || null,
    threads_url: form.threads_url || null,
    social_enabled: form.social_enabled,
    card_accent: form.card_accent || CARD_ACCENT_DEFAULT,
    card_theme: form.card_theme,
    card_slug: form.card_slug || null,
    card_published: form.card_published,
    card_branding_removed: form.card_branding_removed,
  }
}

/** The trimmed, normalized row actually written to abc_profiles. */
export function buildSavePayload(form: EditorForm): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    full_name: form.full_name.trim() || null,
    job_title: form.job_title.trim() || null,
    role: form.job_title.trim() || null,
    company_name: form.company_name.trim() || null,
    company: form.company_name.trim() || null,
    card_tagline: form.card_tagline.trim().slice(0, 80) || null,
    what_i_do: form.what_i_do.trim().slice(0, 300) || null,
    looking_for: form.looking_for.trim().slice(0, 200) || null,
    card_photo_url: form.card_photo_url || null,
    card_cover_url: form.card_cover_url || null,
    company_logo_url: form.company_logo_url || null,
    phone: form.phone.trim() || null,
    whatsapp: form.whatsapp.trim() || null,
    public_email: form.public_email.trim() || null,
    website: normalizeWebsiteUrl(form.website),
    calendar_url: normalizeWebsiteUrl(form.calendar_url),
    location: form.location.trim() || null,
    languages: form.languages,
    show_phone: form.show_phone,
    show_whatsapp: form.show_whatsapp,
    show_email: form.show_email,
    show_website: form.show_website,
    show_calendar: form.show_calendar,
    show_location: form.show_location,
    linkedin_url: normalizeSocialUrl('linkedin', form.linkedin_url),
    instagram_url: normalizeSocialUrl('instagram', form.instagram_url),
    x_url: normalizeSocialUrl('x', form.x_url),
    facebook_url: normalizeSocialUrl('facebook', form.facebook_url),
    youtube_url: normalizeSocialUrl('youtube', form.youtube_url),
    tiktok_url: normalizeSocialUrl('tiktok', form.tiktok_url),
    github_url: normalizeSocialUrl('github', form.github_url),
    threads_url: normalizeSocialUrl('threads', form.threads_url),
    social_enabled: form.social_enabled,
    card_accent: form.card_accent || CARD_ACCENT_DEFAULT,
    card_theme: form.card_theme,
    card_slug: normalizeCardSlug(form.card_slug) || null,
    card_published: form.card_published,
  }

  // Keeps the app-wide avatar in step with the card photo, but never clears it.
  if (form.card_photo_url) payload.avatar_url = form.card_photo_url

  return payload
}

/** Values the save normalizes, folded back so the form matches what was stored. */
export function normalizedFormAfterSave(form: EditorForm): Partial<EditorForm> {
  const payload = buildSavePayload(form)
  const pick = (key: string): string => {
    const value = payload[key]
    return typeof value === 'string' ? value : ''
  }

  return {
    card_slug: normalizeCardSlug(form.card_slug),
    website: pick('website'),
    calendar_url: pick('calendar_url'),
    linkedin_url: pick('linkedin_url'),
    instagram_url: pick('instagram_url'),
    x_url: pick('x_url'),
    facebook_url: pick('facebook_url'),
    youtube_url: pick('youtube_url'),
    tiktok_url: pick('tiktok_url'),
    github_url: pick('github_url'),
    threads_url: pick('threads_url'),
  }
}
