import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

function basicNormalize(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => {
      if (!word) return word
      if (word.length <= 3 && word === word.toLowerCase()) {
        return word.charAt(0).toUpperCase() + word.slice(1)
      }
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}

/** Normalize free-text event/location for CRM export (fix typos, capitalization). */
export async function normalizeEventText(raw: string): Promise<string> {
  const trimmed = raw.trim()
  if (!trimmed) return trimmed

  if (!process.env.ANTHROPIC_API_KEY) {
    return basicNormalize(trimmed)
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 120,
      messages: [
        {
          role: 'user',
          content: `Normalize this event/location name, fix typos and capitalization, return only the corrected name.

Examples:
- "webb summit lisbon" → "Web Summit, Lisbon"
- "Eurosaroty pari" → "Eurosatory, Paris"
- "ise 2026 amsterdam" → "ISE 2026, Amsterdam"

Input: ${trimmed}`,
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    const cleaned = text.replace(/^["']|["']$/g, '').trim()
    return cleaned || basicNormalize(trimmed)
  } catch (error) {
    console.error('normalizeEventText error:', error)
    return basicNormalize(trimmed)
  }
}
