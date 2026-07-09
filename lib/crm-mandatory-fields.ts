import { hasDisplayValue } from '@/lib/research'
import { contactHasEventTag, getContactMeetingContext } from '@/lib/event-tag'
import type { ScannedContact } from '@/lib/types'

export const COMPANY_SIZE_RANGES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'] as const
export const REVENUE_RANGES = ['<$1M', '$1M-10M', '$10M-50M', '$50M-100M', '$100M+'] as const

export type CrmMandatoryField = 'company_size' | 'revenue' | 'headquarters' | 'event_context'
export type CrmEstimatedFields = Partial<Record<'company_size' | 'revenue' | 'headquarters', boolean>>

export function getContactCompanySize(contact: ScannedContact): string | null {
  const raw = contact.company_size || (contact.no_of_employees != null ? String(contact.no_of_employees) : null)
  return hasDisplayValue(raw) ? String(raw).trim() : null
}

export function getContactRevenue(contact: ScannedContact): string | null {
  const raw =
    contact.company_revenue ??
    (contact.annual_revenue != null ? String(contact.annual_revenue) : null)
  return hasDisplayValue(raw) ? String(raw).trim() : null
}

export function getContactHeadquarters(contact: ScannedContact): string | null {
  const cityCountry = [contact.billing_city, contact.billing_country].filter(hasDisplayValue).join(', ')
  if (hasDisplayValue(cityCountry)) return cityCountry
  if (hasDisplayValue(contact.meeting_location)) return contact.meeting_location!.trim()
  return null
}

export function getMissingCrmFields(contact: ScannedContact): CrmMandatoryField[] {
  const missing: CrmMandatoryField[] = []
  if (!getContactCompanySize(contact)) missing.push('company_size')
  if (!getContactRevenue(contact)) missing.push('revenue')
  if (!getContactHeadquarters(contact)) missing.push('headquarters')
  if (!contactHasEventTag(contact)) missing.push('event_context')
  return missing
}

export function contactReadyForCrmExport(contact: ScannedContact): boolean {
  return getMissingCrmFields(contact).length === 0
}

export function isCrmFieldEstimated(
  contact: ScannedContact,
  field: keyof CrmEstimatedFields
): boolean {
  const flags = contact.crm_estimated_fields
  if (!flags || typeof flags !== 'object') return false
  return Boolean((flags as CrmEstimatedFields)[field])
}

export function getCrmFieldLabel(field: CrmMandatoryField): string {
  const labels: Record<CrmMandatoryField, string> = {
    company_size: 'Company size',
    revenue: 'Revenue',
    headquarters: 'HQ',
    event_context: 'Where you met',
  }
  return labels[field]
}

export function getContactEventContextForExport(contact: ScannedContact): string {
  return getContactMeetingContext(contact) || 'In-person meeting (ABC scan)'
}

export function getContactScanDate(contact: ScannedContact): string {
  const raw = contact.scanned_at || contact.created_at
  if (!raw) return ''
  return raw.split('T')[0]
}

export function revenueRangeMidpointMillions(revenue: string | null | undefined): number | null {
  const normalized = revenue ? normalizeRevenueRange(revenue) : null
  if (!normalized) return null
  const map: Record<string, number> = {
    '<$1M': 0.5,
    '$1M-10M': 5,
    '$10M-50M': 30,
    '$50M-100M': 75,
    '$100M+': 150,
  }
  return map[normalized] ?? null
}

export function revenueExceeds5M(revenue: string | null | undefined): boolean {
  const mid = revenueRangeMidpointMillions(revenue)
  return mid != null && mid > 5
}

export function sizeRangeIndex(size: string | null | undefined): number {
  const normalized = size ? normalizeEmployeeRange(size) : null
  if (!normalized) return -1
  return COMPANY_SIZE_RANGES.indexOf(normalized as (typeof COMPANY_SIZE_RANGES)[number])
}

