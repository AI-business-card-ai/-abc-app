/**
 * Deterministic identity keys for deciding whether two contacts are one person.
 *
 * Pure functions, no database, no model. Everything here answers exactly one
 * question — are these two strings the same identifier — and answers it the
 * same way every time. Names are deliberately absent: two John Smiths at the
 * same company are two people, and the moment a guess is allowed to merge
 * records the product starts losing information it cannot get back.
 *
 * The bias throughout is toward saying no. A missed duplicate costs the owner
 * one tap on "add meeting"; a false one silently files a stranger's meeting
 * under someone they know.
 */

/** An email-shaped token: no spaces, one @, a dot in the domain. */
const EMAIL_TOKEN = /[^\s,;<>()[\]"']+@[^\s,;<>()[\]"']+\.[^\s,;<>()[\]"']+/g

/**
 * One address, lowercased and trimmed, or null.
 *
 * Case and surrounding whitespace are noise — mail servers ignore them and so
 * does everyone typing an address. Nothing else is touched: Gmail's dots and
 * plus-aliases are left exactly as written, because "these two addresses reach
 * the same inbox" is a fact about one provider's routing, not about identity,
 * and john+sales@ is often deliberately a different contact channel.
 */
export function normalizeEmail(value: string | null | undefined): string | null {
  let text = (value || '').trim()
  if (!text) return null

  text = text.replace(/^mailto:/i, '').split('?')[0].trim()
  text = text.replace(/^[<("']+|[>)"']+$/g, '').trim()
  if (!text) return null

  // Exactly one address, not a list and not a sentence containing one.
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(text)) return null

  return text.toLowerCase()
}

/**
 * Every address in a field, normalized and deduped.
 *
 * The stored column is a single text field with no delimiter convention: the
 * scanner writes one address, but a hand-edited or imported contact may hold
 * two separated by a comma, a slash, a newline or nothing but a space. Rather
 * than guess at a separator, addresses are picked out by their own shape.
 */
export function extractNormalizedEmails(value: string | null | undefined): string[] {
  const text = (value || '').trim()
  if (!text) return []

  const found = text.match(EMAIL_TOKEN) || []
  const out = new Set<string>()
  for (const token of found) {
    const email = normalizeEmail(token)
    if (email) out.add(email)
  }
  return [...out]
}

/**
 * Digits that make a number worth matching on.
 *
 * Higher than the six the scan validator accepts for storage, because storing a
 * short number is harmless and merging two people because of one is not. Four-
 * and five-digit internal extensions are shared by whole companies.
 */
const MIN_LOCAL_DIGITS = 7

/**
 * Where an extension starts, and so where the number itself ends.
 *
 * Deliberately without word boundaries around `x`: an extension is written
 * "x99" as often as "ext. 99", and `\bx\b` never matches the first because a
 * letter and a digit are both word characters. The separator must still be
 * followed by digits that run to the end, so a plain number has nothing here to
 * match.
 */
const EXTENSION = /\s*(?:ext|x|#|,|;)\.?\s*\d+\s*$/i

/**
 * A comparable phone key, or null.
 *
 * Two keys exist and they never compare equal to each other: `+420777123456`
 * for a number that stated its country, and `777123456` for one that did not.
 * That asymmetry is the point. A local number could belong to any country, so
 * treating it as equal to an international one would merge people whose numbers
 * merely end the same way — and inferring the missing country from the owner's
 * locale would guess about the very thing being verified.
 *
 * `00` becomes `+` because that is not a guess: both are the same written
 * convention for "what follows is a country code".
 */
export function normalizePhone(value: string | null | undefined): string | null {
  let text = (value || '').trim()
  if (!text) return null

  text = text.replace(/^tel:/i, '').trim()
  // An extension addresses a desk behind a number; the number is the identity.
  text = text.replace(EXTENSION, '').trim()
  if (!text) return null

  const international = text.startsWith('+') || /^00\d/.test(text)
  const digits = text.replace(/\D/g, '')
  if (!digits) return null

  if (international) {
    const trunk = text.startsWith('+') ? digits : digits.slice(2)
    // A country code plus a subscriber number; anything shorter is a fragment.
    if (trunk.length < MIN_LOCAL_DIGITS + 1) return null
    return `+${trunk}`
  }

  if (digits.length < MIN_LOCAL_DIGITS) return null
  return digits
}

/** Splits a field holding more than one number, without assuming a delimiter. */
function splitPhoneField(text: string): string[] {
  return text
    .split(/[\n\r,;/|]+/)
    // Two international numbers written side by side with only a space between
    // them: every '+' after the first starts a new number.
    .flatMap((part) => part.split(/\s+(?=\+)/))
    .map((part) => part.trim())
    .filter(Boolean)
}

/** Every number in a field, normalized and deduped. */
export function extractNormalizedPhones(value: string | null | undefined): string[] {
  const text = (value || '').trim()
  if (!text) return []

  const out = new Set<string>()
  for (const part of splitPhoneField(text)) {
    const phone = normalizePhone(part)
    if (phone) out.add(phone)
  }
  return [...out]
}

/** Do these two sets of identifiers share one exactly? */
export function sharesValue(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false
  const set = new Set(a)
  return b.some((value) => set.has(value))
}
