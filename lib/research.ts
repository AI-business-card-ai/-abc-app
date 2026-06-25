import type { SupabaseClient } from '@supabase/supabase-js'

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

export const RESEARCH_PREFERENCE_OPTIONS: {
  key: ResearchPreferenceKey
  label: string
}[] = [
  { key: 'revenue', label: 'Obrat a velikost firmy' },
  { key: 'location', label: 'Sídlo a pobočky' },
  { key: 'news', label: 'Poslední novinky (6 měsíců)' },
  { key: 'linkedin', label: 'LinkedIn profil osoby' },
  { key: 'reputation', label: 'Reputace a kauzy' },
  { key: 'events', label: 'Nadcházející eventy' },
  { key: 'competitors', label: 'Konkurenti firmy' },
  { key: 'technology', label: 'Technologie které používají' },
  { key: 'decision_maker', label: 'Je to decision maker?' },
  { key: 'pain_points', label: 'Aktuální problémy firmy' },
]

export interface EnrichedSection {
  title: string
  content: string
  isRisk: boolean
  icon: string
  label: string
}

export type ResearchContactInput = {
  name?: string | null
  company?: string | null
  role?: string | null
  industry?: string | null
}

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

const NEGATIVE_HINTS = [
  'lawsuit', 'scandal', 'controvers', 'negative', 'fraud', 'bankruptcy',
  'kauz', 'skandál', 'negativ', 'žalob', 'insolvence', 'investigation',
  'fine', 'violation', 'misconduct',
]

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

export function isNotFoundText(text: string): boolean {
  const lower = text.trim().toLowerCase()
  if (!lower) return true
  return EMPTY_VALUES.has(lower) || lower.startsWith('not found')
}

function detectNegativeContent(content: string): boolean {
  const lower = content.toLowerCase()
  if (isNotFoundText(content)) return false
  return NEGATIVE_HINTS.some((hint) => lower.includes(hint))
}

function filterSectionContent(content: string): string {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !isNotFoundText(line.replace(/^[-•*]\s*/, '')))
    .join('\n')
    .trim()
}

export function getSectionDisplay(title: string): { icon: string; label: string } {
  const upper = title.toUpperCase()

  if (upper.includes('REPUTATION') || upper.includes('RISK')) {
    return { icon: '⚠️', label: 'Risk Assessment' }
  }
  if (upper.includes('NEWS') || upper.includes('RECENT')) {
    return { icon: '📰', label: 'Recent News' }
  }
  if (upper.includes('EVENT')) {
    return { icon: '📅', label: 'Events' }
  }
  if (
    upper.includes('PERSON') ||
    upper.includes('LINKEDIN') ||
    upper.includes('DECISION')
  ) {
    return { icon: '👤', label: 'Person Profile' }
  }
  if (upper.includes('MATCH')) {
    return { icon: '🎯', label: 'Match Analysis' }
  }
  if (
    upper.includes('OUTREACH') ||
    upper.includes('CUSTOM') ||
    upper.includes('INTELLIGENCE')
  ) {
    return { icon: '💡', label: 'Outreach Strategy' }
  }

  return { icon: '📊', label: 'Company Profile' }
}

export function parseEnrichedContext(text: string | null | undefined): EnrichedSection[] {
  if (!text?.trim()) return []

  const seenLabels = new Set<string>()
  const parts = text.split(/^## /m).filter(Boolean)

  const sections = parts
    .map((part) => {
      const newline = part.indexOf('\n')
      const title = (newline === -1 ? part : part.slice(0, newline)).trim()
      const rawContent = (newline === -1 ? '' : part.slice(newline + 1)).trim()
      const content = filterSectionContent(rawContent)
      if (!hasDisplayValue(content)) return null

      const { icon, label } = getSectionDisplay(title)
      const upper = title.toUpperCase()
      const isRisk =
        (upper.includes('REPUTATION') ||
          upper.includes('RISKS') ||
          upper.includes('RISK') ||
          upper.includes('KAUZ')) &&
        detectNegativeContent(content)

      return { title, content, isRisk, icon, label }
    })
    .filter(Boolean) as EnrichedSection[]

  return sections.filter((section) => {
    if (seenLabels.has(section.label)) return false
    seenLabels.add(section.label)
    return true
  })
}

export const URL_REGEX = /(https?:\/\/[^\s]+|linkedin\.com\/[^\s]+)/gi

export function splitContentWithUrls(content: string): { text: string; isUrl: boolean }[] {
  const segments: { text: string; isUrl: boolean }[] = []
  let lastIndex = 0
  const regex = new RegExp(URL_REGEX.source, 'gi')
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: content.slice(lastIndex, match.index), isUrl: false })
    }
    segments.push({ text: match[0], isUrl: true })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < content.length) {
    segments.push({ text: content.slice(lastIndex), isUrl: false })
  }

  return segments.length ? segments : [{ text: content, isUrl: false }]
}

