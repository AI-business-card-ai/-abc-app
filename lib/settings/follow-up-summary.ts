/**
 * The one-line version of someone's Smart Follow-up settings, for the hub.
 *
 * Read-only, and deliberately built from the same words the Smart Follow-up
 * screen puts on its chips — a summary that renamed "Medium" to "Concise"
 * would be a second vocabulary for one setting, and the reader would have to
 * work out that the two screens meant the same thing.
 *
 * Returns null when nothing is set. A summary is worth showing when it says
 * something; inventing "Direct · Medium · English" for an untouched profile
 * would state a preference the person never expressed.
 */

export type FollowUpProfileInput = {
  communication_style?: string | null
  message_length?: string | null
  outreach_language?: string | null
}

/** Exactly the chips the Smart Follow-up screen offers, in its own casing. */
const STYLE: Record<string, string> = { direct: 'Direct', formal: 'Formal', casual: 'Casual' }
const LENGTH: Record<string, string> = { short: 'Short', medium: 'Medium', long: 'Long' }

/**
 * The screen itself shows codes, because they are what gets saved. Spelled out
 * here because a summary line has room and "EN" reads like an abbreviation the
 * reader is expected to already know.
 */
const LANGUAGE: Record<string, string> = { EN: 'English', CZ: 'Czech', DE: 'German', SK: 'Slovak' }

export function followUpSummary(profile: FollowUpProfileInput): string | null {
  const style = STYLE[String(profile.communication_style || '').toLowerCase()]
  const length = LENGTH[String(profile.message_length || '').toLowerCase()]
  const rawLanguage = String(profile.outreach_language || '').toUpperCase()
  const language = LANGUAGE[rawLanguage] ?? (rawLanguage || undefined)

  const parts = [style, length, language].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}
