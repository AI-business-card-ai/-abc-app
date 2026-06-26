import type { ABCContact } from './data-model'
import { toABCContact } from './data-model'
import {
  buildHubSpotExportRows,
  buildSalesforceExportRows,
  hubspotCsvHeaders as hubspotCsvHeadersFromExport,
  mapToHubSpot as mapToHubSpotExport,
  mapToSalesforce as mapToSalesforceExport,
  salesforceCsvHeaders as salesforceCsvHeadersFromExport,
} from './crm-export'
import type { ScannedContact } from './types'

export type SalesforceLead = Record<string, string | number>
export type HubSpotContact = Record<string, string | number>

export {
  exportToHubSpot,
  exportToSalesforce,
  contactsToCsv,
  buildHubSpotExportRows,
  buildSalesforceExportRows,
} from './crm-export'

export function mapToSalesforce(input: ScannedContact | ABCContact): SalesforceLead {
  const contact: ScannedContact =
    'user_id' in input
      ? (input as ScannedContact)
      : ({
          ...(input as ABCContact),
          name: (input as ABCContact).full_name,
          role: (input as ABCContact).position,
        } as unknown as ScannedContact)
  return mapToSalesforceExport(contact)
}

export function mapToHubSpot(input: ScannedContact | ABCContact): HubSpotContact {
  const contact: ScannedContact =
    'user_id' in input
      ? (input as ScannedContact)
      : ({
          ...(input as ABCContact),
          name: (input as ABCContact).full_name,
          role: (input as ABCContact).position,
        } as unknown as ScannedContact)
  return mapToHubSpotExport(contact)
}

export const UNIVERSAL_CSV_HEADERS = [
  'id',
  'first_name',
  'last_name',
  'full_name',
  'email',
  'phone',
  'mobile_phone',
  'company',
  'position',
  'website',
  'industry',
  'lead_status',
  'rating',
  'pipeline_stage',
  'crm_status',
  'opportunity_name',
  'opportunity_stage',
  'deal_value',
  'deal_currency',
  'expected_close_date',
  'close_probability',
  'next_step',
  'match_score',
  'match_reason',
  'ai_summary',
  'tags',
  'lead_source',
  'linkedin_url',
  'linkedin_headline',
  'linkedin_activity_level',
  'last_event_attended',
  'next_event_attending',
  'meeting_location',
  'meeting_date',
  'messages_sent',
  'last_activity_channel',
  'last_contacted_date',
  'reply_received',
  'enrichment_status',
  'scanned_at',
] as const

export function mapToUniversalRow(input: ScannedContact | ABCContact): Record<string, string | number> {
  const c = 'full_name' in input && !('user_id' in input) ? input : toABCContact(input as ScannedContact)
  return {
    id: c.id,
    first_name: c.first_name,
    last_name: c.last_name,
    full_name: c.full_name,
    email: c.email,
    phone: c.phone,
    mobile_phone: c.mobile_phone,
    company: c.company,
    position: c.position,
    website: c.website,
    industry: c.industry,
    lead_status: c.lead_status,
    rating: c.rating,
    pipeline_stage: c.pipeline_stage,
    crm_status: c.crm_status,
    opportunity_name: c.opportunity_name,
    opportunity_stage: c.opportunity_stage,
    deal_value: c.deal_value,
    deal_currency: c.deal_currency,
    expected_close_date: c.expected_close_date,
    close_probability: c.close_probability,
    next_step: c.next_step,
    match_score: c.match_score,
    match_reason: c.match_reason,
    ai_summary: c.ai_summary,
    tags: c.tags.join('; '),
    lead_source: c.lead_source,
    linkedin_url: c.linkedin_url,
    linkedin_headline: c.linkedin_headline,
    linkedin_activity_level: c.linkedin_activity_level,
    last_event_attended: c.last_event_attended,
    next_event_attending: c.next_event_attending,
    meeting_location: c.meeting_location,
    meeting_date: c.meeting_date,
    messages_sent: c.messages_sent,
    last_activity_channel: c.last_activity_channel,
    last_contacted_date: c.last_contacted_date,
    reply_received: c.reply_received ? 1 : 0,
    enrichment_status: c.enrichment_status,
    scanned_at: c.scanned_at,
  }
}

export function salesforceCsvHeaders(): string[] {
  return salesforceCsvHeadersFromExport()
}

export function hubspotCsvHeaders(): string[] {
  return hubspotCsvHeadersFromExport()
}
