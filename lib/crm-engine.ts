import { createServiceClient } from '@/lib/supabase/service'
import { calculateLeadScore, type ActivityType } from '@/lib/crm'

export type CRMStatus = 'NEW' | 'ENRICHED' | 'CONTACTED' | 'IN_CONVERSATION' | 'CLOSED'
export type PipelineStage = 'new' | 'follow-up' | 'meeting' | 'deal' | 'won' | 'lost'
export type LeadStatus = 'New' | 'Working' | 'Nurturing' | 'Qualified' | 'Unqualified' | 'Converted'
export type Rating = 'Hot' | 'Warm' | 'Cold'
export type OpportunityStage =
  | 'Prospecting'
  | 'Qualification'
  | 'Needs Analysis'
  | 'Value Proposition'
  | 'Proposal/Price Quote'
  | 'Negotiation/Review'
  | 'Closed Won'
  | 'Closed Lost'

export type MessageChannel = 'LinkedIn' | 'Email' | 'WhatsApp' | 'Gmail'

const CRM_STATUS_ORDER: CRMStatus[] = ['NEW', 'ENRICHED', 'CONTACTED', 'IN_CONVERSATION', 'CLOSED']
const PIPELINE_ORDER: PipelineStage[] = ['new', 'follow-up', 'meeting', 'deal', 'won']

function normalizeCrmStatus(value: string | null | undefined): CRMStatus {
  if (value && CRM_STATUS_ORDER.includes(value as CRMStatus)) {
    return value as CRMStatus
  }
  return 'NEW'
}

export function canAdvanceStatus(current: string | null | undefined, next: CRMStatus): boolean {
  const cur = normalizeCrmStatus(current)
  return CRM_STATUS_ORDER.indexOf(next) > CRM_STATUS_ORDER.indexOf(cur)
}

export function canAdvancePipeline(current: string | null | undefined, next: PipelineStage): boolean {
  const cur = (current || 'new') as PipelineStage
  const curIdx = PIPELINE_ORDER.indexOf(cur)
  const nextIdx = PIPELINE_ORDER.indexOf(next)
  if (curIdx === -1 || nextIdx === -1) return true
  return nextIdx >= curIdx
}

async function refreshLeadScore(contactId: string, userId: string) {
  const supabase = createServiceClient()
  const { data: contact } = await supabase
    .from('scanned_contacts')
    .select('*')
    .eq('id', contactId)
    .eq('user_id', userId)
    .single()

  if (!contact) return

  if (contact.icp_fit_score != null && contact.ai_lead_score != null) {
    return
  }

  const score = calculateLeadScore(contact)
  await supabase
    .from('scanned_contacts')
    .update({ ai_lead_score: score })
    .eq('id', contactId)
    .eq('user_id', userId)
}

async function logActivity(
  contactId: string,
  userId: string,
  type: ActivityType,
  detail: string,
  metadata: Record<string, unknown> = {}
) {
  const supabase = createServiceClient()

  const { data: contact } = await supabase
    .from('scanned_contacts')
    .select('total_activities')
    .eq('id', contactId)
    .eq('user_id', userId)
    .single()

  await supabase.from('crm_activities').insert({
    contact_id: contactId,
    user_id: userId,
    activity_type: type,
    activity_detail: detail,
    metadata,
    created_at: new Date().toISOString(),
  })

  await supabase
    .from('scanned_contacts')
    .update({
      last_activity_at: new Date().toISOString(),
      last_activity_type: type,
      total_activities: (contact?.total_activities || 0) + 1,
    })
    .eq('id', contactId)
    .eq('user_id', userId)
}

async function scheduleFollowUpReminder(contactId: string, userId: string, daysFromNow: number) {
  const supabase = createServiceClient()
  const reminderDate = new Date()
  reminderDate.setDate(reminderDate.getDate() + daysFromNow)

  await supabase
    .from('scanned_contacts')
    .update({
      next_action: 'Send follow-up message',
      next_action_date: reminderDate.toISOString(),
    })
    .eq('id', contactId)
    .eq('user_id', userId)
}

async function cancelReminder(contactId: string, userId: string) {
  const supabase = createServiceClient()
  await supabase
    .from('scanned_contacts')
    .update({
      next_action: null,
      next_action_date: null,
    })
    .eq('id', contactId)
    .eq('user_id', userId)
}

async function suggestNextAction(contactId: string, userId: string, suggestion: string) {
  const supabase = createServiceClient()
  const actionDate = new Date()
  actionDate.setDate(actionDate.getDate() + 1)

  await supabase
    .from('scanned_contacts')
    .update({
      next_step: suggestion,
      next_action: suggestion,
      next_action_date: actionDate.toISOString(),
    })
    .eq('id', contactId)
    .eq('user_id', userId)
}

