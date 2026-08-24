import { CARD_ACCENT_DEFAULT } from '@/lib/card/types'
import { DEFAULT_RESEARCH_PREFERENCES } from '@/lib/research'
import { getScanLimitForPlan } from '@/lib/scan-limits'
import type { ABCProfile } from '@/lib/types'

export const EMPTY_ABC_PROFILE: Omit<ABCProfile, 'id'> = {
  user_name: '',
  full_name: '',
  company: '',
  role: '',
  email: '',
  phone: '',
  linkedin_url: '',
  website: '',
  avatar_url: '',
  card_slug: null,
  card_published: false,
  card_branding_removed: false,
  card_accent: CARD_ACCENT_DEFAULT,
  card_theme: 'graphite',
  card_tagline: null,
  what_i_do: null,
  looking_for: null,
  job_title: null,
  company_name: null,
  card_photo_url: null,
  card_cover_url: null,
  company_logo_url: null,
  whatsapp: null,
  public_email: null,
  calendar_url: null,
  location: null,
  languages: [],
  show_phone: true,
  show_whatsapp: true,
  show_email: true,
  show_website: true,
  show_calendar: true,
  show_location: true,
  instagram_url: null,
  x_url: null,
  facebook_url: null,
  youtube_url: null,
  tiktok_url: null,
  github_url: null,
  threads_url: null,
  social_enabled: {},
  communication_style: 'direct',
  outreach_language: 'EN',
  goals: '',
  plan: 'free',
  plan_activated_at: null,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  scans_used: 0,
  scans_limit: 3,
  research_preferences: [...DEFAULT_RESEARCH_PREFERENCES],
  custom_questions: '',
  hubspot_api_key: null,
  hubspot_access_token: null,
  hubspot_refresh_token: null,
  hubspot_portal_id: null,
  hubspot_connected_at: null,
  salesforce_access_token: null,
  salesforce_refresh_token: null,
  salesforce_instance_url: null,
  salesforce_connected_at: null,
  google_connected: false,
  google_email: null,
  google_refresh_token: null,
  google_access_token: null,
  google_token_expires_at: null,
  webhook_url: null,
  product_description: null,
  icp: null,
  system_prompt: null,
  onboarding_completed: false,
  message_goal: 'Schedule a meeting',
  message_length: 'medium',
  research_company_size: false,
  research_revenue: false,
  research_location: false,
  research_news: false,
  research_events: false,
  research_linkedin: false,
  research_funding: false,
  research_competitors: false,
  research_tech: false,
  research_hiring: false,
  research_products: false,
  research_pain_points: false,
  research_custom: null,
}

const STYLE_VALUES = new Set<ABCProfile['communication_style']>(['direct', 'formal', 'casual'])
const PLAN_VALUES = new Set<ABCProfile['plan']>(['free', 'starter', 'pro', 'team', 'INTERNAL_TEST'])

