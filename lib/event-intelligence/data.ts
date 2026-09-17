import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerComponentClient } from '@/lib/supabase-server'
import { eventDisplayName, eventKeyFromName } from '@/lib/events/workspace'
import type {
  CompanyIntentProfile,
  EventObjective,
  IntelCompany,
  IntelEvent,
  IntelPresence,
  MeetingTarget,
  StoredMatch,
} from '@/lib/event-intelligence/types'

/**
 * Reading Event Intelligence, server-side.
 *
 * Every query that touches an owner-scoped table filters on `user_id` as well
 * as relying on RLS — the belt is the policy, this is the braces, and it is
 * what makes the guarantee readable in the file rather than only in the
 * database. The owner id always comes from `auth.getUser()`, never from a
 * parameter a caller could choose.
 */

type Row = Record<string, unknown>

const str = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || null
}

const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : []

const num = (value: unknown): number | null => (typeof value === 'number' ? value : null)

type Client = SupabaseClient | ReturnType<typeof createServerComponentClient>

/** The signed-in owner, or null. Nothing below runs without one. */
export async function currentOwnerId(supabase: Client): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

// ── Mapping ──────────────────────────────────────────────────────

export function toEvent(row: Row): IntelEvent {
  return {
    id: String(row.id),
    eventKey: String(row.event_key),
    name: String(row.name),
    editionYear: num(row.edition_year),
    organizer: str(row.organizer),
    venue: str(row.venue),
    city: str(row.city),
    country: str(row.country),
    startsOn: str(row.starts_on),
    endsOn: str(row.ends_on),
    websiteUrl: str(row.website_url),
  }
}

export function toCompany(row: Row): IntelCompany {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    nameNormalized: String(row.name_normalized),
    websiteDomain: str(row.website_domain),
    country: str(row.country),
    descriptionPublic: str(row.description_public),
    categories: list(row.categories),
    mergeCandidateOf: str(row.merge_candidate_of),
  }
}

export function toPresence(row: Row): IntelPresence {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    companyId: String(row.company_id),
    exhibitorDisplayName: str(row.exhibitor_display_name),
    hall: str(row.hall),
    stand: str(row.stand),
    eventCategories: list(row.event_categories),
    eventDescription: str(row.event_description),
    productsServices: list(row.products_services),
    listingUrl: str(row.listing_url),
    status: row.status === 'withdrawn' ? 'withdrawn' : 'listed',
    firstSeenAt: String(row.first_seen_at),
    lastSeenAt: String(row.last_seen_at),
  }
}

export function toProfile(row: Row): CompanyIntentProfile {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    companyName: str(row.company_name),
    whatWeDo: str(row.what_we_do),
    whatWeSell: list(row.what_we_sell),
    whatWeBuy: list(row.what_we_buy),
    whoWeWantToMeet: str(row.who_we_want_to_meet),
    targetIndustries: list(row.target_industries),
    targetCompanyTypes: list(row.target_company_types),
    capabilities: list(row.capabilities),
    technologies: list(row.technologies),
    materials: list(row.materials),
    certifications: list(row.certifications),
    geographies: list(row.geographies),
  }
}

export function toObjective(row: Row): EventObjective {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    eventId: String(row.event_id),
    profileId: String(row.profile_id),
    goals: str(row.goals),
    sellFocus: list(row.sell_focus),
    buyFocus: list(row.buy_focus),
    partnerFocus: list(row.partner_focus),
    priorityIndustries: list(row.priority_industries),
    priorityGeographies: list(row.priority_geographies),
    notes: str(row.notes),
  }
}

export function toMatch(row: Row): StoredMatch {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    objectiveId: String(row.objective_id),
    presenceId: String(row.presence_id),
    matchType: row.match_type as StoredMatch['matchType'],
    score: Number(row.score),
    engineVersion: String(row.engine_version),
    reasons: Array.isArray(row.reasons) ? (row.reasons as StoredMatch['reasons']) : [],
    evidence: Array.isArray(row.evidence) ? (row.evidence as StoredMatch['evidence']) : [],
    warnings: Array.isArray(row.warnings) ? (row.warnings as StoredMatch['warnings']) : [],
    matchedAt: String(row.matched_at),
  }
}

export function toTarget(row: Row): MeetingTarget {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    matchId: String(row.match_id),
    eventId: String(row.event_id),
    presenceId: String(row.presence_id),
    status: row.status as MeetingTarget['status'],
    priority: (Number(row.priority) || 2) as MeetingTarget['priority'],
    privateNote: str(row.private_note),
    scheduledFor: str(row.scheduled_for),
    metEncounterId: str(row.met_encounter_id),
  }
}

const EVENT_COLUMNS =
  'id, event_key, name, edition_year, organizer, venue, city, country, starts_on, ends_on, website_url'
