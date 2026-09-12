import { startOfDay } from '@/lib/followups'

/**
 * Event workspaces, derived from meetings rather than stored as their own thing.
 *
 * ABC already records where a meeting happened: `contact_encounters.event`, with
 * `event_normalized` holding the sanitised form when one exists. A trade fair is
 * therefore not a new entity here — it is the set of this owner's encounters
 * that name the same event, and everything on the screen is counted from those
 * rows.
 *
 * That is deliberate for the launch. An events table would have to be filled by
 * somebody, kept in step with the text people actually type at a stand, and
 * migrated before it could show a single number; this shows the truth already in
 * the database on the day it ships. The seam is the shape below: a page is given
 * `EventSummary` and `EventEncounter`, never a query. When a real event entity
 * arrives it produces the same two shapes and nothing above this file changes —
 * and no contact or encounter has to move, because none of this owns them.
 *
 * PERSON != ENCOUNTER holds throughout. A person met at two fairs is one contact
 * with two encounters and appears in both workspaces; the workspace groups
 * meetings and never people.
 */

/** One meeting, as the workspace needs it. Mirrors `contact_encounters`. */
export type WorkspaceEncounter = {
  id: string
  contactId: string
  /** When the meeting happened, not when the row was written. */
  metAt: string | null
  /** Raw event text as entered. */
  event: string | null
  /** Sanitised event text, when Phase 6 produced one. */
  eventNormalized: string | null
  discussed: string | null
  nextAction: string | null
  followUpAt: string | null
}

/** The person a meeting was with. Global to the account, never per event. */
export type WorkspacePerson = {
  id: string
  name: string | null
  company: string | null
  role: string | null
}

/**
 * What the event is called.
 *
 * The sanitised name when there is one, the raw text otherwise — the same rule
 * the CSV export and the CRM push already use, so a fair is named identically
 * wherever it appears.
 */
export function eventDisplayName(encounter: Pick<WorkspaceEncounter, 'event' | 'eventNormalized'>): string | null {
  const normalized = (encounter.eventNormalized || '').trim()
  if (normalized) return normalized
  const raw = (encounter.event || '').trim()
  return raw || null
}

/**
 * The event's address in a URL.
 *
 * Folded to lower case and to hyphens, so the same fair typed with different
 * capitalisation is one workspace. It is derived, not stored: the key is only
 * ever compared against keys computed from this owner's own rows, so it selects
 * among their events and can never reach anybody else's — ownership is settled
 * by the session before grouping begins, never by this string.
 */
export function eventKeyFromName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  if (slug) return slug
  // A name of punctuation alone still needs a stable address.
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return `event-${Math.abs(hash).toString(36)}`
}

/** Where a meeting stands on following up. */
export type FollowUpState = 'due' | 'scheduled' | 'none'

/**
 * Due means today or earlier — the same day boundary the follow-up inbox uses,
 * so a meeting that the inbox calls due is never called scheduled here.
 *
 * Completing a follow-up clears `follow_up_at`, which is why there is no
 * "completed" state: at this level a cleared date and a date never set are the
 * same row. The event workspace says what still needs doing, and is silent
 * about what did not need doing in the first place.
 */
