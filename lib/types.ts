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
  event_name: string | null
  notes: string | null
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
  full_name: string | null
  company: string | null
  role: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  website: string | null
  avatar_url: string | null
  communication_style: 'direct' | 'formal' | 'casual'
  outreach_language: string
  goals: string | null
  plan: 'free' | 'starter' | 'pro' | 'team'
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
  webhook_url: string | null
  user_name: string | null
  user_company: string | null
  user_role: string | null
  user_product: string | null
  user_goal: string | null
  user_icp: string | null
  user_style: string | null
  user_language: string | null
  user_message_length: string | null
  user_prompt: string | null
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
