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

const NEGATIVE_HINTS = [
  'lawsuit', 'scandal', 'controvers', 'negative', 'fraud', 'bankruptcy',
  'kauz', 'skandál', 'negativ', 'žalob', 'insolvence',
]

function detectNegativeContent(content: string): boolean {
  const lower = content.toLowerCase()
  return NEGATIVE_HINTS.some((hint) => lower.includes(hint))
}

export function getSectionDisplay(title: string): { icon: string; label: string } {
  const upper = title.toUpperCase()

  if (upper.includes('REPUTATION') || upper.includes('RISK')) {
    return { icon: '⚠️', label: 'Reputace' }
  }
  if (upper.includes('NEWS') || upper.includes('RECENT') || upper.includes('EVENT')) {
    return { icon: '📰', label: 'Novinky' }
  }
  if (
    upper.includes('PERSON') ||
    upper.includes('LINKEDIN') ||
    upper.includes('DECISION')
  ) {
    return { icon: '👤', label: 'Profil osoby' }
  }
  if (upper.includes('MATCH')) {
    return { icon: '🎯', label: 'Match analýza' }
  }
  if (
    upper.includes('OUTREACH') ||
    upper.includes('CUSTOM') ||
    upper.includes('INTELLIGENCE')
  ) {
    return { icon: '💡', label: 'Jak oslovit' }
  }

  return { icon: '📊', label: 'Profil firmy' }
}

export function parseEnrichedContext(text: string | null | undefined): EnrichedSection[] {
  if (!text?.trim()) return []

  const parts = text.split(/^## /m).filter(Boolean)
  return parts.map((part) => {
    const newline = part.indexOf('\n')
    const title = (newline === -1 ? part : part.slice(0, newline)).trim()
    const content = (newline === -1 ? '' : part.slice(newline + 1)).trim()
    const { icon, label } = getSectionDisplay(title)
    const upper = title.toUpperCase()
    const isRisk =
      upper.includes('REPUTATION') ||
      upper.includes('RISKS') ||
      upper.includes('RISK') ||
      upper.includes('KAUZ') ||
      detectNegativeContent(content)
    return { title, content, isRisk, icon, label }
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
