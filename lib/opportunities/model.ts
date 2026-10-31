import { bucketFor } from '@/lib/followups'

/**
 * ABC CRM V1 — the opportunity model, and everything the CRM screens derive
 * from real rows.
 *
 * Pure: no server imports, so the API that validates a write and the screen
 * that renders it read the same lists and the same rules.
 *
 * Three ideas, kept apart on purpose:
 *
 *   A person is a contact. Every contact is somebody the owner met; none of
 *   them is a deal until the owner says so. The CRM reads `scanned_contacts`
 *   and never copies it.
 *
 *   An opportunity is commercial potential with one of those people. It lives
 *   in `crm_opportunities`, one per person, and its stage moves only when the
 *   owner moves it. The legacy `scanned_contacts.pipeline_stage` is advanced
 *   automatically by the CRM engine when a message is sent, which is exactly
 *   why it is not the deal stage here.
 *
 *   A follow-up belongs to a meeting. It is read from the contact's projection
 *   of its meetings and completed through /api/follow-ups, never rewritten
 *   here. The opportunity's own next step is a different thing — "send the
 *   quote" was not agreed at a meeting — and has its own three columns.
 */

// ─────────────────────────── STAGES ───────────────────────────

export type OpportunityStage = 'new' | 'in_progress' | 'proposal' | 'won' | 'lost'

/** The board. LOST is a closed state, kept out of the columns on purpose. */
export const BOARD_STAGES: OpportunityStage[] = ['new', 'in_progress', 'proposal', 'won']

export const ALL_STAGES: OpportunityStage[] = [...BOARD_STAGES, 'lost']

export const STAGE_LABEL: Record<OpportunityStage, string> = {
  new: 'New',
  in_progress: 'In progress',
  proposal: 'Proposal',
  won: 'Won',
  lost: 'Lost',
}

/**
 * Stage colour on the light workspace: graphite warming to gold as a deal
 * moves, then the two outcome colours the app already uses for good and bad.
 */
export const STAGE_TONE: Record<OpportunityStage, { text: string; bg: string; border: string; dot: string }> = {
  new: { text: '#5e5850', bg: 'rgba(98, 94, 87, 0.08)', border: 'rgba(98, 94, 87, 0.22)', dot: '#8a8178' },
  in_progress: { text: '#7a5c1a', bg: 'rgba(201, 166, 104, 0.14)', border: 'rgba(201, 166, 104, 0.40)', dot: '#c9a668' },
  proposal: { text: '#7a5810', bg: 'rgba(201, 150, 40, 0.16)', border: 'rgba(201, 150, 40, 0.45)', dot: '#c99628' },
  won: { text: '#22703f', bg: 'rgba(47, 143, 87, 0.10)', border: 'rgba(47, 143, 87, 0.32)', dot: '#2f8f57' },
  lost: { text: '#9c2019', bg: 'rgba(192, 39, 31, 0.07)', border: 'rgba(192, 39, 31, 0.26)', dot: '#c0271f' },
}

export function isStage(value: unknown): value is OpportunityStage {
  return typeof value === 'string' && (ALL_STAGES as string[]).includes(value)
}

/**
 * A stored stage, as V1 understands it.
 *
 * The column predates V1 and defaults to 'PROSPECT'; anything V1 did not write
 * is the start of the board rather than an error.
 */
export function normalizeStage(value: unknown): OpportunityStage {
  return isStage(value) ? value : 'new'
}

export function isOpenStage(stage: OpportunityStage): boolean {
  return stage === 'new' || stage === 'in_progress' || stage === 'proposal'
}

// ─────────────────────────── NEXT ACTIONS ───────────────────────────

export type NextActionType = 'follow_up' | 'call' | 'meeting' | 'quote' | 'reminder' | 'other'

export const NEXT_ACTION_TYPES: { id: NextActionType; label: string; starter: string }[] = [
  { id: 'follow_up', label: 'Follow-up', starter: 'Follow up' },
  { id: 'call', label: 'Call', starter: 'Call' },
  { id: 'meeting', label: 'Meeting', starter: 'Meet' },
  { id: 'quote', label: 'Quote', starter: 'Send quote' },
  { id: 'reminder', label: 'Reminder', starter: 'Check in' },
  { id: 'other', label: 'Other', starter: '' },
]

export function isNextActionType(value: unknown): value is NextActionType {
  return typeof value === 'string' && NEXT_ACTION_TYPES.some((t) => t.id === value)
}

