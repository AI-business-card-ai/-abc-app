import { errorKind } from '@/lib/api/errors'
import { getContactDetail, type ContactDetail, type CrmConnections } from '@/lib/contact-detail'
import {
  CRM_CONTACT_COLUMNS,
  UUID_PATTERN,
  lastInteractionOf,
  onePerPerson,
  toCrmPerson,
  toOpportunity,
  type CrmPerson,
  type Interaction,
  type Opportunity,
} from '@/lib/opportunities/model'
import { createServerComponentClient } from '@/lib/supabase-server'

/**
 * What the CRM screens read, and nothing more.
 *
 * Pipeline, People and Next are three views of the same two reads — the
 * owner's opportunities and the owner's contacts — fetched side by side in one
 * wave after the session check, the same cost the old Pipeline paid for its
 * single `select('*')` and a lighter payload.
 */

export type CrmWorkspace = {
  opportunities: Opportunity[]
  people: CrmPerson[]
  /** Opportunities could not be read; the screens say so instead of showing an empty board. */
  opportunitiesFailed: boolean
  peopleFailed: boolean
}

export async function getCrmWorkspace(): Promise<CrmWorkspace | null> {
  const supabase = createServerComponentClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const [opportunityRes, peopleRes] = await Promise.all([
    supabase
      .from('crm_opportunities')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false }),
    supabase
      .from('scanned_contacts')
      .select(CRM_CONTACT_COLUMNS)
      .eq('user_id', user.id)
      .order('scanned_at', { ascending: false }),
  ])

  if (opportunityRes.error) console.error('[crm] opportunities load failed:', errorKind(opportunityRes.error))
  if (peopleRes.error) console.error('[crm] people load failed:', errorKind(peopleRes.error))

  return {
    opportunities: onePerPerson(((opportunityRes.data as Record<string, unknown>[] | null) ?? []).map(toOpportunity)),
    people: ((peopleRes.data as unknown as Record<string, unknown>[] | null) ?? []).map(toCrmPerson),
    opportunitiesFailed: Boolean(opportunityRes.error),
    peopleFailed: Boolean(peopleRes.error),
  }
}

export type RelationshipActivity = {
  id: string
  type: string
  detail: string | null
  at: string
}

export type OpportunityDetailData = {
  opportunity: Opportunity
  contact: ContactDetail
  crm: CrmConnections
  lastFollowUp: { channel: string | null; at: string } | null
  lastInteraction: Interaction | null
  activity: RelationshipActivity[]
}

/** Activity that is part of the relationship — not scans, enrichment or exports. */
const RELATIONSHIP_ACTIVITY = [
  'EMAIL_SENT',
  'LINKEDIN_COPIED',
  'WHATSAPP_OPENED',
  'RESPONSE_RECEIVED',
  'FOLLOWUP_COMPLETED',
  'NEXT_ACTION_DONE',
  'STAGE_CHANGED',
]

/**
 * One opportunity, with the person and their meetings.
 *
 * Two waves after the session check: the opportunity names the contact, and
 * everything else is about that contact. The person half is the contact
 * screen's own loader, so the two screens cannot describe a person
 * differently.
 */
export async function getOpportunityDetail(id: string): Promise<OpportunityDetailData | null> {
  if (!UUID_PATTERN.test(id)) return null

  const supabase = createServerComponentClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: row, error } = await supabase
    .from('crm_opportunities')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) console.error('[crm] opportunity load failed:', errorKind(error))
  if (!row) return null

  const opportunity = toOpportunity(row as Record<string, unknown>)

  const [detail, extraRes, activityRes] = await Promise.all([
    getContactDetail(opportunity.contactId),
    supabase
      .from('scanned_contacts')
      .select('last_message_date, last_message_type, reply_date')
      .eq('id', opportunity.contactId)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('crm_activities')
      .select('id, activity_type, activity_detail, created_at')
      .eq('user_id', user.id)
      .eq('contact_id', opportunity.contactId)
      .in('activity_type', RELATIONSHIP_ACTIVITY)
      .order('created_at', { ascending: false })
      .limit(6),
  ])

  if (!detail) return null

  const extra = (extraRes.data ?? {}) as Record<string, unknown>
  const sentAt = typeof extra.last_message_date === 'string' ? extra.last_message_date : null
  const lastFollowUp = sentAt
    ? { channel: typeof extra.last_message_type === 'string' ? extra.last_message_type : null, at: sentAt }
    : null

  return {
    opportunity,
    contact: detail.contact,
    crm: detail.crm,
    lastFollowUp,
    lastInteraction: lastInteractionOf({
      event: detail.contact.encounters[0]?.event ?? detail.contact.event,
      metAt: detail.contact.encounters[0]?.metAt ?? detail.contact.metAt,
      lastFollowUp,
      replyAt: typeof extra.reply_date === 'string' ? extra.reply_date : null,
    }),
    activity: ((activityRes.data as Record<string, unknown>[] | null) ?? []).map((a) => ({
      id: String(a.id),
      type: String(a.activity_type),
      detail: typeof a.activity_detail === 'string' ? a.activity_detail : null,
      at: String(a.created_at),
    })),
  }
}
