import type { PipelineStageId } from './pipeline'

export type { PipelineStageId }

export interface ScannedContact {
  id: string
  user_id: string
  name: string | null
  company: string | null
  role: string | null
  email: string | null
  phone: string | null
  website: string | null
  linkedin_url: string | null
  linkedin_headline: string | null
  linkedin_summary: string | null
  linkedin_experience: { title: string; company: string; duration: string }[] | null
  linkedin_skills: string[] | null
  linkedin_posts: { text: string; date: string }[] | null
  linkedin_education: { school: string; degree: string }[] | null
  match_score: number | null
  company_summary: string | null
  industry: string | null
  company_size: string | null
  company_revenue: string | null
  technologies: string[] | null
  photo_url: string | null
  message_linkedin: string | null
  message_email: string | null
  message_whatsapp: string | null
  email_subject: string | null
  match_reason: string | null
  status: 'pending' | 'approved' | 'sent' | 'replied' | 'archived'
  scan_status: 'basic' | 'enriched'
  event_name: string | null
  notes: string | null
  raw_event_text: string | null
  normalized_event_text: string | null
  voice_note_url: string | null
  image_url: string | null
  scanned_at: string
  created_at: string
  enriched_context: string | null
  pipeline_stage: PipelineStageId | null
  pipeline_notes: string | null
  next_action: string | null
  next_action_date: string | null
  deal_value: number | null
  deal_currency: string | null
  expected_close_date: string | null
  lead_source: string | null
  /** Coarse legacy capture source. Kept as-is; the two fields below refine it. */
  source: string | null
  /** Device path the capture came through: camera, gallery, qr_live. */
  capture_origin: string | null
  /** What was read: business_card, badge, document, abc_card, vcard, mecard… */
  capture_kind: string | null
  /**
   * The ABC account of the person who was scanned — never the owner, who is
   * `user_id`. Set only from a server-side lookup of the scanned card's slug.
   */
  linked_abc_user_id: string | null
  /** Which card of theirs was scanned, for when an account can hold several. */
  linked_abc_card_slug: string | null
  last_message_type: string | null
  last_message_date: string | null
  response_received: boolean | null
  response_date: string | null
  messages_sent: number | null
  meeting_event_name: string | null
  meeting_event_date: string | null
  crm_status: CrmStatus | null
  ai_lead_score: number | null
  last_activity_at: string | null
  last_activity_type: string | null
  contact_count: number | null
  tags: string[] | null
  whatsapp_number: string | null
  meeting_topic: string | null
  followup_note: string | null
  preferred_channels: string[] | null
  enrichment_status: 'PENDING' | 'ENRICHING' | 'DONE' | 'ERROR' | null
  enrichment_step: string | null
  events_past: ContactEvent[] | null
  events_upcoming: ContactEvent[] | null
  speaking_engagements: SpeakingEngagement[] | null
  person_bio: string | null
  person_quotes: PersonQuote[] | null
  recent_news: NewsItem[] | null
  first_name: string | null
  last_name: string | null
  mobile_phone: string | null
  billing_city: string | null
  billing_country: string | null
  lead_status: string | null
  sic_code: string | null
  no_of_employees: number | null
  annual_revenue: number | null
  rating: string | null
  opportunity_name: string | null
  opportunity_stage: string | null
  close_probability: number | null
  next_step: string | null
  opportunity_type: string | null
  last_activity_channel: string | null
  last_activity_description: string | null
  last_contacted_date: string | null
  reply_received: boolean | null
  reply_date: string | null
  total_activities: number | null
  ai_summary: string | null
  enrichment_source: string | null
  meeting_location: string | null
  meeting_date: string | null
  company_funding_stage: string | null
  company_technologies: string[] | null
  company_news_summary: string | null
  company_competitors: string[] | null
  linkedin_connections: number | null
  linkedin_followers: number | null
  linkedin_activity_level: string | null
  linkedin_match_status: 'verified' | 'possible_mismatch' | 'rejected' | null
  linkedin_match_confidence: 'high' | 'low' | null
  linkedin_profile_name: string | null
  linkedin_profile_company: string | null
  linkedin_mismatch_reason: string | null
  last_event_attended: string | null
  last_event_date: string | null
  next_event_attending: string | null
  next_event_date: string | null
  icp_fit_score: number | null
  intent_score: number | null
  timing_score: number | null
  accessibility_score: number | null
  red_flags: string | null
  conversation_starters: string[] | null
  crm_estimated_fields: Record<string, boolean> | null
}

