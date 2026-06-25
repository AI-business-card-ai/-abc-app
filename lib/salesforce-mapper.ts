import type { ABCContact } from './data-model'
import { scoreToRating, toABCContact } from './data-model'
import type { ScannedContact } from './types'

export type SalesforceLead = {
  FirstName: string
  LastName: string
  Email: string
  Phone: string
  MobilePhone: string
  Title: string
  Company: string
  Website: string
  Industry: string
  NumberOfEmployees: number
  AnnualRevenue: number
  LeadSource: string
  Status: string
  Rating: string
  Description: string
  LinkedIn_URL__c: string
  AI_Score__c: number
  Where_Met__c: string
  Next_Event__c: string
  Tags__c: string
  Opportunity_Stage__c: string
  Close_Probability__c: number
  Deal_Amount__c: number
  Next_Step__c: string
}

export type HubSpotContact = {
  firstname: string
  lastname: string
  email: string
  phone: string
  company: string
  jobtitle: string
  website: string
  industry: string
  numberofemployees: number
  annualrevenue: number
  hs_lead_status: string
  lifecyclestage: string
  notes_last_updated: string
  linkedin_bio: string
}

export function mapToSalesforce(input: ScannedContact | ABCContact): SalesforceLead {
  const contact = 'full_name' in input ? input : toABCContact(input)

  return {
    FirstName: contact.first_name,
    LastName: contact.last_name || contact.full_name,
    Email: contact.email,
    Phone: contact.phone,
    MobilePhone: contact.mobile_phone || contact.phone,
    Title: contact.position,
    Company: contact.company,
    Website: contact.website,
    Industry: contact.industry,
    NumberOfEmployees: contact.no_of_employees,
    AnnualRevenue: contact.annual_revenue,
    LeadSource: contact.lead_source || 'ABC AI Business Card',
    Status: contact.lead_status || 'New',
    Rating: contact.rating || scoreToRating(contact.match_score),
    Description: contact.ai_summary,
    LinkedIn_URL__c: contact.linkedin_url,
    AI_Score__c: contact.match_score,
    Where_Met__c: contact.meeting_location,
    Next_Event__c: contact.next_event_attending,
    Tags__c: contact.tags?.join(', ') || '',
    Opportunity_Stage__c: contact.opportunity_stage,
    Close_Probability__c: contact.close_probability,
    Deal_Amount__c: contact.deal_value,
    Next_Step__c: contact.next_step,
  }
}

export function mapToHubSpot(input: ScannedContact | ABCContact): HubSpotContact {
  const contact = 'full_name' in input ? input : toABCContact(input)

  return {
    firstname: contact.first_name,
    lastname: contact.last_name,
    email: contact.email,
    phone: contact.phone,
    company: contact.company,
    jobtitle: contact.position,
    website: contact.website,
    industry: contact.industry,
    numberofemployees: contact.no_of_employees,
    annualrevenue: contact.annual_revenue,
    hs_lead_status: (contact.lead_status || 'NEW').toUpperCase(),
    lifecyclestage: 'lead',
    notes_last_updated: contact.ai_summary,
    linkedin_bio: contact.linkedin_headline,
  }
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
  const c = 'full_name' in input ? input : toABCContact(input)
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
  return [
    'FirstName',
    'LastName',
    'Email',
    'Phone',
    'MobilePhone',
    'Title',
    'Company',
    'Website',
    'Industry',
    'NumberOfEmployees',
    'AnnualRevenue',
    'LeadSource',
    'Status',
    'Rating',
    'Description',
    'LinkedIn_URL__c',
    'AI_Score__c',
    'Where_Met__c',
    'Next_Event__c',
    'Tags__c',
    'Opportunity_Stage__c',
    'Close_Probability__c',
    'Deal_Amount__c',
    'Next_Step__c',
  ]
}

export function hubspotCsvHeaders(): string[] {
  return [
    'firstname',
    'lastname',
    'email',
    'phone',
    'company',
    'jobtitle',
    'website',
    'industry',
    'numberofemployees',
    'annualrevenue',
    'hs_lead_status',
    'lifecyclestage',
    'notes_last_updated',
    'linkedin_bio',
  ]
}
