import type { ScannedContact } from './types'

export type LeadStatus =
  | 'New'
  | 'Working'
  | 'Nurturing'
  | 'Qualified'
  | 'Unqualified'
  | 'Converted'

export type LeadRating = 'Hot' | 'Warm' | 'Cold'

export type OpportunityStage =
  | 'Prospecting'
  | 'Qualification'
  | 'Needs Analysis'
  | 'Value Proposition'
  | 'Decision Makers'
  | 'Perception Analysis'
  | 'Proposal/Price Quote'
  | 'Negotiation/Review'
  | 'Closed Won'
  | 'Closed Lost'

export const LEAD_STATUSES: LeadStatus[] = [
  'New',
  'Working',
  'Nurturing',
  'Qualified',
  'Unqualified',
  'Converted',
]

export const LEAD_RATINGS: LeadRating[] = ['Hot', 'Warm', 'Cold']

export const OPPORTUNITY_STAGES: OpportunityStage[] = [
  'Prospecting',
  'Qualification',
  'Needs Analysis',
  'Value Proposition',
  'Decision Makers',
  'Perception Analysis',
  'Proposal/Price Quote',
  'Negotiation/Review',
  'Closed Won',
  'Closed Lost',
]

export interface ABCContact {
  id: string
  first_name: string
  last_name: string
  full_name: string
  email: string
  phone: string
  mobile_phone: string
  photo_url: string
  linkedin_url: string

  company: string
  position: string
  website: string
  industry: string
  company_size: string
  no_of_employees: number
  annual_revenue: number
  billing_city: string
  billing_country: string
  company_technologies: string[]
  company_funding_stage: string

  lead_status: LeadStatus
  rating: LeadRating
  pipeline_stage: string
  crm_status: string

  opportunity_name: string
  opportunity_stage: string
  deal_value: number
  deal_currency: string
  expected_close_date: string
  close_probability: number
  next_step: string
  opportunity_type: string

  last_activity_channel: string
  last_activity_at: string
  last_contacted_date: string
  reply_received: boolean
  total_activities: number
  messages_sent: number

  match_score: number
  match_reason: string
  ai_summary: string
  tags: string[]
  lead_source: string
  meeting_location: string
  meeting_date: string

  linkedin_headline: string
  linkedin_summary: string
  linkedin_skills: string[]
  linkedin_posts: unknown[]
  linkedin_experience: unknown[]
  linkedin_activity_level: string

  events_past: unknown[]
  events_upcoming: unknown[]
  speaking_engagements: unknown[]
  last_event_attended: string
  next_event_attending: string

  enrichment_status: string
  enrichment_source: string
  scanned_at: string
}

export function splitName(fullName: string | null | undefined): {
  first_name: string
  last_name: string
} {
  const name = (fullName || '').trim()
  if (!name) return { first_name: '', last_name: '' }
  const space = name.indexOf(' ')
  if (space <= 0) return { first_name: name, last_name: '' }
  return {
    first_name: name.slice(0, space),
    last_name: name.slice(space + 1).trim(),
  }
}

export function scoreToRating(score: number): LeadRating {
  if (score >= 70) return 'Hot'
  if (score >= 40) return 'Warm'
  return 'Cold'
}

export function scoreToCloseProbability(score: number): number {
  if (score >= 70) return 30
  if (score >= 50) return 20
  if (score >= 40) return 10
  return 5
}

export function postsToActivityLevel(
  posts: { text: string; date: string }[] | null | undefined
): string {
  const count = posts?.length ?? 0
  if (count >= 5) return 'Very Active'
  if (count >= 3) return 'Active'
  if (count >= 1) return 'Moderate'
  return 'Low'
}

