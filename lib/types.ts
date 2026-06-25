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
  crm_status: CrmStatus | null
  ai_lead_score: number | null
  last_activity_at: string | null
  last_activity_type: string | null
  contact_count: number | null
  tags: string[] | null
  whatsapp_number: string | null
  enrichment_status: 'PENDING' | 'ENRICHING' | 'DONE' | 'ERROR' | null
  enrichment_step: string | null
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
  plan: 'free' | 'pro' | 'team'
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
