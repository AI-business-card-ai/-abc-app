import { bucketFor, type FollowUpBucket } from '@/lib/followups'

/**
 * The columns the Contacts list actually reads. Kept narrow on purpose:
 * the old screen selected `*`, which pulled every enrichment blob down the
 * wire for a list that never showed them.
 */
export const CONTACT_LIST_COLUMNS = [
  'id',
  'name',
  'first_name',
  'last_name',
  'role',
  'company',
  'email',
  'photo_url',
  'event_name',
  'meeting_event_name',
  'meeting_location',
  'raw_event_text',
  'meeting_topic',
  'notes',
  'next_action',
  'next_step',
  'next_action_date',
  'source',
  'scanned_at',
].join(', ')

/** Shape returned by the list query — a subset of ScannedContact. */
export type ContactListRow = {
  id: string
  name: string | null
  first_name?: string | null
  last_name?: string | null
  role: string | null
  company: string | null
  email: string | null
  photo_url: string | null
  event_name: string | null
  meeting_event_name: string | null
  meeting_location: string | null
  raw_event_text: string | null
  meeting_topic: string | null
  notes: string | null
  next_action: string | null
  next_step: string | null
  next_action_date: string | null
  source: string | null
  scanned_at: string | null
}

export type ContactCardData = {
  id: string
  name: string
  role: string | null
  company: string | null
  email: string | null
  photoUrl: string | null
  /** Where the meeting happened, from whichever field holds it. */
  event: string | null
  /** What was discussed. */
  discussed: string | null
  /** What happens next. */
  nextStep: string | null
  followUpAt: string | null
  followUp: FollowUpBucket | null
  sourceLabel: string | null
  scannedAt: string | null
}

/**
 * Database source values → labels a person would recognise.
 * Unknown values return null rather than leaking a raw enum into the UI.
 */
const SOURCE_LABELS: Record<string, string> = {
  business_card: 'Business card',
  badge: 'Badge',
  qr: 'QR',
  document: 'Document',
  upload: 'Upload',
  auto: 'Scan',
  manual: 'Manual',
  vcard: 'vCard',
  reverse_qr: 'ABC Card',
  card_exchange: 'ABC Card',
}

export function sourceLabel(value: string | null | undefined): string | null {
  if (!value) return null
  return SOURCE_LABELS[value] ?? null
}

/**
 * The captures where the person handed their details over, rather than being read.
 *
 * A reverse exchange is the one capture the owner did not perform: somebody
 * opened their public card and sent their own details back. Nothing was
 * scanned, so nothing should say it was.
 */
const SHARED_SOURCES = new Set(['card_exchange', 'reverse_qr'])

/**
 * How a contact arrived, as a whole phrase.
 *
 * The detail screen used to build this itself by prefixing "Scanned from " to
 * the label, which read "Scanned from abc card" for a contact nobody scanned —
 * the receiver typed it into a form on the owner's card. The phrase is decided
 * here now, beside the labels it is built from.
 *
 * Every scanner source keeps the exact wording it already had; only the two
 * exchange sources read differently, and only in how they are described. The
 * stored `source` value is untouched.
 */
export function capturePhrase(value: string | null | undefined): string | null {
  const label = sourceLabel(value)
  if (!label || !value) return null

  return SHARED_SOURCES.has(value) ? `Shared via ${label}` : `Scanned from ${label.toLowerCase()}`
}

function firstNonEmpty(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const trimmed = (value || '').trim()
    if (trimmed) return trimmed
  }
  return null
}

export function toContactCard(row: ContactListRow, now: Date = new Date()): ContactCardData {
  const name =
    firstNonEmpty(row.name, [row.first_name, row.last_name].filter(Boolean).join(' ')) ??
    'Unnamed contact'

  return {
    id: String(row.id),
    name,
    role: firstNonEmpty(row.role),
    company: firstNonEmpty(row.company),
    email: firstNonEmpty(row.email),
    photoUrl: firstNonEmpty(row.photo_url),
    event: firstNonEmpty(
      row.meeting_event_name,
      row.event_name,
      row.raw_event_text,
      row.meeting_location
    ),
    discussed: firstNonEmpty(row.meeting_topic, row.notes),
    nextStep: firstNonEmpty(row.next_action, row.next_step),
    followUpAt: row.next_action_date,
    followUp: bucketFor(row.next_action_date, now),
    sourceLabel: sourceLabel(row.source),
    scannedAt: row.scanned_at,
  }
}

export type ContactFilter = 'all' | 'follow_up' | 'recent'

export const CONTACT_FILTERS: { id: ContactFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'follow_up', label: 'Needs follow-up' },
  { id: 'recent', label: 'Recent' },
]

const RECENT_DAYS = 7

export function matchesFilter(
  contact: ContactCardData,
  filter: ContactFilter,
  now: Date = new Date()
): boolean {
  if (filter === 'all') return true

  if (filter === 'follow_up') {
    return contact.followUp === 'overdue' || contact.followUp === 'today'
  }

  // recent
  if (!contact.scannedAt) return false
  const scanned = new Date(contact.scannedAt)
  if (Number.isNaN(scanned.getTime())) return false
  return now.getTime() - scanned.getTime() <= RECENT_DAYS * 86_400_000
}

/**
 * Client-side search across the fields already loaded for the list.
 * There is no server-side full-text index — see the Contacts limitations note.
 */
export function matchesQuery(contact: ContactCardData, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true

  const haystack = [
    contact.name,
    contact.role,
    contact.company,
    contact.email,
    contact.event,
    contact.discussed,
    contact.nextStep,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  // Every whitespace-separated term must appear somewhere.
  return q.split(/\s+/).every((term) => haystack.includes(term))
}

/** Distinct events present in the data, for the event filter. */
export function eventOptions(contacts: ContactCardData[]): string[] {
  const set = new Set<string>()
  for (const contact of contacts) {
    if (contact.event) set.add(contact.event)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}