const PRESENCE_COLUMNS =
  'id, event_id, company_id, exhibitor_display_name, hall, stand, event_categories, event_description, products_services, listing_url, status, first_seen_at, last_seen_at'
const PROFILE_COLUMNS =
  'id, user_id, company_name, what_we_do, what_we_sell, what_we_buy, who_we_want_to_meet, target_industries, target_company_types, capabilities, technologies, materials, certifications, geographies'
const OBJECTIVE_COLUMNS =
  'id, user_id, event_id, profile_id, goals, sell_focus, buy_focus, partner_focus, priority_industries, priority_geographies, notes'
const MATCH_COLUMNS =
  'id, user_id, objective_id, presence_id, match_type, score, engine_version, reasons, evidence, warnings, matched_at'
const TARGET_COLUMNS =
  'id, user_id, match_id, event_id, presence_id, status, priority, private_note, scheduled_for, met_encounter_id'

// ── Reads ────────────────────────────────────────────────────────

export async function loadIntentProfile(
  supabase: Client,
  ownerId: string
): Promise<CompanyIntentProfile | null> {
  const { data, error } = await supabase
    .from('intel_company_profiles')
    .select(PROFILE_COLUMNS)
    .eq('user_id', ownerId)
    .maybeSingle()

  if (error) {
    console.error('[event-intelligence] profile query failed:', error.code ?? 'unknown')
    return null
  }
  return data ? toProfile(data as Row) : null
}

export async function loadEventByKey(supabase: Client, eventKey: string): Promise<IntelEvent | null> {
  const { data, error } = await supabase
    .from('intel_events')
    .select(EVENT_COLUMNS)
    .eq('event_key', eventKey)
    .maybeSingle()

  if (error) {
    console.error('[event-intelligence] event query failed:', error.code ?? 'unknown')
    return null
  }
  return data ? toEvent(data as Row) : null
}

export async function loadObjective(
  supabase: Client,
  ownerId: string,
  eventId: string
): Promise<EventObjective | null> {
  const { data, error } = await supabase
    .from('intel_event_objectives')
    .select(OBJECTIVE_COLUMNS)
    .eq('user_id', ownerId)
    .eq('event_id', eventId)
    .maybeSingle()

  if (error) {
    console.error('[event-intelligence] objective query failed:', error.code ?? 'unknown')
    return null
  }
  return data ? toObjective(data as Row) : null
}

/** A fair, its exhibitors and the companies behind them. Facts only. */
export async function loadEventGraph(
  supabase: Client,
  eventId: string
): Promise<{ presences: IntelPresence[]; companies: Map<string, IntelCompany> }> {
  const { data: presenceRows, error } = await supabase
    .from('intel_company_presences')
    .select(PRESENCE_COLUMNS)
    .eq('event_id', eventId)
    .order('id', { ascending: true })

  if (error) {
    console.error('[event-intelligence] presence query failed:', error.code ?? 'unknown')
    return { presences: [], companies: new Map() }
  }

  const presences = ((presenceRows ?? []) as Row[]).map(toPresence)
  const companies = new Map<string, IntelCompany>()
  if (presences.length === 0) return { presences, companies }

  const ids = Array.from(new Set(presences.map((p) => p.companyId)))
  // `.in()` on thousands of ids is one enormous URL; ask in chunks.
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error: companyError } = await supabase
      .from('intel_companies')
      .select('id, display_name, name_normalized, website_domain, country, description_public, categories, merge_candidate_of')
      .in('id', ids.slice(i, i + 200))

    if (companyError) {
      console.error('[event-intelligence] company query failed:', companyError.code ?? 'unknown')
      continue
    }
    for (const row of (data ?? []) as Row[]) {
      const company = toCompany(row)
      companies.set(company.id, company)
    }
  }

  return { presences, companies }
}

export async function loadMatches(
  supabase: Client,
  ownerId: string,
  objectiveId: string
): Promise<StoredMatch[]> {
  const { data, error } = await supabase
    .from('intel_matches')
    .select(MATCH_COLUMNS)
    .eq('user_id', ownerId)
    .eq('objective_id', objectiveId)
    .order('score', { ascending: false })
    .order('id', { ascending: true })

  if (error) {
    console.error('[event-intelligence] match query failed:', error.code ?? 'unknown')
    return []
  }
  return ((data ?? []) as Row[]).map(toMatch)
}

export async function loadTargets(
  supabase: Client,
  ownerId: string,
  eventId: string
): Promise<MeetingTarget[]> {
  const { data, error } = await supabase
    .from('intel_meeting_targets')
    .select(TARGET_COLUMNS)
    .eq('user_id', ownerId)
    .eq('event_id', eventId)
    .order('priority', { ascending: true })
    .order('id', { ascending: true })

  if (error) {
    console.error('[event-intelligence] target query failed:', error.code ?? 'unknown')
    return []
  }
  return ((data ?? []) as Row[]).map(toTarget)
}

