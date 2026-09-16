/*
  Research preferences are still stored on the profile, and the "is this a real
  value" test is still used when drafting messages and filling CRM fields. The
  web research these once configured (Perplexity) was removed with the rest of
  contact enrichment; see git history for the old helpers.
*/

export const DEFAULT_RESEARCH_PREFERENCES = [
  'revenue',
  'location',
  'news',
  'linkedin',
  'reputation',
  'events',
  'competitors',
  'technology',
  'decision_maker',
  'pain_points',
] as const

export type ResearchPreferenceKey = (typeof DEFAULT_RESEARCH_PREFERENCES)[number]

const EMPTY_VALUES = new Set([
  'not found',
  'n/a',
  'na',
  'none',
  'unknown',
  'no data',
  'not available',
  '-',
  '—',
])

export function hasDisplayValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return false
    return !EMPTY_VALUES.has(trimmed.toLowerCase())
  }
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value as object).length > 0
  return true
}