export function actionTypeLabel(type: NextActionType): string {
  return NEXT_ACTION_TYPES.find((t) => t.id === type)?.label ?? 'Other'
}

// ─────────────────────────── VALUES ───────────────────────────

export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CZK'] as const
export type Currency = (typeof CURRENCIES)[number]

export function normalizeCurrency(value: unknown): Currency {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value.toUpperCase())
    ? (value.toUpperCase() as Currency)
    : 'EUR'
}

/** Positive amounts only; zero and garbage are "no value", not a value of zero. */
export function positiveAmount(value: unknown): number | null {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/[\s,]/g, '')) : NaN
  if (!Number.isFinite(num) || num <= 0) return null
  return Math.min(Math.round(num * 100) / 100, 1e12)
}

export function formatMoney(value: number | null, currency: Currency): string {
  if (value === null || value <= 0) return ''
  const formatted = value.toLocaleString('en-GB', { maximumFractionDigits: value >= 1000 ? 0 : 2 })
  if (currency === 'CZK') return `${formatted} Kč`
  const symbol = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$'
  return `${symbol}${formatted}`
}

// ─────────────────────────── ROWS ───────────────────────────

export type NextAction = { text: string; type: NextActionType; dueAt: string | null }

export type Opportunity = {
  id: string
  contactId: string
  name: string
  stage: OpportunityStage
  value: number | null
  currency: Currency
  note: string | null
  nextAction: NextAction | null
  createdAt: string
  updatedAt: string
}

function clean(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  return text.length > 0 ? text : null
}

function firstOf(...values: unknown[]): string | null {
  for (const value of values) {
    const text = clean(value)
    if (text) return text
  }
  return null
}

function validDate(value: unknown): string | null {
  const text = clean(value)
  if (!text) return null
  return Number.isNaN(new Date(text).getTime()) ? null : text
}