export async function onCardScanned(contactId: string, userId: string) {
  const supabase = createServiceClient()
  const now = new Date().toISOString()

  await supabase
    .from('scanned_contacts')
    .update({
      crm_status: 'NEW',
      pipeline_stage: 'new',
      lead_status: 'New',
      rating: 'Cold',
      opportunity_stage: 'Prospecting',
      close_probability: 5,
      lead_source: 'ABC AI Business Card',
      enrichment_status: 'PENDING',
      scanned_at: now,
      last_activity_at: now,
    })
    .eq('id', contactId)
    .eq('user_id', userId)

  await logActivity(contactId, userId, 'CARD_SCANNED', 'Business card scanned and saved')
  await refreshLeadScore(contactId, userId)
}

export async function onEnrichmentCompleted(contactId: string, userId: string, matchScore: number) {
  const supabase = createServiceClient()

  const rating: Rating = matchScore >= 70 ? 'Hot' : matchScore >= 40 ? 'Warm' : 'Cold'
  const probability = matchScore >= 70 ? 30 : matchScore >= 40 ? 20 : 10

  const { data: contact } = await supabase
    .from('scanned_contacts')
    .select('name, company, role, crm_status')
    .eq('id', contactId)
    .eq('user_id', userId)
    .single()

  const updates: Record<string, unknown> = {
    lead_status: 'Working',
    rating,
    close_probability: probability,
    opportunity_name: `${contact?.company || 'Unknown'} - ${contact?.role || 'Contact'}`,
    opportunity_stage: 'Qualification',
    enrichment_status: 'DONE',
    scan_status: 'enriched',
    ai_lead_score: matchScore,
    match_score: matchScore,
  }

  if (canAdvanceStatus(contact?.crm_status, 'ENRICHED')) {
    updates.crm_status = 'ENRICHED'
  }

  await supabase.from('scanned_contacts').update(updates).eq('id', contactId).eq('user_id', userId)

  await logActivity(
    contactId,
    userId,
    'AI_ENRICHED',
    `AI enrichment completed. Score: ${matchScore}. Rating: ${rating}`
  )
  await refreshLeadScore(contactId, userId)
}

export async function onMessageSent(
  contactId: string,
  userId: string,
  channel: MessageChannel,
  messageText: string,
  metadata: Record<string, unknown> = {}
) {
  const supabase = createServiceClient()

  const { data: contact } = await supabase
    .from('scanned_contacts')
    .select('crm_status, messages_sent, close_probability, pipeline_stage, total_activities')
    .eq('id', contactId)
    .eq('user_id', userId)
    .single()

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = {
    status: 'sent',
    last_message_type: channel,
    last_message_date: now,
    last_contacted_date: now,
    last_activity_at: now,
    last_activity_type: `${channel.toUpperCase()}_SENT`,
    last_activity_channel: channel,
    messages_sent: (contact?.messages_sent || 0) + 1,
  }

  if (canAdvanceStatus(contact?.crm_status, 'CONTACTED')) {
    updates.crm_status = 'CONTACTED'
    updates.lead_status = 'Nurturing'
    updates.pipeline_stage = canAdvancePipeline(contact?.pipeline_stage, 'follow-up') ? 'follow-up' : contact?.pipeline_stage
    updates.opportunity_stage = 'Needs Analysis'
    updates.close_probability = Math.min((contact?.close_probability || 10) + 10, 50)
  }

  await supabase.from('scanned_contacts').update(updates).eq('id', contactId).eq('user_id', userId)

  await scheduleFollowUpReminder(contactId, userId, 3)

  const activityType: ActivityType =
    channel === 'LinkedIn'
      ? 'LINKEDIN_COPIED'
      : channel === 'Email' || channel === 'Gmail'
        ? 'EMAIL_SENT'
        : 'WHATSAPP_OPENED'

  const preview = messageText.trim().slice(0, 100)
  await logActivity(
    contactId,
    userId,
    activityType,
    `${channel} message sent${preview ? `: "${preview}${messageText.length > 100 ? '...' : ''}"` : ''}`,
    metadata
  )
  await refreshLeadScore(contactId, userId)
}