async function perplexityJsonQuery<T>(prompt: string): Promise<T | null> {
  if (!process.env.PERPLEXITY_API_KEY) return null

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    let response: Response
    try {
      response = await fetch('https://api.perplexity.ai/chat/completions', {
        signal: controller.signal,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1200,
        }),
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) return null

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''
    const clean = content.replace(/```json|```/g, '').trim()
    try {
      return JSON.parse(clean) as T
    } catch {
      const match = clean.match(/\{[\s\S]*\}/)
      if (!match) return null
      return JSON.parse(match[0]) as T
    }
  } catch (error) {
    console.error('Perplexity JSON query error:', error)
    return null
  }
}

export async function searchRecentNews(contact: ResearchContactInput) {
  if (!contact.name && !contact.company) return null

  return perplexityJsonQuery<{
    news: { title: string; summary?: string; date?: string; url?: string; source?: string }[]
    found: boolean
  }>(
    `Search for recent news about ${contact.name || 'this person'} from ${contact.company || 'their company'}. Find: recent interviews, quotes, mentions, product launches they were involved in, awards, recent professional activity. Return JSON: { "news": [{ "title": "", "summary": "", "date": "", "url": "", "source": "" }], "found": boolean }. If nothing found return { "news": [], "found": false }. Return ONLY valid JSON.`
  )
}

export async function searchEvents(contact: ResearchContactInput) {
  if (!contact.name && !contact.company) return null

  const industry = contact.industry || 'their industry'

  return perplexityJsonQuery<{
    past_events: { name: string; location?: string; date?: string; role?: string; description?: string }[]
    upcoming_events: { name: string; location?: string; date?: string; role?: string; description?: string }[]
    speaking: { event: string; title?: string; date?: string }[]
    found: boolean
  }>(
    `Find events, conferences, trade shows for ${contact.name || 'this person'} from ${contact.company || 'their company'} in ${industry} industry. Search for: 1) Past events they attended or exhibited at (search: ${contact.company} trade show conference expo 2024 2025), 2) Upcoming events (search: ${contact.company} 2026 conference expo booth), 3) Speaking engagements (search: ${contact.name} speaker keynote presentation). Return JSON: { "past_events": [{ "name": "", "location": "", "date": "", "role": "", "description": "" }], "upcoming_events": [{ "name": "", "location": "", "date": "", "role": "", "description": "" }], "speaking": [{ "event": "", "title": "", "date": "" }], "found": boolean }. If nothing found return empty arrays and found:false. Return ONLY valid JSON.`
  )
}

export async function searchPersonProfile(contact: ResearchContactInput) {
  if (!contact.name && !contact.company) return null

  return perplexityJsonQuery<{
    bio: string
    quotes: { text: string; source?: string; date?: string }[]
    focus_areas: string[]
    found: boolean
  }>(
    `Find professional information about ${contact.name || 'this person'} at ${contact.company || 'their company'} as ${contact.role || 'their role'}. Search for: professional bio, interview quotes, thought leadership content, published articles, professional focus areas. Return JSON: { "bio": "", "quotes": [{ "text": "", "source": "", "date": "" }], "focus_areas": [], "found": boolean }. If nothing found return { "bio": "", "quotes": [], "focus_areas": [], "found": false }. Return ONLY valid JSON.`
  )
}

export function buildConversationStarters(contact: {
  events_upcoming?: { name: string; location?: string }[] | null
  events_past?: { name: string; description?: string }[] | null
  speaking_engagements?: { event: string; title?: string }[] | null
}): string[] {
  const starters: string[] = []

  for (const event of contact.events_upcoming || []) {
    if (!hasDisplayValue(event.name)) continue
    const location = hasDisplayValue(event.location) ? ` in ${event.location}` : ''
    starters.push(`Are you heading to ${event.name}${location}? We'll be there too.`)
  }

  for (const talk of contact.speaking_engagements || []) {
    if (!hasDisplayValue(talk.event)) continue
    const topic = hasDisplayValue(talk.title) ? talk.title : 'your topic'
    starters.push(`Saw your talk at ${talk.event} — great insights on ${topic}.`)
  }

  if (!starters.length) {
    for (const event of (contact.events_past || []).slice(0, 1)) {
      if (hasDisplayValue(event.name)) {
        starters.push(`Did you enjoy ${event.name}? Would love to hear your take.`)
      }
    }
  }

  return starters.slice(0, 4)
}

export async function runIntelligenceResearch(
  contact: ResearchContactInput & { id: string },
  supabase: SupabaseClient
): Promise<void> {
  const [eventsData, personData, newsData] = await Promise.all([
    searchEvents(contact).catch(() => null),
    searchPersonProfile(contact).catch(() => null),
    searchRecentNews(contact).catch(() => null),
  ])

  const updates: Record<string, unknown> = {}

  if (eventsData?.found) {
    if (eventsData.past_events?.length) updates.events_past = eventsData.past_events
    if (eventsData.upcoming_events?.length) updates.events_upcoming = eventsData.upcoming_events
    if (eventsData.speaking?.length) updates.speaking_engagements = eventsData.speaking
  }

  if (personData?.found) {
    if (hasDisplayValue(personData.bio)) updates.person_bio = personData.bio
    if (personData.quotes?.length) updates.person_quotes = personData.quotes
  }

  if (newsData?.found && newsData.news?.length) {
    updates.recent_news = newsData.news
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from('scanned_contacts').update(updates).eq('id', contact.id)
  }
}