/**
 * One meeting with one contact.
 *
 * The canonical meeting history from Phase 4 onward. The matching columns on
 * ScannedContact (meeting_topic, next_action, next_action_date and the event
 * fields) still exist and still work, but they now hold a projection of the
 * most recent encounter for the many readers that have not moved across yet.
 */
export interface ContactEncounter {
  id: string
  contact_id: string
  /** The contact's owner — never the scanned person's linked ABC account. */
  user_id: string
  /** When the meeting happened, as distinct from when the row was written. */
  met_at: string
  event: string | null
  event_normalized: string | null
  discussed: string | null
  next_action: string | null
  follow_up_at: string | null
  capture_origin: string | null
  capture_kind: string | null
  created_at: string
}

export type ContactEvent = {
  name: string
  location?: string
  date?: string
  role?: string
  description?: string
}

export type SpeakingEngagement = {
  event: string
  title?: string
  date?: string
}

export type NewsItem = {
  title: string
  summary?: string
  date?: string
  url?: string
  source?: string
}

export type PersonQuote = {
  text: string
  source?: string
  date?: string
}

export type CrmStatus = 'NEW' | 'ENRICHED' | 'CONTACTED' | 'IN_CONVERSATION' | 'CLOSED'

export interface CrmActivity {
  id: string
  contact_id: string
  user_id: string
  activity_type: string
  activity_detail: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface FollowupSequence {
  id: string
  contact_id: string
  user_id: string
  step: number
  message_type: 'linkedin' | 'email' | 'whatsapp'
  message_body: string
  scheduled_at: string
  sent_at: string | null
  status: 'scheduled' | 'sent' | 'cancelled'
}

export interface ABCProfile {
  id: string
  user_name: string | null
  full_name: string | null
  company: string | null
  role: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  website: string | null
  avatar_url: string | null
  /** Digital card fields */
  card_slug: string | null
  card_published: boolean | null
  card_branding_removed: boolean | null
  card_accent: string | null
  card_theme: 'graphite' | 'light' | null
  card_tagline: string | null
  what_i_do: string | null
  looking_for: string | null
  job_title: string | null
  company_name: string | null
  card_photo_url: string | null
  card_cover_url: string | null
  company_logo_url: string | null
  whatsapp: string | null
  public_email: string | null
  calendar_url: string | null
  location: string | null
  languages: string[] | null
  show_phone: boolean | null
  show_whatsapp: boolean | null
  show_email: boolean | null
  show_website: boolean | null
  show_calendar: boolean | null
  show_location: boolean | null
  instagram_url: string | null
  x_url: string | null
  facebook_url: string | null
  youtube_url: string | null
  tiktok_url: string | null
  github_url: string | null
  threads_url: string | null
  social_enabled: Record<string, boolean> | null
  communication_style: 'direct' | 'formal' | 'casual'
  outreach_language: string
  goals: string | null
  plan: 'free' | 'starter' | 'growth' | 'pro' | 'team' | 'INTERNAL_TEST'
  plan_activated_at: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  scans_used: number
  scans_limit: number
  research_preferences: string[] | null
  custom_questions: string | null
  hubspot_api_key: string | null
  hubspot_access_token: string | null
  hubspot_refresh_token: string | null
  hubspot_portal_id: string | null
  hubspot_connected_at: string | null
  salesforce_access_token: string | null
  salesforce_refresh_token: string | null
  salesforce_instance_url: string | null
  salesforce_connected_at: string | null
  google_connected: boolean
  google_email: string | null
  google_refresh_token: string | null
  google_access_token: string | null
  google_token_expires_at: string | null
  webhook_url: string | null
  product_description: string | null
  icp: string | null
  system_prompt: string | null
  onboarding_completed: boolean | null
  message_goal: string | null
  message_length: string | null
  research_company_size: boolean | null
  research_revenue: boolean | null
  research_location: boolean | null
  research_news: boolean | null
  research_events: boolean | null
  research_linkedin: boolean | null
  research_funding: boolean | null
  research_competitors: boolean | null
  research_tech: boolean | null
  research_hiring: boolean | null
  research_products: boolean | null
  research_pain_points: boolean | null
  research_custom: string | null
}

export interface ScanResult {
  name: string | null
  company: string | null
  role: string | null
  email: string | null
  phone: string | null
  website: string | null
  linkedin_url: string | null
  industry: string | null
  company_size: string | null
  company_summary: string | null
  match_score: number
  match_reason: string
  message_linkedin: string
  message_email: string
  email_subject: string
  message_whatsapp: string
}
