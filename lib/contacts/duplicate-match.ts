import type { SupabaseClient } from '@supabase/supabase-js'
import {
  extractNormalizedEmails,
  extractNormalizedPhones,
  sharesValue,
} from '@/lib/contacts/identity'

/**
 * Finding the person the owner has already saved.
 *
 * Meeting someone a second time should add a meeting, not a second copy of
 * them. This decides whether the person being saved is already in the owner's
 * contacts — and it only ever says yes on an identifier that means one person:
 * the ABC account behind a scanned card, an email address, a phone number.
 *
 * A match is a question put to the owner, never a decision taken for them.
 * Nothing here writes, merges, or reconciles a single field.
 */

/** How the match was made, strongest first. */
export type MatchReason = 'abc_identity' | 'email' | 'phone'

/** What the owner is shown about a contact they may already have. */
export type ContactMatchSummary = {
  contactId: string
  name: string | null
  company: string | null
  role: string | null
  /** Newest meeting on record, so the owner recognises who this is. */
  lastMetAt: string | null
  lastEvent: string | null
}

export type DuplicateMatch = {
  reason: MatchReason
  contacts: ContactMatchSummary[]
}

/** Identity the server has established for the person being saved. */
export type MatchInput = {
  ownerId: string
  /** Resolved from the scanned card's slug by the server. Never client-supplied. */
  abcUserId?: string | null
  email?: string | null
  phone?: string | null
}

/** Only what matching and the summary need. Never the whole contact. */
const MATCH_COLUMNS =
  'id, name, first_name, last_name, company, role, email, phone, mobile_phone, meeting_event_name, event_name, raw_event_text, meeting_date, scanned_at'

/**
 * PostgREST caps a response at 1000 rows, and a cap that is not paged past is a
 * correctness bug that hides until an owner's list grows: contact 1001 would
 * quietly stop being matchable and start being duplicated.
 */
const PAGE = 1000
const MAX_PAGES = 50

type Row = Record<string, unknown>

function text(value: unknown): string | null {
  const s = typeof value === 'string' ? value.trim() : ''
  return s || null
}

function summarize(row: Row): ContactMatchSummary {
  const name =
    text(row.name) ||
    [text(row.first_name), text(row.last_name)].filter(Boolean).join(' ') ||
    null

  return {
    contactId: String(row.id),
    name,
    company: text(row.company),
    role: text(row.role),
    lastMetAt: text(row.meeting_date) || text(row.scanned_at),
    lastEvent: text(row.meeting_event_name) || text(row.event_name) || text(row.raw_event_text),
  }
}

/**
 * The owner's contacts that could match on email or phone.
 *
 * Filtered to rows carrying at least one of those identifiers — a contact with
 * neither can never match — and paged, so the answer stays right past a
 * thousand. Normalization happens here rather than in SQL because the stored
 * columns hold whatever a card printed: "+30 210 1234567 / +30 694 111 2222"
 * is one field holding two numbers, and no index expression makes that
 * comparable without first deciding what the numbers are.
 *
 * This is the honest cost of not adding normalized columns, and it is the right
 * trade at this size: a handful of narrow rows per owner, read once, only when
 * the scan actually carries an email or phone. If an owner ever holds tens of
 * thousands of contacts, this is the thing to replace — with generated
 * normalized columns and an index, not with a looser match.
 */
async function loadMatchableContacts(
  supabase: SupabaseClient,
  ownerId: string
): Promise<Row[]> {
  const rows: Row[] = []

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE
    const { data, error } = await supabase
      .from('scanned_contacts')
      .select(MATCH_COLUMNS)
      .eq('user_id', ownerId)
      .or('email.not.is.null,phone.not.is.null,mobile_phone.not.is.null')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) {
      console.error('[duplicate-match] contact scan failed:', error)
      return rows
    }
    if (!data || data.length === 0) break

    rows.push(...(data as Row[]))
    if (data.length < PAGE) break
  }

  return rows
}

/**
 * The strongest deterministic match, or null.
 *
 * Priority is strict and the levels never combine. If the ABC identity points
 * at one contact and an email at another, the ABC identity wins alone: it is
 * the only identifier the person themselves controls, and the two contacts are
 * left exactly as they are. A weaker signal disagreeing with a stronger one is
 * not evidence that two records should be joined — it is a reason to trust the
 * stronger one and touch nothing.
 */
export async function findExistingContactMatches(
  supabase: SupabaseClient,
  input: MatchInput
): Promise<DuplicateMatch | null> {
  const { ownerId } = input
  if (!ownerId) return null

  /*
    Level 1 — the ABC account behind the scanned card.

    Server-resolved from the card's slug, never taken from the request: a
    caller-supplied account id would let anyone claim their contact is someone
    else's ABC identity, and that claim is exactly what this level trusts.

    Indexed by (user_id, linked_abc_user_id), so this costs one lookup and is
    the common path for the QR flow.
  */
  if (input.abcUserId) {
    const { data, error } = await supabase
      .from('scanned_contacts')
      .select(MATCH_COLUMNS)
      .eq('user_id', ownerId)
      .eq('linked_abc_user_id', input.abcUserId)
      .limit(20)

    if (error) {
      console.error('[duplicate-match] abc identity lookup failed:', error)
    } else if (data && data.length > 0) {
      return { reason: 'abc_identity', contacts: (data as Row[]).map(summarize) }
    }
  }

  const emails = extractNormalizedEmails(input.email)
  const phones = extractNormalizedPhones(input.phone)
  if (emails.length === 0 && phones.length === 0) return null

  const rows = await loadMatchableContacts(supabase, ownerId)
  if (rows.length === 0) return null

  // Level 2 — email. Checked across every contact before phone is considered at
  // all, so a phone coincidence can never outrank an address that matched.
  if (emails.length > 0) {
    const hits = rows.filter((row) => sharesValue(emails, extractNormalizedEmails(text(row.email))))
    if (hits.length > 0) return { reason: 'email', contacts: hits.map(summarize) }
  }

  // Level 3 — phone. Both stored columns, because the contact screen already
  // treats them as one number and an owner would not expect otherwise.
  if (phones.length > 0) {
    const hits = rows.filter((row) => {
      const stored = [
        ...extractNormalizedPhones(text(row.phone)),
        ...extractNormalizedPhones(text(row.mobile_phone)),
      ]
      return sharesValue(phones, stored)
    })
    if (hits.length > 0) return { reason: 'phone', contacts: hits.map(summarize) }
  }

  return null
}