function parseResearchPreferences(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return [...DEFAULT_RESEARCH_PREFERENCES]
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string')
      }
    } catch {
      return trimmed.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
    }
  }
  return [...DEFAULT_RESEARCH_PREFERENCES]
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Safe defaults when abc_profiles row is missing or partially populated. */
export function normalizeAbcProfile(
  raw: Partial<ABCProfile> | null | undefined,
  userEmail?: string | null
): Omit<ABCProfile, 'id'> {
  const data = raw ?? {}
  const researchPreferences = parseResearchPreferences(data.research_preferences)
  const communicationStyle = STYLE_VALUES.has(data.communication_style as ABCProfile['communication_style'])
    ? (data.communication_style as ABCProfile['communication_style'])
    : 'direct'
  const plan = PLAN_VALUES.has(data.plan as ABCProfile['plan'])
    ? (data.plan as ABCProfile['plan'])
    : 'free'

  return {
    ...EMPTY_ABC_PROFILE,
    user_name: asString(data.user_name, ''),
    full_name: asString(data.full_name, ''),
    company: asString(data.company, ''),
    role: asString(data.role, ''),
    email: asString(data.email, userEmail ?? ''),
    phone: asString(data.phone, ''),
    linkedin_url: asString(data.linkedin_url, ''),
    website: asString(data.website, ''),
    avatar_url: asString(data.avatar_url, ''),
    card_slug: asNullableString(data.card_slug),
    card_published: Boolean(data.card_published),
    card_branding_removed: Boolean(data.card_branding_removed),
    card_accent: asNullableString(data.card_accent) || CARD_ACCENT_DEFAULT,
    card_theme: data.card_theme === 'light' ? 'light' : 'graphite',
    card_tagline: asNullableString(data.card_tagline),
    what_i_do: asNullableString(data.what_i_do),
    looking_for: asNullableString(data.looking_for),
    job_title: asNullableString(data.job_title),
    company_name: asNullableString(data.company_name),
    card_photo_url: asNullableString(data.card_photo_url),
    card_cover_url: asNullableString(data.card_cover_url),
    company_logo_url: asNullableString(data.company_logo_url),
    whatsapp: asNullableString(data.whatsapp),
    public_email: asNullableString(data.public_email),
    calendar_url: asNullableString(data.calendar_url),
    location: asNullableString(data.location),
    languages: Array.isArray(data.languages)
      ? data.languages.filter((x): x is string => typeof x === 'string')
      : [],
    show_phone: data.show_phone !== false,
    show_whatsapp: data.show_whatsapp !== false,
    show_email: data.show_email !== false,
    show_website: data.show_website !== false,
    show_calendar: data.show_calendar !== false,
    show_location: data.show_location !== false,
    instagram_url: asNullableString(data.instagram_url),
    x_url: asNullableString(data.x_url),
    facebook_url: asNullableString(data.facebook_url),
    youtube_url: asNullableString(data.youtube_url),
    tiktok_url: asNullableString(data.tiktok_url),
    github_url: asNullableString(data.github_url),
    threads_url: asNullableString(data.threads_url),
    social_enabled:
      data.social_enabled && typeof data.social_enabled === 'object'
        ? (data.social_enabled as Record<string, boolean>)
        : {},
    communication_style: communicationStyle,
    outreach_language: asString(data.outreach_language, 'EN'),
    goals: asString(data.goals, ''),
    plan,
    plan_activated_at: asNullableString(data.plan_activated_at),
    stripe_customer_id: asNullableString(data.stripe_customer_id),
    stripe_subscription_id: asNullableString(data.stripe_subscription_id),
    scans_used: asNumber(data.scans_used, 0),
    scans_limit: asNumber(data.scans_limit, getScanLimitForPlan(plan)),
    research_preferences: researchPreferences.length ? researchPreferences : [...DEFAULT_RESEARCH_PREFERENCES],
    custom_questions: asString(data.custom_questions, ''),
    hubspot_api_key: asNullableString(data.hubspot_api_key),
    hubspot_access_token: asNullableString(data.hubspot_access_token),
    hubspot_refresh_token: asNullableString(data.hubspot_refresh_token),
    hubspot_portal_id: asNullableString(data.hubspot_portal_id),
    hubspot_connected_at: asNullableString(data.hubspot_connected_at),
    salesforce_access_token: asNullableString(data.salesforce_access_token),
    salesforce_refresh_token: asNullableString(data.salesforce_refresh_token),
    salesforce_instance_url: asNullableString(data.salesforce_instance_url),
    salesforce_connected_at: asNullableString(data.salesforce_connected_at),
    google_connected: Boolean(data.google_connected),
    google_email: asNullableString(data.google_email),
    google_refresh_token: asNullableString(data.google_refresh_token),
    google_access_token: asNullableString(data.google_access_token),
    google_token_expires_at: asNullableString(data.google_token_expires_at),
    webhook_url: asNullableString(data.webhook_url),
    product_description: asNullableString(data.product_description),
    icp: asNullableString(data.icp),
    system_prompt: asNullableString(data.system_prompt),
    onboarding_completed: Boolean(data.onboarding_completed),
    message_goal: asString(data.message_goal, 'Schedule a meeting'),
    message_length: asString(data.message_length, 'medium'),
    research_company_size: Boolean(data.research_company_size),
    research_revenue: Boolean(data.research_revenue),
    research_location: Boolean(data.research_location),
    research_news: Boolean(data.research_news),
    research_events: Boolean(data.research_events),
    research_linkedin: Boolean(data.research_linkedin),
    research_funding: Boolean(data.research_funding),
    research_competitors: Boolean(data.research_competitors),
    research_tech: Boolean(data.research_tech),
    research_hiring: Boolean(data.research_hiring),
    research_products: Boolean(data.research_products),
    research_pain_points: Boolean(data.research_pain_points),
    research_custom: asNullableString(data.research_custom),
  }
}

/**
 * Profile fields that are credentials, not data.
 *
 * These have no business in a browser. They live on abc_profiles for historical
 * reasons and the `authenticated` role can still select them directly, so this
 * list is defence in depth rather than the fix — the fix is moving credentials
 * out of this table, which crm_connections does for HubSpot. Everything named
 * here is stripped before a profile is handed to a client component, so nobody
 * has to remember not to serialize it.
 */
