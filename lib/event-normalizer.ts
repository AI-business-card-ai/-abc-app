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
  /\b(let me|i should|i'll|i will|i think|actually,|on reflection|reconsider|ambiguous|most likely|best guess|assuming|it seems|however,|note that|alternatively|clarif\w*|input:|output:|intended output|you |your |you\.|you,|you\))/i

/**
 * Openings that mean the reply is about the answer rather than being it.
 *
 * Anchored to the start, and only the start. A name may contain any of these
 * words — the failure being caught is a value that *begins* by hedging, which
 * is what a short deliberating reply looks like once it is too brief to trip
 * the length, line-count and markdown checks: "Probably ExCeL London".
 *
 * Deliberately narrow so it cannot eat real names. "The" alone is not enough —
 * The Big 5 Dubai is an event — so only the reporting phrases that follow it
 * are listed. "IFA Berlin" and "I/ITSEC" survive because the first-person
 * forms require a space or an apostrophe after the pronoun.
 */
const HEDGED_OPENING =
  /^(?:i['’ ]|we['’ ]|probably\b|possibly\b|perhaps\b|maybe\b|likely\b|presumably\b|assuming\b|sure[,!]|okay[,!]|(?:this|that|it)\s+(?:is|was|looks|appears|seems)\b|the\s+(?:answer|corrected|correct|normali[sz]ed|most likely|input|output)\b)/i

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
  if (HEDGED_OPENING.test(text)) return null

  /*
    A name is a noun phrase; a clause has a verb in it.

    This is the structural version of the hedge check above, and it is what
    catches the trailing form the anchored one cannot: "ExCeL London is my best
    guess" opens with the answer and only then starts talking. Rather than
    listing the ways a reply can trail off, this asks whether the value is a
    sentence at all.

    Standalone copulas only, so "Crisis Response Expo" and "Wasser Berlin"
    are untouched — the surrounding spaces are the whole point.
  */
  if (/\s(?:is|are|was|were|be|been|means|seems|appears|refers)\s/i.test(text)) return null

  /*
    A scalar name was asked for, so a serialised object or array is the model
    handing back its envelope instead of the value inside it. Worth its own
    check rather than trusting the prose rules: `{"name":"ExCeL London"}` is
    one short line with no markdown and no deliberation in it, so every other
    test here passes it.
  */
  if (/^[{[][\s\S]*[}\]]$/.test(text)) return null
  if (/"\s*:\s*(?:"|\d|\[|\{)/.test(text)) return null

  // Nothing but punctuation — separators and stray bullets land here.
  if (!/[\p{L}\p{N}]/u.test(text)) return null

  return text
}

/**
 * The one shape a reply may take.
 *
 * Asking for a name in prose and then inspecting the prose is the arrangement
 * that failed: the model was free to answer with a paragraph, and the only
 * thing standing between that paragraph and the database was a filter that had
 * to recognise every way of rambling. Forcing this tool moves the question from
 * "does this sentence look like a name" to "which field holds the name" — the
 * answer arrives in a slot, and anything the model wants to say around it has
 * nowhere to go.
 *
 * The filter still runs on what comes out. A slot narrows where prose can
 * appear; it does not stop a model writing a sentence into the slot.
 */
const EVENT_NAME_TOOL = {
  name: 'record_event_name',
  description:
    'Record the corrected event or venue name. Call this exactly once with your single best guess.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description:
          'The corrected name on its own — no explanation, no alternatives, no reasoning, no markdown, no quotes.',
      },
    },
    required: ['name'],
  },
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
      // Room for a small JSON envelope around a short name. The old ceiling of
      // 40 was sized for bare text and would truncate the tool call itself.
      max_tokens: 200,
      system:
        'You correct event and venue names. Answer only by calling record_event_name with the corrected name. If the input is ambiguous, give your single best guess rather than explaining the ambiguity.',
      tools: [EVENT_NAME_TOOL],
      // Not "may use this tool" — must. Without forcing it the model can still
      // choose to reply in prose, which is the thing being designed out.
      tool_choice: { type: 'tool', name: EVENT_NAME_TOOL.name },
      messages: [
        {
          role: 'user',
          content: `Normalize this event/location name, fixing typos and capitalization.

Examples:
- "webb summit lisbon" gives "Web Summit, Lisbon"
- "Eurosaroty pari" gives "Eurosatory, Paris"
- "ise 2026 amsterdam" gives "ISE 2026, Amsterdam"

Input: ${trimmed}`,
        },
      ],
    })

    /*
      Read the slot, and only the slot. Any text block alongside the tool call
      is the model talking; it is not an answer and is not considered. A missing
      or non-string field is treated exactly like a rejected one — the fallback
      below is the same either way.
    */
    const call = response.content.find((block) => block.type === 'tool_use')
    const named = call && typeof call.input === 'object' && call.input !== null
      ? (call.input as { name?: unknown }).name
      : undefined
    const cleaned = sanitizeEventName(typeof named === 'string' ? named : null)

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
