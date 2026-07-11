import { splitName, toABCContact } from '@/lib/data-model'
import { ABC_ENRICHMENT_SOURCE, ABC_LEAD_SOURCE } from '@/lib/crm-constants'
import {
  getContactCompanySize,
  getContactEventContextForExport,
  getContactHeadquarters,
  getContactRevenue,
  getContactScanDate,
} from '@/lib/crm-mandatory-fields'
import type { ContactEvent, ScannedContact, SpeakingEngagement } from '@/lib/types'

export type ExportRow = [string, string | number]

function csvEscape(value: string | number): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) ? (parsed as T[]) : []
    } catch {
      return []
    }
  }
  return []
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '')
}

function normalizeContact(contact: ScannedContact) {
  const abc = toABCContact(contact)
  const split = splitName(contact.name)
  return {
    ...contact,
    first_name: contact.first_name || split.first_name,
    last_name: contact.last_name || split.last_name,
    position: contact.role || abc.position,
    ai_lead_score: contact.ai_lead_score ?? contact.match_score ?? '',
  }
}

function pipelineStageName(stage: string | null | undefined): string {
  if (!stage) return 'Prospecting'
  const map: Record<string, string> = {
    new: 'Prospecting',
    'follow-up': 'Qualification',
    meeting: 'Needs Analysis',
    deal: 'Proposal/Price Quote',
    won: 'Closed Won',
    lost: 'Closed Lost',
  }
  return map[stage] || stage
}

function buildAbcFieldValues(contact: ReturnType<typeof normalizeContact>) {
  const posts = parseJsonArray<{ text?: string }>(contact.linkedin_posts)
  const upcoming = parseJsonArray<ContactEvent>(contact.events_upcoming)
  const past = parseJsonArray<ContactEvent>(contact.events_past)
  const speaking = parseJsonArray<SpeakingEngagement>(contact.speaking_engagements)
  const companySize = getContactCompanySize(contact as ScannedContact) || contact.company_size || ''
  const revenue = getContactRevenue(contact as ScannedContact) || contact.company_revenue || ''
  const hq = getContactHeadquarters(contact as ScannedContact) || contact.meeting_location || ''
  const eventContext = getContactEventContextForExport(contact as ScannedContact)

  return {
    ABC_Score__c: contact.ai_lead_score ?? '',
    ABC_MatchReason__c: contact.match_reason || '',
    ABC_CompanySize__c: companySize,
    ABC_FundingStage__c: contact.company_funding_stage || '',
    ABC_Technologies__c: Array.isArray(contact.company_technologies)
      ? contact.company_technologies.join(', ')
      : '',
    ABC_Tags__c: Array.isArray(contact.tags) ? contact.tags.join(', ') : '',
    ABC_EventMet__c: eventContext,
    ABC_Headquarters__c: hq,
    ABC_RevenueRange__c: revenue,
    ABC_MeetingDate__c: getContactScanDate(contact as ScannedContact) || contact.meeting_date || '',
    ABC_PhotoUrl__c: contact.photo_url || '',
    ABC_LinkedInHeadline__c: contact.linkedin_headline || '',
    ABC_LinkedInSummary__c:
      typeof contact.linkedin_summary === 'string'
        ? stripHtml(contact.linkedin_summary)
        : '',
    ABC_LinkedInSkills__c: Array.isArray(contact.linkedin_skills)
      ? contact.linkedin_skills.join(', ')
      : '',
    ABC_LastLinkedInPost__c: posts[0]?.text?.slice(0, 500) || '',
    ABC_LinkedInPostsCount__c: posts.length,
    ABC_NextEvent__c: upcoming[0]
      ? `${upcoming[0].name || ''} — ${upcoming[0].date || ''}`.trim()
      : '',
    ABC_PastEvents__c: past
      .map((e) => e?.name || '')
      .filter(Boolean)
      .join(', '),
    ABC_SpeakingEngagements__c: speaking
      .map((e) => e?.event || (e as { name?: string }).name || '')
      .filter(Boolean)
      .join(', '),
    ABC_LastEventAttended__c: contact.last_event_attended || '',
    ABC_NextEventAttending__c: contact.next_event_attending || '',
    ABC_LastContacted__c: contact.last_contacted_date || '',
    ABC_LastMessageType__c: contact.last_message_type || '',
    ABC_ReplyReceived__c: contact.reply_received ? 'Yes' : 'No',
    ABC_ReplyDate__c: contact.reply_date || '',
    ABC_TotalActivities__c: contact.total_activities || 0,
    ABC_MessagesSent__c: contact.messages_sent || 0,
    ABC_CRMStatus__c: contact.crm_status || '',
    ABC_PipelineStage__c: contact.pipeline_stage || '',
    ABC_EnrichmentSource__c: ABC_ENRICHMENT_SOURCE,
    ABC_ScannedAt__c: contact.created_at || contact.scanned_at || '',
  } as Record<string, string | number>
}

