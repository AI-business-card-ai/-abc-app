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
}

export function parseEnrichedContext(text: string | null | undefined): EnrichedSection[] {
  if (!text?.trim()) return []

  const parts = text.split(/^## /m).filter(Boolean)
  return parts.map((part) => {
    const newline = part.indexOf('\n')
    const title = (newline === -1 ? part : part.slice(0, newline)).trim()
    const content = (newline === -1 ? '' : part.slice(newline + 1)).trim()
    const upper = title.toUpperCase()
    const isRisk =
      upper.includes('REPUTATION') ||
      upper.includes('RISKS') ||
      upper.includes('RISK') ||
      upper.includes('KAUZ')
    return { title, content, isRisk }
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