/** A `crm_opportunities` row, read with `select('*')` so missing V1 columns read as absent. */
export function toOpportunity(row: Record<string, unknown>): Opportunity {
  const text = clean(row.next_action)
  return {
    id: String(row.id),
    contactId: String(row.contact_id),
    name: clean(row.name) ?? 'Opportunity',
    stage: normalizeStage(row.stage),
    value: positiveAmount(row.value),
    currency: normalizeCurrency(row.currency),
    note: clean(row.notes),
    nextAction: text
      ? {
          text,
          type: isNextActionType(row.next_action_type) ? row.next_action_type : 'other',
          dueAt: validDate(row.next_action_due_at),
        }
      : null,
    createdAt: validDate(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: validDate(row.updated_at) ?? validDate(row.created_at) ?? new Date(0).toISOString(),
  }
}

/**
 * One opportunity per person.
 *
 * The migration adds a unique index; until it is applied, and for any row
 * written before it, the most recently touched opportunity is the one a
 * person has. Rows arrive newest first.
 */
export function onePerPerson(opportunities: Opportunity[]): Opportunity[] {
  const seen = new Set<string>()
  const out: Opportunity[] = []
  for (const opportunity of [...opportunities].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    if (seen.has(opportunity.contactId)) continue
    seen.add(opportunity.contactId)
    out.push(opportunity)
  }
  return out
}

// ─────────────────────────── PEOPLE ───────────────────────────

/** Contact columns the CRM reads — the meeting projection, not the enrichment surface. */
export const CRM_CONTACT_COLUMNS = [
  'id',
  'name',
  'first_name',
  'last_name',
  'role',
  'company',
  'photo_url',
  'email',
  'phone',
  'mobile_phone',
  'event_name',
  'meeting_event_name',
  'meeting_location',
  'raw_event_text',
  'meeting_topic',
  'meeting_date',
  'meeting_event_date',
  'next_action',
  'next_step',
  'next_action_date',
  'last_message_date',
  'last_message_type',
  'reply_date',
  'pipeline_stage',
  'pipeline_notes',
  'deal_value',
  'deal_currency',
  'scanned_at',
].join(', ')

export type InteractionKind = 'met' | 'message' | 'reply'

export type Interaction = { kind: InteractionKind; at: string; label: string }

export type CrmPerson = {
  id: string
  name: string
  firstName: string
  role: string | null
  company: string | null
  photoUrl: string | null
  email: string | null
  phone: string | null

  /** The latest meeting, as the contact projects it. */
  event: string | null
  metAt: string | null
  discussed: string | null

  /** The meeting follow-up still outstanding, if any. */
  followUp: { text: string | null; dueAt: string } | null
  /** The last follow-up message actually sent. */
  lastFollowUp: { channel: string | null; at: string } | null
  lastInteraction: Interaction | null

  /** The old board's view of this person — read only for the explicit import. */
  legacy: { stage: string | null; value: number | null; currency: Currency; notes: string | null }
}

function channelLabel(channel: string | null): string {
  if (!channel) return 'Follow-up sent'
  const lower = channel.toLowerCase()
  if (lower.includes('linkedin')) return 'LinkedIn message sent'
  if (lower.includes('whatsapp')) return 'WhatsApp message sent'
  if (lower.includes('mail')) return 'Email sent'
  return 'Follow-up sent'
}

/**
 * The most recent thing that really happened between the owner and this
 * person: a meeting, a message they sent, or a reply they logged. Enrichment,
 * exports and stage changes are bookkeeping, not interactions, and are not
 * candidates — which is why `last_activity_at` is not read.
 */
export function lastInteractionOf(person: {
  event: string | null
  metAt: string | null
  lastFollowUp: { channel: string | null; at: string } | null
  replyAt: string | null
}): Interaction | null {
  const candidates: Interaction[] = []
  if (person.metAt) candidates.push({ kind: 'met', at: person.metAt, label: person.event ? `Met at ${person.event}` : 'Met' })
  if (person.lastFollowUp) candidates.push({ kind: 'message', at: person.lastFollowUp.at, label: channelLabel(person.lastFollowUp.channel) })
  if (person.replyAt) candidates.push({ kind: 'reply', at: person.replyAt, label: 'Reply received' })

  let latest: Interaction | null = null
  for (const candidate of candidates) {
    const time = new Date(candidate.at).getTime()
    if (Number.isNaN(time)) continue
    if (!latest || time > new Date(latest.at).getTime()) latest = candidate
  }
  return latest
}

export function toCrmPerson(row: Record<string, unknown>): CrmPerson {
  const name =
    firstOf(row.name, [clean(row.first_name), clean(row.last_name)].filter(Boolean).join(' ')) ??
    'Unnamed contact'
  const event = firstOf(row.meeting_event_name, row.event_name, row.raw_event_text, row.meeting_location)
  // The same precedence the contact screen uses, so the two never disagree.
  const metAt = validDate(firstOf(row.meeting_date, row.meeting_event_date, row.scanned_at))
  const dueAt = validDate(row.next_action_date)
  const sentAt = validDate(row.last_message_date)
  const lastFollowUp = sentAt ? { channel: clean(row.last_message_type), at: sentAt } : null

  return {
    id: String(row.id),
    name,
    firstName: firstOf(row.first_name, name.split(/\s+/)[0]) ?? name,
    role: clean(row.role),
    company: clean(row.company),
    photoUrl: clean(row.photo_url),
    email: clean(row.email),
    phone: firstOf(row.phone, row.mobile_phone),
    event,
    metAt,
    discussed: clean(row.meeting_topic),
    followUp: dueAt ? { text: firstOf(row.next_action, row.next_step), dueAt } : null,
    lastFollowUp,
    lastInteraction: lastInteractionOf({ event, metAt, lastFollowUp, replyAt: validDate(row.reply_date) }),
    legacy: {
      stage: clean(row.pipeline_stage),
      value: positiveAmount(row.deal_value),
      currency: normalizeCurrency(row.deal_currency),
      notes: clean(row.pipeline_notes),
    },
  }
}

/** What an opportunity is called when the owner does not name it. */
export function defaultOpportunityName(person: { name: string; company: string | null }): string {
  return person.company ?? person.name
}

export const STALE_AFTER_DAYS = 14

export function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return null
  return Math.max(0, Math.floor((now.getTime() - time) / 86_400_000))
}

// ─────────────────────────── THE BOARD ───────────────────────────

export type BoardEntry = { opportunity: Opportunity; person: CrmPerson }

/**
 * Opportunities joined to the people they belong to. An opportunity whose
 * contact is not among the owner's contacts is not shown: the contact was
 * deleted (and its opportunity with it) or never belonged to this owner.
 */
export function joinBoard(opportunities: Opportunity[], people: CrmPerson[]): BoardEntry[] {
  const byId = new Map(people.map((p) => [p.id, p]))
  const out: BoardEntry[] = []
  for (const opportunity of onePerPerson(opportunities)) {
    const person = byId.get(opportunity.contactId)
    if (person) out.push({ opportunity, person })
  }
  return out
}

