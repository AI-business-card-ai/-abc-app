import { DEFAULT_RESEARCH_PREFERENCES } from '@/lib/research'
import type { ABCProfile } from '@/lib/types'

export const EMPTY_ABC_PROFILE: Omit<ABCProfile, 'id'> = {
  full_name: '',
  company: '',
  role: '',
  email: '',
  phone: '',
  linkedin_url: '',
  website: '',
  avatar_url: '',
  communication_style: 'direct',
  outreach_language: 'EN',
  goals: '',
  plan: 'free',
  plan_activated_at: null,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  scans_used: 0,
  scans_limit: 30,
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
  webhook_url: null,
  user_name: null,
  user_company: null,
  user_role: null,
  user_product: null,
  user_goal: null,
  user_icp: null,
  user_style: null,
  user_language: 'EN',
  user_message_length: null,
  user_prompt: null,
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
const PLAN_VALUES = new Set<ABCProfile['plan']>(['free', 'starter', 'pro', 'team'])

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

/** Safe defaults when abc_profiles row is missing or partially migrated. */
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
    full_name: asString(data.full_name || data.user_name, ''),
    company: asString(data.company || data.user_company, ''),
    role: asString(data.role || data.user_role, ''),
    email: asString(data.email, userEmail ?? ''),
    phone: asString(data.phone, ''),
    linkedin_url: asString(data.linkedin_url, ''),
    website: asString(data.website, ''),
    avatar_url: asString(data.avatar_url, ''),
    communication_style: communicationStyle,
    outreach_language: asString(data.outreach_language || data.user_language, 'EN'),
    goals: asString(data.goals || data.user_goal, ''),
    plan,
    plan_activated_at: asNullableString(data.plan_activated_at),
    stripe_customer_id: asNullableString(data.stripe_customer_id),
    stripe_subscription_id: asNullableString(data.stripe_subscription_id),
    scans_used: asNumber(data.scans_used, 0),
    scans_limit: asNumber(data.scans_limit, 30),
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
    webhook_url: asNullableString(data.webhook_url),
    user_name: asNullableString(data.user_name),
    user_company: asNullableString(data.user_company),
    user_role: asNullableString(data.user_role),
    user_product: asNullableString(data.user_product),
    user_goal: asNullableString(data.user_goal),
    user_icp: asNullableString(data.user_icp),
    user_style: asNullableString(data.user_style),
    user_language: asString(data.user_language, 'EN'),
    user_message_length: asNullableString(data.user_message_length || data.message_length),
    user_prompt: asNullableString(data.user_prompt),
    onboarding_completed: Boolean(data.onboarding_completed),
    message_goal: asString(data.message_goal || data.user_goal, 'Schedule a meeting'),
    message_length: asString(data.message_length || data.user_message_length, 'medium'),
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