function str(value: unknown): string {
  return value != null ? String(value) : ''
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function arr(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : []
}

export function toABCContact(row: ScannedContact | Record<string, unknown>): ABCContact {
  const c = row as ScannedContact
  const { first_name, last_name } =
    c.first_name || c.last_name
      ? { first_name: str(c.first_name), last_name: str(c.last_name) }
      : splitName(c.name)

  const fullName = c.name?.trim() || [first_name, last_name].filter(Boolean).join(' ')
  const matchScore = c.ai_lead_score ?? c.match_score ?? 0
  const eventsPast = (c.events_past as unknown[]) || []
  const eventsUpcoming = (c.events_upcoming as unknown[]) || []
  const past0 = eventsPast[0] as { name?: string; date?: string } | undefined
  const up0 = eventsUpcoming[0] as { name?: string; date?: string } | undefined

  return {
    id: str(c.id),
    first_name,
    last_name,
    full_name: fullName,
    email: str(c.email),
    phone: str(c.phone),
    mobile_phone: str(c.mobile_phone || c.phone),
    photo_url: str(c.photo_url),
    linkedin_url: str(c.linkedin_url),

    company: str(c.company),
    position: str(c.role),
    website: str(c.website),
    industry: str(c.industry),
    company_size: str(c.company_size),
    no_of_employees: num(c.no_of_employees),
    annual_revenue: num(c.annual_revenue || c.company_revenue),
    billing_city: str(c.billing_city),
    billing_country: str(c.billing_country),
    company_technologies: arr(c.company_technologies || c.technologies),
    company_funding_stage: str(c.company_funding_stage),

    lead_status: (c.lead_status as LeadStatus) || 'New',
    rating: (c.rating as LeadRating) || scoreToRating(matchScore),
    pipeline_stage: str(c.pipeline_stage || 'new'),
    crm_status: str(c.crm_status || 'NEW'),

    opportunity_name: str(c.opportunity_name),
    opportunity_stage: str(c.opportunity_stage || 'Prospecting'),
    deal_value: num(c.deal_value),
    deal_currency: str(c.deal_currency || 'USD'),
    expected_close_date: str(c.expected_close_date),
    close_probability: num(c.close_probability) || scoreToCloseProbability(matchScore),
    next_step: str(c.next_step || c.next_action),
    opportunity_type: str(c.opportunity_type || 'New Business'),

    last_activity_channel: str(c.last_activity_channel || c.last_message_type),
    last_activity_at: str(c.last_activity_at),
    last_contacted_date: str(c.last_contacted_date || c.last_message_date),
    reply_received: Boolean(c.reply_received ?? c.response_received),
    total_activities: num(c.total_activities || c.contact_count),
    messages_sent: num(c.messages_sent),

    match_score: matchScore,
    match_reason: str(c.match_reason),
    ai_summary: str(c.ai_summary || c.company_summary || c.match_reason),
    tags: arr(c.tags),
    lead_source: str(c.lead_source || 'ABC AI Business Card'),
    meeting_location: str(c.meeting_location || c.event_name || c.meeting_event_name),
    meeting_date: str(c.meeting_date || c.meeting_event_date),

    linkedin_headline: str(c.linkedin_headline),
    linkedin_summary: str(c.linkedin_summary),
    linkedin_skills: arr(c.linkedin_skills),
    linkedin_posts: (c.linkedin_posts as unknown[]) || [],
    linkedin_experience: (c.linkedin_experience as unknown[]) || [],
    linkedin_activity_level:
      str(c.linkedin_activity_level) || postsToActivityLevel(c.linkedin_posts),

    events_past: eventsPast,
    events_upcoming: eventsUpcoming,
    speaking_engagements: (c.speaking_engagements as unknown[]) || [],
    last_event_attended: str(c.last_event_attended || past0?.name),
    next_event_attending: str(c.next_event_attending || up0?.name),

    enrichment_status: str(c.enrichment_status),
    enrichment_source: str(c.enrichment_source || 'ABC AI Business Card'),
    scanned_at: str(c.scanned_at),
  }
}

export function buildPostEnrichmentMapping(
  contact: ScannedContact | Record<string, unknown>,
  enrichmentDone = true
): Record<string, unknown> {
  const c = contact as ScannedContact
  const { first_name, last_name } = splitName(c.name)
  const score = c.ai_lead_score ?? c.match_score ?? 0
  const eventsPast = (c.events_past as { name?: string; date?: string }[]) || []
  const eventsUpcoming = (c.events_upcoming as { name?: string; date?: string }[]) || []
  const past0 = eventsPast[0]
  const up0 = eventsUpcoming[0]

  const updates: Record<string, unknown> = {
    first_name: c.first_name || first_name,
    last_name: c.last_name ?? last_name,
    rating: c.rating || scoreToRating(score),
    close_probability: c.close_probability || scoreToCloseProbability(score),
    opportunity_name:
      c.opportunity_name ||
      (c.company && c.role ? `${c.company} - ${c.role}` : c.company || ''),
    company_technologies: c.company_technologies || c.technologies || [],
    ai_summary: c.ai_summary || c.company_summary || c.match_reason || null,
    linkedin_activity_level:
      c.linkedin_activity_level || postsToActivityLevel(c.linkedin_posts),
    enrichment_source: c.enrichment_source || 'ABC AI Business Card',
    last_event_attended: c.last_event_attended || past0?.name || null,
    last_event_date: c.last_event_date || past0?.date || null,
    next_event_attending: c.next_event_attending || up0?.name || null,
    next_event_date: c.next_event_date || up0?.date || null,
    meeting_location: c.meeting_location || c.event_name || c.meeting_event_name || null,
    meeting_date: c.meeting_date || c.meeting_event_date || null,
    mobile_phone: c.mobile_phone || c.phone || null,
    reply_received: c.reply_received ?? c.response_received ?? false,
    reply_date: c.reply_date || c.response_date || null,
    last_contacted_date: c.last_contacted_date || c.last_message_date || null,
    last_activity_channel: c.last_activity_channel || c.last_message_type || null,
  }

  if (enrichmentDone && (!c.lead_status || c.lead_status === 'New')) {
    updates.lead_status = 'Working'
  }

  return updates
}