/** Open pipeline value, per currency — amounts in different currencies are never added together. */
export function openValueByCurrency(opportunities: Opportunity[]): { currency: Currency; total: number }[] {
  const totals = new Map<Currency, number>()
  for (const o of opportunities) {
    if (!isOpenStage(o.stage) || o.value === null) continue
    totals.set(o.currency, (totals.get(o.currency) ?? 0) + o.value)
  }
  return Array.from(totals, ([currency, total]) => ({ currency, total })).sort((a, b) => b.total - a.total)
}

// ─────────────────────────── NEXT ───────────────────────────

export type NextGroup = 'overdue' | 'today' | 'upcoming' | 'later' | 'undated' | 'missing'

export const NEXT_GROUP_LABEL: Record<NextGroup, string> = {
  overdue: 'Overdue',
  today: 'Today',
  upcoming: 'This week',
  later: 'Later',
  undated: 'No date',
  missing: 'Needs a next step',
}

export const NEXT_GROUP_ORDER: NextGroup[] = ['overdue', 'today', 'upcoming', 'later', 'undated', 'missing']

export type NextItem = {
  key: string
  /** Where the action lives, which decides how it is completed. */
  source: 'deal' | 'meeting' | 'missing'
  contactId: string
  opportunityId: string | null
  stage: OpportunityStage | null
  person: { name: string; firstName: string; company: string | null; photoUrl: string | null }
  type: NextActionType | null
  text: string
  dueAt: string | null
  group: NextGroup
  /** Why it is on the list, in a few words. */
  context: string
}

function groupFor(dueAt: string | null, now: Date): NextGroup {
  if (!dueAt) return 'undated'
  return bucketFor(dueAt, now) ?? (new Date(dueAt).getTime() > now.getTime() ? 'later' : 'overdue')
}

function personBits(person: CrmPerson) {
  return { name: person.name, firstName: person.firstName, company: person.company, photoUrl: person.photoUrl }
}

/**
 * The action centre: what to do next, from real rows only.
 *
 *   deal     an open opportunity's own next step
 *   meeting  a meeting follow-up still outstanding, for anyone — deal or not
 *   missing  an open opportunity with neither; "Reconnect" only when the last
 *            real interaction is old enough to say so
 *
 * Won and lost deals ask for nothing. Nothing here invents a step the owner
 * did not write or a meeting did not record.
 */
export function buildNextItems(people: CrmPerson[], opportunities: Opportunity[], now: Date = new Date()): NextItem[] {
  const board = joinBoard(opportunities, people)
  const dealByPerson = new Map(board.map((e) => [e.person.id, e.opportunity]))
  const items: NextItem[] = []

  for (const { opportunity, person } of board) {
    if (!isOpenStage(opportunity.stage)) continue
    if (opportunity.nextAction) {
      items.push({
        key: `deal:${opportunity.id}`,
        source: 'deal',
        contactId: person.id,
        opportunityId: opportunity.id,
        stage: opportunity.stage,
        person: personBits(person),
        type: opportunity.nextAction.type,
        text: opportunity.nextAction.text,
        dueAt: opportunity.nextAction.dueAt,
        group: groupFor(opportunity.nextAction.dueAt, now),
        context: `Opportunity · ${STAGE_LABEL[opportunity.stage]}`,
      })
    } else if (!person.followUp) {
      const idle = daysSince(person.lastInteraction?.at, now)
      const stale = idle === null || idle >= STALE_AFTER_DAYS
      items.push({
        key: `missing:${opportunity.id}`,
        source: 'missing',
        contactId: person.id,
        opportunityId: opportunity.id,
        stage: opportunity.stage,
        person: personBits(person),
        type: null,
        text: stale ? `Reconnect with ${person.firstName}` : 'Set a next step',
        dueAt: null,
        group: 'missing',
        context:
          idle === null
            ? 'No interaction recorded'
            : idle === 0
              ? 'Last interaction today'
              : `Last interaction ${idle} day${idle === 1 ? '' : 's'} ago`,
      })
    }
  }

  for (const person of people) {
    if (!person.followUp) continue
    // A meeting follow-up stands whatever the deal's state: it was agreed with the person.
    const deal = dealByPerson.get(person.id) ?? null
    items.push({
      key: `meeting:${person.id}`,
      source: 'meeting',
      contactId: person.id,
      opportunityId: deal?.id ?? null,
      stage: deal?.stage ?? null,
      person: personBits(person),
      type: 'follow_up',
      text: person.followUp.text ?? `Follow up with ${person.firstName}`,
      dueAt: person.followUp.dueAt,
      group: groupFor(person.followUp.dueAt, now),
      context: person.event ? `From meeting · ${person.event}` : 'From your meeting',
    })
  }

  const rank = (item: NextItem) => NEXT_GROUP_ORDER.indexOf(item.group)
  return items.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt)
    return a.person.name.localeCompare(b.person.name)
  })
}