export async function onReplyReceived(contactId: string, userId: string) {
  const supabase = createServiceClient()

  const { data: contact } = await supabase
    .from('scanned_contacts')
    .select('crm_status, close_probability, pipeline_stage')
    .eq('id', contactId)
    .eq('user_id', userId)
    .single()

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = {
    crm_status: 'IN_CONVERSATION',
    lead_status: 'Qualified',
    pipeline_stage: canAdvancePipeline(contact?.pipeline_stage, 'meeting') ? 'meeting' : contact?.pipeline_stage,
    opportunity_stage: 'Value Proposition',
    response_received: true,
    reply_received: true,
    response_date: now,
    reply_date: now,
    close_probability: Math.min((contact?.close_probability || 20) + 25, 70),
    last_activity_at: now,
    rating: 'Hot',
    next_step: 'Schedule a meeting — contact responded positively',
    next_action: 'Schedule a meeting — contact responded positively',
  }

  await supabase.from('scanned_contacts').update(updates).eq('id', contactId).eq('user_id', userId)

  await logActivity(contactId, userId, 'RESPONSE_RECEIVED', 'Reply received — contact is engaged')
  await cancelReminder(contactId, userId)
  await suggestNextAction(contactId, userId, 'Schedule a meeting — contact responded positively')
  await refreshLeadScore(contactId, userId)
}

export async function onMeetingHeld(contactId: string, userId: string, notes: string) {
  const supabase = createServiceClient()

  await supabase
    .from('scanned_contacts')
    .update({
      pipeline_stage: 'deal',
      opportunity_stage: 'Proposal/Price Quote',
      close_probability: 60,
      last_activity_at: new Date().toISOString(),
      pipeline_notes: notes,
      next_action: 'Send proposal — meeting completed',
      next_step: 'Send proposal — meeting completed',
    })
    .eq('id', contactId)
    .eq('user_id', userId)

  await logActivity(contactId, userId, 'STAGE_CHANGED', `Meeting held. Notes: ${notes}`)
  await suggestNextAction(contactId, userId, 'Send proposal — meeting completed')
  await refreshLeadScore(contactId, userId)
}

export async function onDealWon(contactId: string, userId: string, dealValue: number) {
  const supabase = createServiceClient()

  await supabase
    .from('scanned_contacts')
    .update({
      crm_status: 'CLOSED',
      pipeline_stage: 'won',
      lead_status: 'Converted',
      opportunity_stage: 'Closed Won',
      close_probability: 100,
      deal_value: dealValue,
      last_activity_at: new Date().toISOString(),
      next_action: null,
      next_action_date: null,
      expected_close_date: new Date().toISOString().split('T')[0],
    })
    .eq('id', contactId)
    .eq('user_id', userId)

  await logActivity(contactId, userId, 'DEAL_WON', `Deal won! Value: $${dealValue}`)
  await refreshLeadScore(contactId, userId)
}

export async function onDealLost(contactId: string, userId: string, reason: string) {
  const supabase = createServiceClient()

  await supabase
    .from('scanned_contacts')
    .update({
      pipeline_stage: 'lost',
      lead_status: 'Unqualified',
      opportunity_stage: 'Closed Lost',
      close_probability: 0,
      last_activity_at: new Date().toISOString(),
      pipeline_notes: `Lost reason: ${reason}`,
      next_action: null,
      next_action_date: null,
    })
    .eq('id', contactId)
    .eq('user_id', userId)

  await logActivity(contactId, userId, 'STAGE_CHANGED', `Deal lost. Reason: ${reason}`)
  await refreshLeadScore(contactId, userId)
}

export async function onVCardSaved(contactId: string, userId: string) {
  await logActivity(contactId, userId, 'VCARD_SAVED', 'Contact saved to phone')
  await refreshLeadScore(contactId, userId)
}

export async function onExported(contactId: string, userId: string, destination: string) {
  await logActivity(contactId, userId, 'EXPORTED_CSV', `Exported to ${destination}`)
}

export async function onPipelineStageChange(
  contactId: string,
  userId: string,
  from: PipelineStage | null | undefined,
  to: PipelineStage,
  context?: { notes?: string; dealValue?: number; reason?: string; messageText?: string; channel?: MessageChannel }
) {
  const prev = (from || 'new') as PipelineStage

  if (to === prev) return

  if (to === 'follow-up' && (prev === 'new' || !prev)) {
    await onMessageSent(
      contactId,
      userId,
      context?.channel || 'LinkedIn',
      context?.messageText || 'Pipeline moved to follow-up'
    )
    return
  }

  if (to === 'meeting' && (prev === 'follow-up' || prev === 'new')) {
    await onReplyReceived(contactId, userId)
    return
  }

  if (to === 'deal') {
    await onMeetingHeld(contactId, userId, context?.notes || 'Meeting completed')
    return
  }

  if (to === 'won') {
    await onDealWon(contactId, userId, context?.dealValue || 0)
    return
  }

  if (to === 'lost') {
    await onDealLost(contactId, userId, context?.reason || 'Not specified')
    return
  }

  const supabase = createServiceClient()
  await supabase
    .from('scanned_contacts')
    .update({ pipeline_stage: to, last_activity_at: new Date().toISOString() })
    .eq('id', contactId)
    .eq('user_id', userId)

  await logActivity(contactId, userId, 'STAGE_CHANGED', `Pipeline stage: ${prev} → ${to}`)
}
