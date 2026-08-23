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

/** An event name is short. Anything longer than this is not a name. */
const MAX_EVENT_NAME = 120

/**
 * Phrases that mean the model started talking rather than answering.
 *
 * Not an attempt to detect prose in general — the structural checks above do
 * most of the work. These catch the specific shape a deliberating reply takes
 * when it is short enough to survive them.
 */
const DELIBERATION =
  /\b(let me|i should|i'll|i will|actually,|on reflection|reconsider|ambiguous|most likely|intended output|it seems|however,|note that|alternatively|clarif\w*|input:|output:)/i

/**
 * A model's answer, or nothing.
 *
 * This exists because a normalized event name is written straight into columns
 * the contact screen renders and the CRM exports, and a language model asked
 * for a name will occasionally supply a paragraph about the name instead —
 * "Actually, let me reconsider — the input is ambiguous. The most likely
 * intended output is: **ExCeL London**". That reached production, so the
 * response is now something to be checked rather than trusted.
 *
 * Rejection is total: no salvaging the name out of the sentence. The first line
 * of a deliberating reply is the deliberation, so a partial rescue would store
 * something worse than the owner's own typing, which is the fallback and is
 * always available.
 */
export function sanitizeEventName(value: string | null | undefined): string | null {
  let text = (value || '').trim()
  if (!text) return null

  // Wrapping quotes and markdown emphasis are formatting around a good answer,
  // not a bad answer — unwrap them rather than throwing the name away.
  for (let i = 0; i < 3; i++) {
    const before = text
    text = text
      .replace(/^\s*(?:\*\*|__|\*|_|`)(.*?)(?:\*\*|__|\*|_|`)\s*$/s, '$1')
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
      .trim()
    if (text === before) break
  }

  if (!text) return null

  // A name occupies one line. Anything multi-line is a reply, not a name.
  if (/[\r\n]/.test(text)) return null
  if (text.length > MAX_EVENT_NAME) return null

  // Leftover markdown after unwrapping means structure inside the text:
  // emphasis mid-sentence, a heading, a horizontal rule, a code fence. The two
  // arrow forms are how the prompt's own worked examples read, so an arrow in
  // the reply means an example came back instead of an answer.
  if (/\*\*|```|^#{1,6}\s|^[-*_]{3,}$|→|->/m.test(text)) return null

  if (DELIBERATION.test(text)) return null

  // Nothing but punctuation — separators and stray bullets land here.
  if (!/[\p{L}\p{N}]/u.test(text)) return null

  return text
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
      // A name needs a handful of tokens. A ceiling this low also means a reply
      // that starts explaining itself gets cut off mid-sentence and fails the
      // check below, rather than arriving as a plausible-looking paragraph.
      max_tokens: 40,
      system:
        'You correct event and venue names. Reply with the corrected name and nothing else: no explanation, no reasoning, no alternatives, no markdown, no quotes, no preamble. If the input is ambiguous, give your single best guess. Never reply with a sentence.',
      messages: [
        {
          role: 'user',
          content: `Normalize this event/location name, fix typos and capitalization, return only the corrected name.

Examples:
- "webb summit lisbon" -> "Web Summit, Lisbon"
- "Eurosaroty pari" -> "Eurosatory, Paris"
- "ise 2026 amsterdam" -> "ISE 2026, Amsterdam"

Input: ${trimmed}`,
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const cleaned = sanitizeEventName(text)

    if (!cleaned) {
      // The owner's own words, tidied. Never the raw reply: replacing something
      // a person typed with something a model said about it is the failure this
      // whole function is guarding against.
      console.warn('[normalizeEventText] rejected malformed model output; keeping owner input')
      return basicNormalize(trimmed)
    }

    return cleaned
  } catch (error) {
    console.error('normalizeEventText error:', error)
    return basicNormalize(trimmed)
  }
}
