import { createServiceClient } from '@/lib/supabase/service'

export type ActivityType =
  | 'CARD_SCANNED'
  | 'AI_ENRICHED'
  | 'EMAIL_SENT'
  | 'WHATSAPP_OPENED'
  | 'LINKEDIN_COPIED'
  | 'STAGE_CHANGED'
  | 'VCARD_SAVED'
  | 'NOTE_ADDED'
  | 'EXPORTED_CSV'
  | 'WEBHOOK_SENT'
  | 'MESSAGE_GENERATED'

export type CrmStatus =
  | 'NEW'
  | 'ENRICHED'
  | 'CONTACTED'
  | 'IN_CONVERSATION'
  | 'CLOSED'

const STATUS_TRANSITIONS: Partial<Record<ActivityType, CrmStatus>> = {
  CARD_SCANNED: 'NEW',
  AI_ENRICHED: 'ENRICHED',
  EMAIL_SENT: 'CONTACTED',
  WHATSAPP_OPENED: 'CONTACTED',
  LINKEDIN_COPIED: 'CONTACTED',
}

const CONTACT_ACTIVITIES: ActivityType[] = [
  'EMAIL_SENT',
  'WHATSAPP_OPENED',
  'LINKEDIN_COPIED',
]

const STATUS_ORDER: CrmStatus[] = [
  'NEW',
  'ENRICHED',
  'CONTACTED',
  'IN_CONVERSATION',
  'CLOSED',
]

export async function logActivity({
  contactId,
  userId,
  activityType,
  activityDetail,
  metadata = {},
}: {
  contactId: string
  userId: string
  activityType: ActivityType
  activityDetail?: string
  metadata?: Record<string, unknown>
}) {
  const supabase = createServiceClient()

  await supabase.from('crm_activities').insert({
    contact_id: contactId,
    user_id: userId,
    activity_type: activityType,
    activity_detail: activityDetail ?? null,
    metadata,
  })

  const { data: contact } = await supabase
    .from('scanned_contacts')
    .select('crm_status, contact_count')
    .eq('id', contactId)
    .eq('user_id', userId)
    .single()

  const update: Record<string, unknown> = {
    last_activity_at: new Date().toISOString(),
    last_activity_type: activityType,
  }

  const newStatus = STATUS_TRANSITIONS[activityType]
  if (newStatus && contact) {
    const currentIdx = STATUS_ORDER.indexOf((contact.crm_status as CrmStatus) || 'NEW')
    const newIdx = STATUS_ORDER.indexOf(newStatus)
    if (newIdx > currentIdx) {
      update.crm_status = newStatus
    }
  }

  if (CONTACT_ACTIVITIES.includes(activityType) && contact) {
    update.contact_count = (contact.contact_count || 0) + 1
  }

  await supabase.from('scanned_contacts').update(update).eq('id', contactId).eq('user_id', userId)

  const { data: refreshed } = await supabase
    .from('scanned_contacts')
    .select('*')
    .eq('id', contactId)
    .single()

  if (refreshed) {
    const score = calculateLeadScore(refreshed)
    await supabase
      .from('scanned_contacts')
      .update({ ai_lead_score: score })
      .eq('id', contactId)
  }

  return { success: true }
}

export function calculateLeadScore(contact: {
  email?: string | null
  phone?: string | null
  company?: string | null
  linkedin_url?: string | null
  match_score?: number | null
  contact_count?: number | null
  crm_status?: string | null
}): number {
  let score = 0

  if (contact.email) score += 10
  if (contact.phone) score += 10
  if (contact.company) score += 10
  if (contact.linkedin_url) score += 10

  if (contact.match_score) {
    score += Math.round((contact.match_score / 100) * 30)
  }

  const contactCount = contact.contact_count || 0
  score += Math.min(contactCount * 5, 20)

  const statusBonus: Record<string, number> = {
    NEW: 0,
    ENRICHED: 2,
    CONTACTED: 5,
    IN_CONVERSATION: 8,
    CLOSED: 10,
  }
  score += statusBonus[contact.crm_status || 'NEW'] || 0

  return Math.min(score, 100)
}
