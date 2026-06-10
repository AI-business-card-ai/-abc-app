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
  match_score: number | null
  company_summary: string | null
  industry: string | null
  company_size: string | null
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
  communication_style: 'direct' | 'formal' | 'casual'
  outreach_language: string
  goals: string | null
  plan: 'free' | 'pro' | 'team'
  scans_used: number
  scans_limit: number
  research_preferences: string[] | null
  custom_questions: string | null
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