/** Complete Salesforce field mapping (50+ fields). */
export function buildSalesforceExportRows(contact: ScannedContact): ExportRow[] {
  const c = normalizeContact(contact)
  const abc = buildAbcFieldValues(c)

  const rows: ExportRow[] = [
    ['FirstName', c.first_name || ''],
    ['LastName', c.last_name || ''],
    ['Email', c.email || ''],
    ['Phone', c.phone || ''],
    ['MobilePhone', c.mobile_phone || ''],
    ['Title', c.position || ''],
    ['Company', c.company || ''],
    ['Industry', c.industry || ''],
    ['NumberOfEmployees', getContactCompanySize(c as ScannedContact) || c.no_of_employees || ''],
    ['AnnualRevenue', getContactRevenue(c as ScannedContact) || c.annual_revenue || ''],
    ['City', c.billing_city || getContactHeadquarters(c as ScannedContact)?.split(',')[0]?.trim() || ''],
    ['Country', c.billing_country || getContactHeadquarters(c as ScannedContact)?.split(',').pop()?.trim() || ''],
    ['Website', c.website || ''],
    ['LinkedIn__c', c.linkedin_url || ''],
    ['Status', c.lead_status || 'New'],
    ['Rating', c.rating || 'Cold'],
    ['Description', c.ai_summary || ''],
    ['LeadSource', ABC_LEAD_SOURCE],
    ['OpportunityName__c', c.opportunity_name || `${c.first_name || ''} ${c.last_name || ''} - ${c.company || ''}`.trim()],
    ['Amount', c.deal_value || ''],
    ['CloseDate', c.expected_close_date || ''],
    ['Probability', c.close_probability || ''],
    ['StageName', pipelineStageName(c.pipeline_stage)],
    ['NextStep', c.next_step || ''],
    ['OpportunityType', c.opportunity_type || 'New Business'],
  ]

  for (const [key, value] of Object.entries(abc)) {
    rows.push([key, value])
  }

  return rows
}

/** HubSpot export with standard fields + hubspot_-prefixed ABC intelligence fields. */
export function buildHubSpotExportRows(contact: ScannedContact): ExportRow[] {
  const c = normalizeContact(contact)
  const abc = buildAbcFieldValues(c)

  const rows: ExportRow[] = [
    ['firstname', c.first_name || ''],
    ['lastname', c.last_name || ''],
    ['email', c.email || ''],
    ['phone', c.phone || ''],
    ['company', c.company || ''],
    ['jobtitle', c.position || ''],
    ['website', c.website || ''],
    ['industry', c.industry || ''],
    ['city', c.billing_city || getContactHeadquarters(c as ScannedContact)?.split(',')[0]?.trim() || ''],
    ['country', c.billing_country || getContactHeadquarters(c as ScannedContact)?.split(',').pop()?.trim() || ''],
    ['annualrevenue', getContactRevenue(c as ScannedContact) || c.annual_revenue || ''],
    ['numberofemployees', getContactCompanySize(c as ScannedContact) || c.no_of_employees || ''],
    ['hs_lead_status', c.lead_status || 'NEW'],
    ['rating__c', c.rating || 'Cold'],
    ['amount', c.deal_value || ''],
    ['closedate', c.expected_close_date || ''],
    ['hs_next_step', c.next_step || ''],
    ['dealname', c.opportunity_name || `${c.first_name || ''} ${c.last_name || ''} - ${c.company || ''}`.trim()],
  ]

  for (const [key, value] of Object.entries(abc)) {
    rows.push([`hubspot_${key}`, value])
  }

  return rows
}

export function salesforceCsvHeaders(): string[] {
  return buildSalesforceExportRows({} as ScannedContact).map((r) => r[0])
}

export function hubspotCsvHeaders(): string[] {
  return buildHubSpotExportRows({} as ScannedContact).map((r) => r[0])
}

export function rowsToCsv(rows: ExportRow[]): string {
  const headers = rows.map((r) => r[0]).join(',')
  const values = rows.map((r) => csvEscape(r[1])).join(',')
  return `${headers}\n${values}`
}

export function contactsToCsv(contacts: ScannedContact[], format: 'salesforce' | 'hubspot'): string {
  if (!contacts.length) return ''
  const build = format === 'salesforce' ? buildSalesforceExportRows : buildHubSpotExportRows
  const headerRow = build(contacts[0]).map((r) => r[0]).join(',')
  const dataRows = contacts.map((c) =>
    build(c)
      .map((r) => csvEscape(r[1]))
      .join(',')
  )
  return [headerRow, ...dataRows].join('\n')
}

export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const isIOS =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent)

  if (isIOS) {
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return
  }

  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  setTimeout(() => {
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, 100)
}

export function exportToSalesforce(contact: ScannedContact) {
  const csv = rowsToCsv(buildSalesforceExportRows(contact))
  const lastName = contact.last_name || splitName(contact.name).last_name || 'contact'
  downloadCsv(csv, `salesforce_${lastName}_${new Date().toISOString().split('T')[0]}.csv`)
}

export function exportToHubSpot(contact: ScannedContact) {
  const csv = rowsToCsv(buildHubSpotExportRows(contact))
  const lastName = contact.last_name || splitName(contact.name).last_name || 'contact'
  downloadCsv(csv, `hubspot_${lastName}_${new Date().toISOString().split('T')[0]}.csv`)
}

/** Backward-compatible mapper for API / legacy code. */
export function mapToSalesforce(contact: ScannedContact): Record<string, string | number> {
  return Object.fromEntries(buildSalesforceExportRows(contact))
}

export function mapToHubSpot(contact: ScannedContact): Record<string, string | number> {
  return Object.fromEntries(buildHubSpotExportRows(contact))
}