/** Every fair ABC holds directory data for, with what this owner has done on it. */
export type IntelEventSummary = {
  event: IntelEvent
  exhibitors: number
  hasObjective: boolean
  matches: number
  targets: number
}

export async function loadIntelEventSummaries(
  supabase: Client,
  ownerId: string
): Promise<IntelEventSummary[]> {
  const { data: eventRows, error } = await supabase
    .from('intel_events')
    .select(EVENT_COLUMNS)
    .order('starts_on', { ascending: true, nullsFirst: false })

  if (error) {
    console.error('[event-intelligence] events query failed:', error.code ?? 'unknown')
    return []
  }

  const events = ((eventRows ?? []) as Row[]).map(toEvent)
  if (events.length === 0) return []

  const [presences, objectives, matches, targets] = await Promise.all([
    supabase.from('intel_company_presences').select('event_id').eq('status', 'listed'),
    supabase.from('intel_event_objectives').select('id, event_id').eq('user_id', ownerId),
    supabase.from('intel_matches').select('objective_id').eq('user_id', ownerId),
    supabase.from('intel_meeting_targets').select('event_id').eq('user_id', ownerId),
  ])

  const countBy = (rows: unknown, key: string) => {
    const counts = new Map<string, number>()
    for (const row of ((rows ?? []) as Row[])) {
      const id = String(row[key])
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    return counts
  }

  const exhibitorCounts = countBy(presences.data, 'event_id')
  const targetCounts = countBy(targets.data, 'event_id')
  const objectiveByEvent = new Map<string, string>()
  for (const row of ((objectives.data ?? []) as Row[])) {
    objectiveByEvent.set(String(row.event_id), String(row.id))
  }
  const matchCounts = countBy(matches.data, 'objective_id')

  return events.map((event) => {
    const objectiveId = objectiveByEvent.get(event.id)
    return {
      event,
      exhibitors: exhibitorCounts.get(event.id) ?? 0,
      hasObjective: Boolean(objectiveId),
      matches: objectiveId ? matchCounts.get(objectiveId) ?? 0 : 0,
      targets: targetCounts.get(event.id) ?? 0,
    }
  })
}

/**
 * Meetings this owner has already recorded at this fair.
 *
 * The bridge between the two halves of ABC, and it goes one way only: this
 * finds encounters that already exist so the owner can point a target at one.
 * Nothing here creates an encounter, and nothing here creates a contact. A
 * target is a plan; an encounter is a thing that happened; only the scan, QR,
 * exchange and manual paths make the second, exactly as they did before this
 * feature existed.
 *
 * Which encounters belong to this fair is decided by the same rule the Event
 * Workspace already uses — the event text people actually type, slugged — so
 * an encounter saved as "ABC Industrial Future Expo 2026" is offered against
 * the imported event of that name without anything having been migrated or
 * back-filled to connect them.
 */
export type LinkableEncounter = {
  id: string
  contactId: string
  personName: string | null
  company: string | null
  metAt: string | null
  event: string | null
}

export async function loadLinkableEncounters(
  supabase: Client,
  ownerId: string,
  eventKey: string
): Promise<LinkableEncounter[]> {
  const { data, error } = await supabase
    .from('contact_encounters')
    .select('id, contact_id, met_at, event, event_normalized')
    .eq('user_id', ownerId)
    .order('met_at', { ascending: false })
    .limit(500)

  if (error) {
    console.error('[event-intelligence] encounter query failed:', error.code ?? 'unknown')
    return []
  }

  const rows = ((data ?? []) as Row[]).filter((row) => {
    const name = eventDisplayName({
      event: str(row.event),
      eventNormalized: str(row.event_normalized),
    })
    return name ? eventKeyFromName(name) === eventKey : false
  })

  if (rows.length === 0) return []

  const contactIds = Array.from(new Set(rows.map((row) => String(row.contact_id))))
  const people = new Map<string, { name: string | null; company: string | null }>()

  for (let i = 0; i < contactIds.length; i += 200) {
    const { data: contacts, error: contactError } = await supabase
      .from('scanned_contacts')
      .select('id, name, company')
      .eq('user_id', ownerId)
      .in('id', contactIds.slice(i, i + 200))

    if (contactError) {
      console.error('[event-intelligence] contact query failed:', contactError.code ?? 'unknown')
      continue
    }
    for (const row of (contacts ?? []) as Row[]) {
      people.set(String(row.id), { name: str(row.name), company: str(row.company) })
    }
  }

  return rows.map((row) => {
    const person = people.get(String(row.contact_id))
    return {
      id: String(row.id),
      contactId: String(row.contact_id),
      personName: person?.name ?? null,
      company: person?.company ?? null,
      metAt: str(row.met_at),
      event: str(row.event) ?? str(row.event_normalized),
    }
  })
}
