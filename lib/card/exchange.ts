import { normalizeEmail } from '@/lib/contacts/identity'

/**
 * Reverse Exchange: the receiver's half of a public card.
 *
 * Someone opens a card at a stand, taps "Send my details", and hands back who
 * they are. That is the whole transaction — an identity, moving one way. What
 * happened at the meeting is the card owner's to record afterwards, through the
 * meeting context they already have, and asking a stranger to describe the
 * meeting produced prose that had nowhere truthful to live.
 *
 * Pure. No database, no React, no network — so what this file claims about
 * validation can be tested without any of them.
 */

/** Written by the server, never accepted from a request. */
export const EXCHANGE_SOURCE = 'card_exchange'

/**
 * Provenance for a meeting that arrived this way.
 *
 * Kept out of `lib/scan/provenance.ts` on purpose. Those values describe a
 * device path the owner drove — a camera, a gallery, a live QR read — and
 * `sanitizeProvenance` accepts them from the client. Nothing here is ever
 * client-supplied, and a scan must not be able to claim it was an exchange.
 */
export const EXCHANGE_CAPTURE_ORIGIN = 'card_exchange'
export const EXCHANGE_CAPTURE_KIND = 'reverse_exchange'

/**
 * Launch-safe ceilings.
 *
 * A name is a name. These exist so a public endpoint cannot be used to push
 * megabytes into a column, not to second-guess unusual but real values.
 */
export const LIMITS = {
  name: 120,
  email: 254,
  phone: 40,
  company: 120,
  role: 120,
  slug: 200,
} as const

export type ExchangeSubmission = {
  cardSlug: string
  name: string
  email: string
  phone: string | null
  company: string | null
  role: string | null
}

export type ExchangeParseResult =
  | { ok: true; submission: ExchangeSubmission }
  /** A bot filled the honeypot. The caller answers success and writes nothing. */
  | { ok: false; reason: 'honeypot' }
  | { ok: false; reason: 'invalid'; message: string }

/** Trim, cap, and treat blank as absent. Never throws on a non-string. */
function field(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function optional(value: unknown, max: number): string | null {
  return field(value, max) || null
}

/**
 * Deliberately close to the browser's own `type="email"` rule.
 *
 * A stricter pattern rejects real addresses, and this is a stranger's one
 * chance to hand over a contact at a trade fair. Deliverability is not
 * something a regex can decide.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Everything the server is willing to take from an anonymous request.
 *
 * Fields are read out one at a time rather than spread from the body, so an
 * unrecognised key cannot reach a column: adding `user_id` or `crm_status` to
 * the JSON changes nothing, because nothing reads them.
 *
 * There is no owner here. The request names the card it was opened from, and
 * the server resolves who that belongs to — a caller who could name the owner
 * could name any owner.
 */
export function parseExchangeSubmission(body: unknown): ExchangeParseResult {
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>

  /*
    The honeypot is checked first and answers success. Telling a bot it failed
    teaches it what to change; telling it nothing happened costs it a retry it
    will not make.
  */
  if (field(input.website, 200)) return { ok: false, reason: 'honeypot' }

  const cardSlug = field(input.cardSlug, LIMITS.slug).toLowerCase()
  if (!cardSlug) return { ok: false, reason: 'invalid', message: 'That card is not valid.' }

  const name = field(input.name, LIMITS.name)
  const email = field(input.email, LIMITS.email).toLowerCase()

  if (!name) return { ok: false, reason: 'invalid', message: 'Name and email are required.' }
  if (!email) return { ok: false, reason: 'invalid', message: 'Name and email are required.' }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, reason: 'invalid', message: 'That email address is not valid.' }
  }

  // Consent is a decision, so only an explicit `true` counts. A missing field,
  // a string, or a truthy value that was never a checkbox is not agreement.
  if (input.gdpr !== true) {
    return { ok: false, reason: 'invalid', message: 'Consent is required before sending.' }
  }

  return {
    ok: true,
    submission: {
      cardSlug,
      name,
      // Normalised the same way the duplicate matcher normalises, so the
      // address that decides whether this person already exists is the address
      // that gets stored.
      email: normalizeEmail(email) || email,
      phone: optional(input.phone, LIMITS.phone),
      company: optional(input.company, LIMITS.company),
      role: optional(input.role, LIMITS.role),
    },
  }
}

/**
 * The contact columns an exchange is entitled to write.
 *
 * Only what the receiver actually typed, plus provenance. The previous version
 * also wrote a `company_summary` of "<Company> contact", a `match_reason` of
 * "Submitted via ABC card exchange", a match score, and — through the scan
 * hook — a Cold rating, a 5% close probability and a Prospecting stage. None of
 * that was known. A CRM field invented at capture time is indistinguishable
 * later from one a person actually set.
 */
export function exchangeContactFields(submission: ExchangeSubmission) {
  return {
    name: submission.name,
    email: submission.email,
    phone: submission.phone,
    company: submission.company,
    role: submission.role,
    source: EXCHANGE_SOURCE,
  }
}