/** Minimum plausible employee range for a given revenue band. */
export function minimumSizeForRevenue(revenue: string | null | undefined): string {
  const normalized = revenue ? normalizeRevenueRange(revenue) : null
  switch (normalized) {
    case '<$1M':
      return '1-10'
    case '$1M-10M':
      return '11-50'
    case '$10M-50M':
      return '51-200'
    case '$50M-100M':
      return '201-500'
    case '$100M+':
      return '501-1000'
    default:
      return '11-50'
  }
}

export function reconcileSizeWithRevenue(size: string, revenue: string): string {
  const normalizedSize = normalizeEmployeeRange(size) || size
  const normalizedRevenue = normalizeRevenueRange(revenue) || revenue

  if (!revenueExceeds5M(normalizedRevenue)) {
    return normalizedSize
  }

  const minSize = minimumSizeForRevenue(normalizedRevenue)
  const sizeIdx = sizeRangeIndex(normalizedSize)
  const minIdx = sizeRangeIndex(minSize)

  if (normalizedSize === '1-10' || normalizedSize === '11-50') {
    return minSize
  }

  if (sizeIdx >= 0 && minIdx >= 0 && sizeIdx < minIdx) {
    return minSize
  }

  return normalizedSize
}

export function normalizeEmployeeRange(value: string | number | null | undefined): string | null {
  if (!hasDisplayValue(value)) return null
  const raw = String(value).trim()
  for (const range of COMPANY_SIZE_RANGES) {
    if (raw.includes(range)) return range
  }
  const lower = raw.toLowerCase()
  if (lower.includes('startup') || lower.includes('micro')) return '1-10'
  if (lower.includes('sme') || lower.includes('small business')) return '11-50'
  if (lower.includes('mid-market') || lower.includes('medium')) return '51-200'
  if (lower.includes('enterprise') || lower.includes('large')) return '1000+'

  const num = parseInt(raw.replace(/[^\d]/g, ''), 10)
  if (Number.isNaN(num)) return null
  if (num <= 10) return '1-10'
  if (num <= 50) return '11-50'
  if (num <= 200) return '51-200'
  if (num <= 500) return '201-500'
  if (num <= 1000) return '501-1000'
  return '1000+'
}

export function normalizeRevenueRange(value: string | number | null | undefined): string | null {
  if (!hasDisplayValue(value)) return null
  const raw = String(value).trim()
  for (const range of REVENUE_RANGES) {
    if (raw.includes(range.replace('<', '')) || raw === range) return range
  }

  const lower = raw.toLowerCase()
  if (lower.includes('100m') || lower.includes('100 m')) return '$100M+'
  if (lower.includes('50m') || lower.includes('50 m')) return '$50M-100M'
  if (lower.includes('10m') || lower.includes('10 m')) return '$10M-50M'
  if (lower.includes('1m') || lower.includes('1 m')) return '$1M-10M'

  const num = parseFloat(raw.replace(/[^\d.]/g, ''))
  if (Number.isNaN(num)) return null
  if (num < 1_000_000) return '<$1M'
  if (num < 10_000_000) return '$1M-10M'
  if (num < 50_000_000) return '$10M-50M'
  if (num < 100_000_000) return '$50M-100M'
  return '$100M+'
}

export function extractHeadquartersFromContext(text: string | null | undefined): string | null {
  if (!text) return null
  const match = text.match(/##\s*LOCATION[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i)
  if (!match) return null
  const line = match[1]
    .split('\n')
    .map((l) => l.replace(/^[-•*]\s*/, '').trim())
    .find((l) => hasDisplayValue(l) && !l.startsWith('##'))
  return line || null
}

export function extractSizeFromContext(text: string | null | undefined): string | null {
  if (!text) return null
  const match = text.match(/##\s*(COMPANY\s*SIZE|EMPLOYEES|SIZE)[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i)
  if (!match) return null
  const line = match[2].split('\n').map((l) => l.trim()).find(Boolean)
  return line ? normalizeEmployeeRange(line) : null
}

export function extractRevenueFromContext(text: string | null | undefined): string | null {
  if (!text) return null
  const match = text.match(/##\s*(REVENUE|OBRA|TUR)[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i)
  if (!match) return null
  const line = match[2].split('\n').map((l) => l.trim()).find(Boolean)
  return line ? normalizeRevenueRange(line) : null
}