/** Due today or earlier — the part of the list that is late if left. */
export function isPressing(item: NextItem): boolean {
  return item.group === 'overdue' || item.group === 'today'
}

// ─────────────────────────── PEOPLE VIEW ───────────────────────────

export type PeopleFilter = 'all' | 'opportunities' | 'needs_action' | 'won'

export const PEOPLE_FILTERS: { id: PeopleFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'needs_action', label: 'Needs action' },
  { id: 'won', label: 'Won' },
]

export type PeopleRow = {
  person: CrmPerson
  opportunity: { id: string; stage: OpportunityStage; value: number | null; currency: Currency } | null
  /** The one next thing for this person: the deal's step, else the meeting follow-up. */
  next: { text: string; dueAt: string | null; source: 'deal' | 'meeting' } | null
  needsAction: boolean
}

export function buildPeopleRows(people: CrmPerson[], opportunities: Opportunity[], now: Date = new Date()): PeopleRow[] {
  const byPerson = new Map(onePerPerson(opportunities).map((o) => [o.contactId, o]))
  const pressing = new Set(buildNextItems(people, opportunities, now).filter((i) => isPressing(i) || i.group === 'missing').map((i) => i.contactId))

  return people.map((person) => {
    const opportunity = byPerson.get(person.id) ?? null
    const dealStep = opportunity && isOpenStage(opportunity.stage) ? opportunity.nextAction : null
    return {
      person,
      opportunity: opportunity
        ? { id: opportunity.id, stage: opportunity.stage, value: opportunity.value, currency: opportunity.currency }
        : null,
      next: dealStep
        ? { text: dealStep.text, dueAt: dealStep.dueAt, source: 'deal' }
        : person.followUp
          ? { text: person.followUp.text ?? 'Follow up', dueAt: person.followUp.dueAt, source: 'meeting' }
          : null,
      needsAction: pressing.has(person.id),
    }
  })
}

export function matchesPeopleFilter(row: PeopleRow, filter: PeopleFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'opportunities') return Boolean(row.opportunity && isOpenStage(row.opportunity.stage))
  if (filter === 'won') return row.opportunity?.stage === 'won'
  return row.needsAction
}

export function matchesPeopleQuery(row: PeopleRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [row.person.name, row.person.company, row.person.role, row.person.event]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q))
}

// ─────────────────────────── THE OLD BOARD ───────────────────────────

/**
 * The previous Pipeline put every contact on a board by default and moved some
 * of them automatically, so most of its stages say nothing the owner decided.
 * Three do: a meeting logged, a deal opened, a deal won — and so does a deal
 * value someone typed in. Those, and only those, are offered for import, and
 * only when the owner asks. Nothing is converted on its own.
 */
const LEGACY_IMPORT_STAGE: Record<string, OpportunityStage> = {
  meeting: 'in_progress',
  deal: 'proposal',
  won: 'won',
}

export function legacyImportStage(person: CrmPerson): OpportunityStage | null {
  const stage = person.legacy.stage
  if (stage && LEGACY_IMPORT_STAGE[stage]) return LEGACY_IMPORT_STAGE[stage]
  if (stage === 'lost') return null
  if (person.legacy.value !== null) return stage === 'follow-up' ? 'in_progress' : 'new'
  return null
}

export function legacyImportCandidates(people: CrmPerson[], opportunities: Opportunity[]): CrmPerson[] {
  const taken = new Set(opportunities.map((o) => o.contactId))
  return people.filter((p) => !taken.has(p.id) && legacyImportStage(p) !== null)
}

// ─────────────────────────── INPUT ───────────────────────────

export const LIMITS = { name: 120, note: 2000, action: 300 } as const

export function trimTo(value: unknown, max: number): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return null
  return text.length > max ? text.slice(0, max) : text
}

/**
 * A due date from the screen — `YYYY-MM-DD` or an ISO timestamp — as stored.
 * A bare date is stored at noon UTC so it stays on the same calendar day
 * everywhere ABC is used.
 */
export function dueAtFromInput(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return null
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T12:00:00.000Z` : text
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** The `<input type="date">` value for a stored due date. */
export function dateInputValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