export function followUpState(followUpAt: string | null, now: Date = new Date()): FollowUpState {
  if (!followUpAt) return 'none'
  const due = new Date(followUpAt)
  if (Number.isNaN(due.getTime())) return 'none'

  const tomorrow = startOfDay(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return due < tomorrow ? 'due' : 'scheduled'
}

/**
 * Whether this meeting reached a CRM.
 *
 * Evidence only: a `crm_object_mappings` row of type `encounter` for this
 * encounter, which every provider writes when it pushes the meeting. A contact
 * that exists in a CRM says nothing about whether this particular meeting was
 * pushed, so it is not counted here.
 */
export type CrmState = 'synced' | 'not_synced'

export type EventEncounter = {
  encounterId: string
  person: WorkspacePerson
  metAt: string | null
  discussed: string | null
  nextAction: string | null
  followUpAt: string | null
  followUp: FollowUpState
  crm: CrmState
  crmProviders: string[]
}

export type EventSummary = {
  key: string
  name: string
  /** Meetings at this event. */
  encounters: number
  /** Distinct people met, which is not the same number. */
  people: number
  followUpsDue: number
  followUpsScheduled: number
  crmSynced: number
  firstMetAt: string | null
  lastMetAt: string | null
}

export type EventWorkspace = {
  summary: EventSummary
  encounters: EventEncounter[]
}

export type GroupingInput = {
  encounters: WorkspaceEncounter[]
  people: Map<string, WorkspacePerson>
  /** Encounter ids with a CRM mapping, and the providers that hold them. */
  crmByEncounter: Map<string, string[]>
  now?: Date
}

function toEventEncounter(
  encounter: WorkspaceEncounter,
  { people, crmByEncounter, now }: GroupingInput
): EventEncounter {
  const providers = crmByEncounter.get(encounter.id) ?? []
  return {
    encounterId: encounter.id,
    person: people.get(encounter.contactId) ?? {
      id: encounter.contactId,
      name: null,
      company: null,
      role: null,
    },
    metAt: encounter.metAt,
    discussed: encounter.discussed,
    nextAction: encounter.nextAction,
    followUpAt: encounter.followUpAt,
    followUp: followUpState(encounter.followUpAt, now),
    crm: providers.length > 0 ? 'synced' : 'not_synced',
    crmProviders: providers,
  }
}

const byMetAtDesc = (a: { metAt: string | null }, b: { metAt: string | null }) =>
  (b.metAt || '').localeCompare(a.metAt || '')

/**
 * Every event this owner has met somebody at, newest first.
 *
 * A meeting with no event text belongs to no workspace — it was a meeting, not
 * a fair, and inventing a bucket for it would put words in the owner's mouth.
 */
export function groupEncountersIntoEvents(input: GroupingInput): EventSummary[] {
  const groups = new Map<string, { name: string; rows: EventEncounter[] }>()

  for (const encounter of input.encounters) {
    const name = eventDisplayName(encounter)
    if (!name) continue

    const key = eventKeyFromName(name)
    const group = groups.get(key) ?? { name, rows: [] }
    group.rows.push(toEventEncounter(encounter, input))
    groups.set(key, group)
  }

  const summaries: EventSummary[] = []
  for (const [key, group] of groups) {
    const rows = [...group.rows].sort(byMetAtDesc)
    const dates = rows.map((row) => row.metAt).filter((value): value is string => Boolean(value))
    summaries.push({
      key,
      name: group.name,
      encounters: rows.length,
      people: new Set(rows.map((row) => row.person.id)).size,
      followUpsDue: rows.filter((row) => row.followUp === 'due').length,
      followUpsScheduled: rows.filter((row) => row.followUp === 'scheduled').length,
      crmSynced: rows.filter((row) => row.crm === 'synced').length,
      firstMetAt: dates.length ? dates[dates.length - 1] : null,
      lastMetAt: dates.length ? dates[0] : null,
    })
  }

  return summaries.sort((a, b) => (b.lastMetAt || '').localeCompare(a.lastMetAt || ''))
}

/** One event workspace, or null when this owner has no meetings under that key. */
export function buildEventWorkspace(input: GroupingInput, eventKey: string): EventWorkspace | null {
  const rows: EventEncounter[] = []
  let name: string | null = null

  for (const encounter of input.encounters) {
    const displayName = eventDisplayName(encounter)
    if (!displayName || eventKeyFromName(displayName) !== eventKey) continue
    name = name ?? displayName
    rows.push(toEventEncounter(encounter, input))
  }

  if (!name) return null

  rows.sort(byMetAtDesc)
  const dates = rows.map((row) => row.metAt).filter((value): value is string => Boolean(value))

  return {
    summary: {
      key: eventKey,
      name,
      encounters: rows.length,
      people: new Set(rows.map((row) => row.person.id)).size,
      followUpsDue: rows.filter((row) => row.followUp === 'due').length,
      followUpsScheduled: rows.filter((row) => row.followUp === 'scheduled').length,
      crmSynced: rows.filter((row) => row.crm === 'synced').length,
      firstMetAt: dates.length ? dates[dates.length - 1] : null,
      lastMetAt: dates.length ? dates[0] : null,
    },
    encounters: rows,
  }
}

/** The filters the detail screen offers. Each is a fact already on the row. */
export type EventFilter = 'all' | 'needs_follow_up' | 'scheduled' | 'in_crm' | 'not_in_crm'

export function matchesFilter(encounter: EventEncounter, filter: EventFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'needs_follow_up':
      return encounter.followUp === 'due'
    case 'scheduled':
      return encounter.followUp === 'scheduled'
    case 'in_crm':
      return encounter.crm === 'synced'
    case 'not_in_crm':
      return encounter.crm === 'not_synced'
  }
}
