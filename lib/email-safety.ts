/**
 * Putting untrusted text into an email. The one place it is done.
 *
 * Visitors write the words in ABC's notification emails: a stranger at a stand
 * types their name, company and role into somebody's card, and those words
 * arrive in the card owner's inbox under ABC's own sender. Inserted raw, a name
 * like `<a href="https://evil.example">Your invoice</a>` becomes a link ABC sent.
 *
 * Three contexts, three rules, and nothing else is allowed to cross them:
 *
 *   HTML text  `escapeHtml`, and `htmlMultiline` for text with line breaks —
 *              escaped first, line breaks turned into <br> after, never the
 *              other way round.
 *   Header     `headerText` for a Subject: one line, no control or line
 *              separator characters, bounded. Not HTML-escaped — a header is
 *              plain text, and "Tom & Jerry" must stay "Tom & Jerry".
 *   Address    `isSingleEmailAddress`: exactly one mailbox, nothing that could
 *              add a recipient or a header.
 *
 * Untrusted text never goes into an attribute. The only links in a template
 * are built here, from the configured app origin and a contact id that must be
 * a UUID.
 *
 * Pure: no provider, no network, so every rule is testable on its own.
 */

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  return String(value)
}

/** Text for an HTML text node or a quoted attribute value. Every other character, accents and scripts included, is left alone. */
export function escapeHtml(value: unknown): string {
  return asText(value).replace(/[&<>"']/g, (character) => HTML_ENTITIES[character])
}

/** Untrusted multi-line text for HTML: normalised line endings, each line escaped, joined with <br>. */
export function htmlMultiline(value: unknown): string {
  return asText(value)
    .replace(/\r\n?/g, '\n')
    .trim()
    .split('\n')
    .map((line) => escapeHtml(line))
    .join('<br>')
}

/*
  ASCII control characters, DEL included. The Unicode line and paragraph
  separators need no entry of their own: `\s` below already matches them.
*/
const CONTROL_CHARACTERS = /[\x00-\x1f\x7f]/g

/**
 * Untrusted text for a header value such as Subject.
 *
 * Control characters become spaces, every run of whitespace — line and
 * paragraph separators included — collapses to one space, and the result is one
 * bounded line. A name carrying "\r\nBcc: …" is just a name with some spaces.
 */
export function headerText(value: unknown, maxLength = 120): string {
  return asText(value)
    .replace(CONTROL_CHARACTERS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

/*
  Exactly one mailbox. Whitespace (newlines included), angle brackets, commas,
  semicolons, quotes and parentheses are refused, because each is how a second
  address or a header gets smuggled in. Non-ASCII characters are allowed:
  international addresses are real addresses.
*/
const SINGLE_ADDRESS = /^[^\s@<>,;"'()]+@[^\s@<>,;"'()]+\.[^\s@<>,;"'()]{2,}$/

export function isSingleEmailAddress(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && SINGLE_ADDRESS.test(value)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The configured app origin, or ABC's own if the configuration is not an http(s) URL. */
export function appOrigin(configured: string | undefined): string {
  try {
    const url = new URL(configured ?? '')
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin
  } catch {
    /* fall through */
  }
  return 'https://abccard.io'
}

/** A link to one contact in ABC. Anything but a UUID gets the contacts list instead of a deep link. */
export function contactLink(configured: string | undefined, contactId: unknown): string {
  const origin = appOrigin(configured)
  return typeof contactId === 'string' && UUID.test(contactId) ? `${origin}/contacts/${contactId}` : `${origin}/contacts`
}
