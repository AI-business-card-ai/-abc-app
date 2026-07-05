import Anthropic from '@anthropic-ai/sdk'
import {
  COMPANY_SIZE_RANGES,
  REVENUE_RANGES,
  extractHeadquartersFromContext,
  extractRevenueFromContext,
  extractSizeFromContext,
  getContactCompanySize,
  getContactHeadquarters,
  getContactRevenue,
  normalizeEmployeeRange,
  normalizeRevenueRange,
  type CrmEstimatedFields,
} from '@/lib/crm-mandatory-fields'
import { hasDisplayValue } from '@/lib/research'
import type { ScannedContact } from '@/lib/types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export type CompanyFieldUpdate = {
  company_size?: string
  company_revenue?: string
  no_of_employees?: number | null
  annual_revenue?: number | null
  billing_city?: string | null
  billing_country?: string | null
  meeting_location?: string | null
  crm_estimated_fields?: CrmEstimatedFields
}

function parseEstimateJson(text: string): {
  company_size?: string
  company_revenue?: string
  headquarters?: string
  billing_city?: string
  billing_country?: string
} | null {
  const clean = text.replace(/```json|```/g, '').trim()
  try {
    return JSON.parse(clean)
  } catch {
    const match = clean.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

function splitHeadquarters(hq: string): { city: string | null; country: string | null; full: string } {
  const parts = hq.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) {
    return { city: parts[0], country: parts[parts.length - 1], full: parts.join(', ') }
  }
  return { city: parts[0] || null, country: null, full: hq }
}

function fallbackEstimates(contact: ScannedContact): CompanyFieldUpdate {
  const industry = (contact.industry || '').toLowerCase()
  const company = (contact.company || '').toLowerCase()
  const isLarge =
    industry.includes('enterprise') ||
    company.includes('group') ||
    company.includes('global') ||
    company.includes('international')

  return {
    company_size: isLarge ? '201-500' : '11-50',
    company_revenue: isLarge ? '$10M-50M' : '$1M-10M',
    billing_city: contact.billing_city || 'Unknown',
    billing_country: contact.billing_country || 'Unknown',
    meeting_location: 'Headquarters location estimated',
    crm_estimated_fields: { company_size: true, revenue: true, headquarters: true },
  }
}

async function estimateWithClaude(contact: ScannedContact): Promise<CompanyFieldUpdate | null> {
  if (!process.env.ANTHROPIC_API_KEY || !contact.company) return null

  const domain = contact.website?.replace(/^https?:\/\//, '').split('/')[0] || 'unknown'
  const context = contact.enriched_context?.slice(0, 1200) || 'No research yet'

  const prompt = `Estimate B2B company CRM fields for export. Use company name, website domain, LinkedIn/industry hints, and research context. If exact numbers are unknown, pick the most likely STANDARD RANGE — never return empty or "unknown".

Company: ${contact.company}
Website: ${domain}
Industry: ${contact.industry || 'N/A'}
Role scanned: ${contact.role || 'N/A'}
LinkedIn headline: ${contact.linkedin_headline || 'N/A'}
Research context:
${context}

Answer these like web research would:
- How many employees does ${contact.company} have?
- What is ${contact.company} annual revenue?
- Where is ${contact.company} headquartered?

SIZE ranges (pick one): ${COMPANY_SIZE_RANGES.join(', ')}
REVENUE ranges (pick one): ${REVENUE_RANGES.join(', ')}

Return ONLY JSON:
{
  "company_size": "51-200",
  "company_revenue": "$10M-50M",
  "headquarters": "City, Country",
  "billing_city": "City",
  "billing_country": "Country"
}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const parsed = parseEstimateJson(text)
    if (!parsed) return null

    const size = normalizeEmployeeRange(parsed.company_size) || '11-50'
    const revenue = normalizeRevenueRange(parsed.company_revenue) || '$1M-10M'
    const hq = hasDisplayValue(parsed.headquarters) ? parsed.headquarters!.trim() : 'Unknown, Unknown'
    const split = splitHeadquarters(hq)

    return {
      company_size: size,
      company_revenue: revenue,
      billing_city: parsed.billing_city || split.city,
      billing_country: parsed.billing_country || split.country,
      meeting_location: split.full,
      crm_estimated_fields: { company_size: true, revenue: true, headquarters: true },
    }
  } catch (error) {
    console.error('estimateWithClaude error:', error)
    return null
  }
}

/** Fill missing company_size, revenue, headquarters — never leaves them empty. */
export async function ensureMandatoryCompanyFields(contact: ScannedContact): Promise<CompanyFieldUpdate> {
  const estimated: CrmEstimatedFields = { ...(contact.crm_estimated_fields || {}) }
  const update: CompanyFieldUpdate = {}

  let size = getContactCompanySize(contact)
  if (!size) {
    size =
      normalizeEmployeeRange(contact.company_size) ||
      extractSizeFromContext(contact.enriched_context) ||
      null
  }
  if (!size) {
    const fromApollo = normalizeEmployeeRange(contact.no_of_employees)
    if (fromApollo) size = fromApollo
  }

  let revenue = getContactRevenue(contact)
  if (!revenue) {
    revenue =
      normalizeRevenueRange(contact.company_revenue) ||
      normalizeRevenueRange(contact.annual_revenue) ||
      extractRevenueFromContext(contact.enriched_context) ||
      null
  }

  let hq = getContactHeadquarters(contact)
  if (!hq) {
    hq = extractHeadquartersFromContext(contact.enriched_context)
  }

  const needsEstimate = !size || !revenue || !hq
  if (needsEstimate) {
    const ai = (await estimateWithClaude(contact)) || fallbackEstimates(contact)
    if (!size) {
      size = ai.company_size || '11-50'
      estimated.company_size = true
      update.company_size = size
    }
    if (!revenue) {
      revenue = ai.company_revenue || '$1M-10M'
      estimated.revenue = true
      update.company_revenue = revenue
    }
    if (!hq) {
      hq = [ai.billing_city, ai.billing_country].filter(hasDisplayValue).join(', ') || ai.meeting_location || 'Unknown, Unknown'
      estimated.headquarters = true
      update.billing_city = ai.billing_city || hq.split(',')[0]?.trim() || 'Unknown'
      update.billing_country = ai.billing_country || hq.split(',').pop()?.trim() || 'Unknown'
      update.meeting_location = hq
    }
  } else {
    update.company_size = size!
    update.company_revenue = revenue!
    update.billing_city = contact.billing_city || hq!.split(',')[0]?.trim()
    update.billing_country = contact.billing_country || hq!.split(',').pop()?.trim()
    if (!contact.meeting_location) update.meeting_location = hq!
  }

  update.crm_estimated_fields = estimated
  return update
}