export const PROFILE_SECRET_FIELDS = [
  'hubspot_api_key',
  'hubspot_access_token',
  'hubspot_refresh_token',
  'salesforce_access_token',
  'salesforce_refresh_token',
  'google_refresh_token',
  'google_access_token',
] as const

/** A profile safe to send to the browser. Secrets become null, shape unchanged. */
export function stripProfileSecrets<T extends Record<string, unknown>>(profile: T): T {
  const safe = { ...profile }
  for (const field of PROFILE_SECRET_FIELDS) {
    if (field in safe) (safe as Record<string, unknown>)[field] = null
  }
  return safe
}

/**
 * Every abc_profiles column a browser is allowed to read.
 *
 * The profile table holds OAuth credentials alongside ordinary settings, and
 * PostgREST grants `authenticated` access at table level — so a signed-in
 * browser running select(*) was entitled to its own Google and HubSpot tokens.
 * The database now grants SELECT column by column instead, which means select(*)
 * no longer works for that role and every query has to say what it wants.
 *
 * This is that list, and it is deliberately the complete safe set rather than a
 * per-screen selection: substituting it for select(*) removes the credentials
 * and nothing else, so no screen can quietly lose a field it was relying on.
 * Adding a credential column here would undo the containment — new secrets
 * belong in a server-only table, the way crm_connections holds HubSpot.
 */
export const PROFILE_SAFE_COLUMNS = [
  'id', 'full_name', 'company', 'role', 'email', 'phone', 'linkedin_url', 'website',
  'communication_style', 'outreach_language', 'goals', 'plan', 'scans_used', 'scans_limit',
  'created_at', 'research_preferences', 'custom_questions', 'avatar_url', 'hubspot_portal_id',
  'hubspot_connected_at', 'webhook_url', 'onboarding_completed', 'user_name', 'user_company',
  'user_role', 'user_product', 'user_goal', 'user_icp', 'user_style', 'user_language',
  'user_prompt', 'user_message_length', 'plan_activated_at', 'stripe_customer_id',
  'stripe_subscription_id', 'research_company_size', 'research_revenue', 'research_location',
  'research_news', 'research_events', 'research_linkedin', 'research_funding',
  'research_competitors', 'research_tech', 'research_hiring', 'research_products',
  'research_pain_points', 'research_custom', 'message_goal', 'message_length',
  'product_description', 'icp', 'system_prompt', 'google_connected', 'google_email',
  'card_slug', 'card_published', 'card_photo_url', 'card_cover_url', 'company_logo_url',
  'card_tagline', 'card_bio', 'card_theme', 'card_accent', 'job_title', 'company_name',
  'whatsapp', 'public_email', 'calendar_url', 'location', 'languages', 'looking_for',
  'what_i_do', 'card_branding_removed', 'instagram_url', 'x_url', 'facebook_url', 'youtube_url',
  'tiktok_url', 'github_url', 'threads_url', 'show_phone', 'show_whatsapp', 'show_email',
  'show_website', 'show_calendar', 'show_location', 'social_enabled', 'card_cover_position',
  'card_cover_fit', 'card_media_transforms', 'showcase_enabled', 'showcase_title',
].join(", ")

/**
 * Exactly the columns browser code writes, derived from the eight client call
 * sites that update this table — not the readable set minus a blocklist. The
 * database grants UPDATE on these and nothing else, so anything added here has
 * to be added there too, deliberately.
 */
export const PROFILE_WRITABLE_COLUMNS = [
  'avatar_url', 'calendar_url', 'card_accent', 'card_cover_fit', 'card_cover_position',
  'card_cover_url', 'card_media_transforms', 'card_photo_url', 'card_published', 'card_slug',
  'card_tagline', 'card_theme', 'communication_style', 'company', 'company_logo_url',
  'company_name', 'facebook_url', 'full_name', 'github_url', 'goals', 'icp', 'instagram_url',
  'job_title', 'languages', 'linkedin_url', 'location', 'looking_for', 'message_goal',
  'message_length', 'outreach_language', 'phone', 'product_description', 'public_email', 'role',
  'show_calendar', 'show_email', 'show_location', 'show_phone', 'show_website', 'show_whatsapp',
  'showcase_enabled', 'showcase_title', 'social_enabled', 'threads_url', 'tiktok_url',
  'website', 'what_i_do', 'whatsapp', 'x_url', 'youtube_url',
]
