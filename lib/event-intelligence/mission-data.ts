import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerComponentClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildEventWorkspace, type GroupingInput, type WorkspaceEncounter, type WorkspacePerson } from '@/lib/events/workspace'
import {
  currentOwnerId,
  EVENT_COLUMNS,
  loadIntentProfile,
  MATCH_COLUMNS,
  OBJECTIVE_COLUMNS,
  PRESENCE_COLUMNS,
  TARGET_COLUMNS,
  toCompany,
  toEvent,
  toMatch,
  toObjective,
  toPresence,
  toTarget,
} from '@/lib/event-intelligence/data'
import {
  missionHomeSummary,
  missionSetupDefaults,
  nextMissionAction,
  selectPrimaryMission,
  type MissionAction,
  type MissionFacts,
  type MissionHomeSummary,
  type MissionMeetingFact,
  type MissionOpportunityFact,
  type MissionSetupInput,
  type MissionTargetFact,
} from '@/lib/event-intelligence/mission'
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
 * Reading the facts a mission is derived from.
 *
 * Nothing here decides anything — `mission.ts` does. This only reads rows that
 * already exist: the objective (a mission *is* an objective for one fair), the
 * matches and targets, the meeting requests, and the meetings the owner
 * recorded at that fair. No mission state is stored anywhere; delete this file's
 * output and the next read rebuilds it from the same rows.
 *
 * Every owner-scoped query filters on `user_id` as well as relying on RLS, and
 * the owner id always comes from the session.
 *
 * Meetings are read through the Event Workspace's own grouping
 * (`buildEventWorkspace`), so "a meeting at this fair", its follow-up state and
 * its CRM state mean exactly what they mean on the Events screen.
 */

type Client = SupabaseClient | ReturnType<typeof createServerComponentClient>
type Row = Record<string, unknown>

const str = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || null
}

function chunk<T>(values: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size))
  return out
}

/** How many top opportunities the mission keeps in hand. It only ever shows one. */
const OPPORTUNITY_LIMIT = 12
const PAGE = 1000
const MAX_PAGES = 10

/** Listed exhibitors ABC holds for one fair — an exact count, no rows. */
export async function listedExhibitors(supabase: Client, eventId: string): Promise<number> {
  const { count, error } = await supabase
    .from('intel_company_presences')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('status', 'listed')
  if (error) {
    console.error('[event-intelligence/mission] exhibitor count failed:', error.code ?? 'unknown')
    return 0
  }
  return count ?? 0
}

/** Distinct companies with a match — paged, because a big fair has thousands. */
async function matchedCompanies(supabase: Client, ownerId: string, objectiveId: string): Promise<number> {
  const presences = new Set<string>()
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE
    const { data, error } = await supabase
      .from('intel_matches')
      .select('presence_id')
      .eq('user_id', ownerId)
      .eq('objective_id', objectiveId)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('[event-intelligence/mission] match count failed:', error.code ?? 'unknown')
      break
    }
    const rows = (data ?? []) as Row[]
    for (const row of rows) presences.add(String(row.presence_id))
    if (rows.length < PAGE) break
  }
  return presences.size
}

async function matchesById(supabase: Client, ownerId: string, ids: string[]): Promise<Map<string, StoredMatch>> {
  const out = new Map<string, StoredMatch>()
  for (const part of chunk(ids, 200)) {
    const { data, error } = await supabase.from('intel_matches').select(MATCH_COLUMNS).eq('user_id', ownerId).in('id', part)
    if (error) {
      console.error('[event-intelligence/mission] match query failed:', error.code ?? 'unknown')
      continue
    }
    for (const row of (data ?? []) as Row[]) {
      const match = toMatch(row)
      out.set(match.id, match)
    }
  }
  return out
}

async function topUnsavedMatches(
  supabase: Client,
  ownerId: string,
  objectiveId: string,
  savedMatchIds: string[]
): Promise<StoredMatch[]> {
  // Saved matches are dropped here rather than with a `not.in` filter, whose URL
  // grows with every saved target; asking for that many extra rows is enough.
  const { data, error } = await supabase
    .from('intel_matches')
    .select(MATCH_COLUMNS)
    .eq('user_id', ownerId)
    .eq('objective_id', objectiveId)
    .order('score', { ascending: false })
    .order('id', { ascending: true })
    .limit(OPPORTUNITY_LIMIT + savedMatchIds.length)
  if (error) {
    console.error('[event-intelligence/mission] opportunity query failed:', error.code ?? 'unknown')
    return []
  }
  const saved = new Set(savedMatchIds)
  return ((data ?? []) as Row[])
    .map(toMatch)
    .filter((match) => !saved.has(match.id))
    .slice(0, OPPORTUNITY_LIMIT)
}

async function presencesAndCompanies(
  supabase: Client,
  presenceIds: string[]
): Promise<{ presences: Map<string, IntelPresence>; companies: Map<string, IntelCompany> }> {
  const presences = new Map<string, IntelPresence>()
  const companies = new Map<string, IntelCompany>()
  for (const part of chunk(presenceIds, 200)) {
    const { data, error } = await supabase.from('intel_company_presences').select(PRESENCE_COLUMNS).in('id', part)
    if (error) {
      console.error('[event-intelligence/mission] presence query failed:', error.code ?? 'unknown')
      continue
    }
    for (const row of (data ?? []) as Row[]) {
      const presence = toPresence(row)
      presences.set(presence.id, presence)
    }
  }
  const companyIds = Array.from(new Set([...presences.values()].map((p) => p.companyId)))
  for (const part of chunk(companyIds, 200)) {
    const { data, error } = await supabase
      .from('intel_companies')
      .select('id, display_name, name_normalized, website_domain, country, description_public, categories, merge_candidate_of')
      .in('id', part)
    if (error) {
      console.error('[event-intelligence/mission] company query failed:', error.code ?? 'unknown')
      continue
    }
    for (const row of (data ?? []) as Row[]) {
      const company = toCompany(row)
      companies.set(company.id, company)
    }
  }
  return { presences, companies }
}

type BriefRow = { status: 'draft' | 'ready' | 'shared'; topic: string | null; productId: string | null }

async function briefsByTarget(supabase: Client, ownerId: string, targetIds: string[]): Promise<Map<string, BriefRow>> {
  const out = new Map<string, BriefRow>()
  for (const part of chunk(targetIds, 200)) {
    const { data, error } = await supabase
      .from('intel_meeting_briefs')
      .select('target_id, status, topic, product_id')
      .eq('user_id', ownerId)
      .in('target_id', part)
    if (error) {
      console.error('[event-intelligence/mission] brief query failed:', error.code ?? 'unknown')
      continue
    }
    for (const row of (data ?? []) as Row[]) {
      out.set(String(row.target_id), {
        status: row.status as BriefRow['status'],
        topic: str(row.topic),
        productId: str(row.product_id),
      })
    }
  }
  return out
}

async function productNames(supabase: Client, ownerId: string, ids?: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  let query = supabase.from('intel_products').select('id, name').eq('user_id', ownerId).order('sort_order', { ascending: true })
  if (ids) {
    if (ids.length === 0) return out
    query = query.in('id', ids.slice(0, 200))
  }
  const { data, error } = await query
  if (error) {
    console.error('[event-intelligence/mission] product query failed:', error.code ?? 'unknown')
    return out
  }
  for (const row of (data ?? []) as Row[]) out.set(String(row.id), String(row.name))
  return out
}

function opportunityFact(
  match: StoredMatch,
  presences: Map<string, IntelPresence>,
  companies: Map<string, IntelCompany>
): MissionOpportunityFact | null {
  const presence = presences.get(match.presenceId)
  if (!presence) return null
  const company = companies.get(presence.companyId)
  const categories = [...new Set([...(company?.categories ?? []), ...presence.eventCategories])].slice(0, 3)
  return {
    matchId: match.id,
    company: presence.exhibitorDisplayName ?? company?.displayName ?? 'Unnamed exhibitor',
    hall: presence.hall,
    stand: presence.stand,
    matchType: match.matchType,
    score: match.score,
    why: match.reasons[0]?.statement ?? null,
    listing: [...categories, ...(company?.country ? [company.country] : [])],
  }
}

// ── Meetings: the Event Workspace's rules, and the CRM evidence ──

async function ownerEncounters(supabase: Client, ownerId: string): Promise<WorkspaceEncounter[]> {
  const rows: WorkspaceEncounter[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE
    const { data, error } = await supabase
      .from('contact_encounters')
      .select('id, contact_id, met_at, event, event_normalized, discussed, next_action, follow_up_at')
      .eq('user_id', ownerId)
      .order('met_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('[event-intelligence/mission] encounter query failed:', error.code ?? 'unknown')
      break
    }
    const batch = (data ?? []) as Row[]
    for (const row of batch) {
      rows.push({
        id: String(row.id),
        contactId: String(row.contact_id),
        metAt: str(row.met_at),
        event: str(row.event),
        eventNormalized: str(row.event_normalized),
        discussed: str(row.discussed),
        nextAction: str(row.next_action),
        followUpAt: str(row.follow_up_at),
      })
    }
    if (batch.length < PAGE) break
  }
  return rows
}

async function people(supabase: Client, ownerId: string, contactIds: string[]): Promise<Map<string, WorkspacePerson>> {
  const out = new Map<string, WorkspacePerson>()
  for (const part of chunk(contactIds, 200)) {
    const { data, error } = await supabase
      .from('scanned_contacts')
      .select('id, name, company, role')
      .eq('user_id', ownerId)
      .in('id', part)
    if (error) {
      console.error('[event-intelligence/mission] contact query failed:', error.code ?? 'unknown')
      continue
    }
    for (const row of (data ?? []) as Row[]) {
      out.set(String(row.id), { id: String(row.id), name: str(row.name), company: str(row.company), role: str(row.role) })
    }
  }
  return out
}

/**
 * Whether a CRM is connected, and which meetings reached one.
 *
 * `crm_connections` and `crm_object_mappings` are server-only tables: the
 * signed-in session has no privilege on them at all (their migrations revoke
 * it), so a read through the session is refused rather than answered. This
 * reads them with the service role — like the Integrations screen does — for
 * the session owner only, and returns nothing but a flag and a set of meeting
 * ids. No token, no remote id and no mapping row leaves this function.
 *
 * If the service role is not configured, the answer is "no CRM", so the mission
 * never nags anybody to send something to a CRM it cannot see.
 */
async function crmEvidence(
  ownerId: string,
  encounterIds: string[]
): Promise<{ connected: boolean; synced: Map<string, string[]> }> {
  const synced = new Map<string, string[]>()
  try {
    const service = createServiceClient()
    const { data: connections, error } = await service.from('crm_connections').select('provider').eq('user_id', ownerId)
    if (error) throw error
    const connected = (connections ?? []).length > 0

    for (const part of chunk(encounterIds, 200)) {
      const { data, error: mappingError } = await service
        .from('crm_object_mappings')
        .select('local_object_id, provider')
        .eq('user_id', ownerId)
        .eq('local_object_type', 'encounter')
        .in('local_object_id', part)
      if (mappingError) throw mappingError
      for (const row of (data ?? []) as Row[]) {
        const id = String(row.local_object_id)
        synced.set(id, [...(synced.get(id) ?? []), String(row.provider)])
      }
    }
    return { connected, synced }
  } catch (err) {
    console.error('[event-intelligence/mission] crm evidence unavailable:', (err as { code?: string })?.code ?? 'unknown')
    return { connected: false, synced }
  }
}

async function meetingsByEvent(
  supabase: Client,
  ownerId: string,
  eventKeys: string[],
  now: Date
): Promise<{ byEvent: Map<string, MissionMeetingFact[]>; crmConnected: boolean }> {
  const byEvent = new Map<string, MissionMeetingFact[]>()
  if (eventKeys.length === 0) return { byEvent, crmConnected: false }

  const encounters = await ownerEncounters(supabase, ownerId)
  const input: GroupingInput = { encounters, people: new Map(), crmByEncounter: new Map(), now }

  // Group first with no people and no CRM, only to learn which encounters are at these fairs.
  const relevant = new Set<string>()
  for (const key of eventKeys) {
    for (const row of buildEventWorkspace(input, key)?.encounters ?? []) relevant.add(row.encounterId)
  }
  const atFairs = encounters.filter((e) => relevant.has(e.id))
  if (atFairs.length === 0) return { byEvent, crmConnected: false }

  const [peopleMap, crm] = await Promise.all([
    people(supabase, ownerId, Array.from(new Set(atFairs.map((e) => e.contactId)))),
    crmEvidence(ownerId, atFairs.map((e) => e.id)),
  ])

  const full: GroupingInput = { encounters: atFairs, people: peopleMap, crmByEncounter: crm.synced, now }
  for (const key of eventKeys) {
    const workspace = buildEventWorkspace(full, key)
    byEvent.set(
      key,
      (workspace?.encounters ?? []).map((row) => ({
        encounterId: row.encounterId,
        contactId: row.person.id,
        personName: row.person.name,
        company: row.person.company,
        metAt: row.metAt,
        discussed: row.discussed,
        nextAction: row.nextAction,
        followUp: row.followUp,
        followUpAt: row.followUpAt,
        inCrm: row.crm === 'synced',
      }))
    )
  }
  return { byEvent, crmConnected: crm.connected }
}

// ── Missions ─────────────────────────────────────────────────────

export type LoadedMission = {
  facts: MissionFacts
  action: MissionAction
  objective: EventObjective
  event: IntelEvent
}

/**
 * Every mission the owner has — one per fair they set an objective for — with
 * its facts and its next action. `eventId` narrows it to one fair.
 */
export async function loadMissions(
  supabase: Client,
  ownerId: string,
  today: string,
  options: { eventId?: string; now?: Date } = {}
): Promise<{ missions: LoadedMission[]; profile: CompanyIntentProfile | null }> {
  let objectiveQuery = supabase.from('intel_event_objectives').select(OBJECTIVE_COLUMNS).eq('user_id', ownerId)
  if (options.eventId) objectiveQuery = objectiveQuery.eq('event_id', options.eventId)

  const [{ data: objectiveRows, error }, profile] = await Promise.all([objectiveQuery, loadIntentProfile(supabase, ownerId)])
  if (error) {
    console.error('[event-intelligence/mission] objective query failed:', error.code ?? 'unknown')
    return { missions: [], profile }
  }

  const objectives = ((objectiveRows ?? []) as Row[]).map(toObjective)
  if (objectives.length === 0) return { missions: [], profile }

  const { data: eventRows, error: eventError } = await supabase
    .from('intel_events')
    .select(EVENT_COLUMNS)
    .in('id', objectives.map((o) => o.eventId))
  if (eventError) {
    console.error('[event-intelligence/mission] event query failed:', eventError.code ?? 'unknown')
    return { missions: [], profile }
  }
  const events = new Map(((eventRows ?? []) as Row[]).map(toEvent).map((e) => [e.id, e]))

  const setupComplete = Boolean(
    profile && (profile.whatWeDo || profile.whatWeSell.length > 0 || profile.whatWeBuy.length > 0)
  )

  const perMission = await Promise.all(
    objectives
      .filter((objective) => events.has(objective.eventId))
      .map(async (objective) => {
        const event = events.get(objective.eventId) as IntelEvent

        const [exhibitors, matched, targetRows] = await Promise.all([
          listedExhibitors(supabase, event.id),
          matchedCompanies(supabase, ownerId, objective.id),
          supabase
            .from('intel_meeting_targets')
            .select(TARGET_COLUMNS)
            .eq('user_id', ownerId)
            .eq('event_id', event.id)
            .order('priority', { ascending: true })
            .order('id', { ascending: true }),
        ])
        if (targetRows.error) {
          console.error('[event-intelligence/mission] target query failed:', targetRows.error.code ?? 'unknown')
        }
        const targets: MeetingTarget[] = ((targetRows.data ?? []) as Row[]).map(toTarget)

        const [opportunities, targetMatches, briefs] = await Promise.all([
          topUnsavedMatches(supabase, ownerId, objective.id, targets.map((t) => t.matchId)),
          matchesById(supabase, ownerId, targets.map((t) => t.matchId)),
          briefsByTarget(supabase, ownerId, targets.map((t) => t.id)),
        ])

        const presenceIds = Array.from(
          new Set([...opportunities.map((m) => m.presenceId), ...targets.map((t) => t.presenceId)])
        )
        const [{ presences, companies }, products] = await Promise.all([
          presencesAndCompanies(supabase, presenceIds),
          productNames(
            supabase,
            ownerId,
            Array.from(new Set([...briefs.values()].map((b) => b.productId).filter((id): id is string => Boolean(id))))
          ),
        ])

        const targetFacts: MissionTargetFact[] = []
        for (const target of targets) {
          const match = targetMatches.get(target.matchId)
          if (!match) continue
          const base = opportunityFact(match, presences, companies)
          if (!base) continue
          const brief = briefs.get(target.id)
          targetFacts.push({
            ...base,
            targetId: target.id,
            status: target.status,
            priority: target.priority,
            met: Boolean(target.metEncounterId),
            brief: brief
              ? { status: brief.status, topic: brief.topic, productName: brief.productId ? products.get(brief.productId) ?? null : null }
              : null,
          })
        }

        return {
          objective,
          event,
          exhibitors,
          matched,
          opportunities: opportunities
            .map((m) => opportunityFact(m, presences, companies))
            .filter((o): o is MissionOpportunityFact => o !== null),
          targets: targetFacts,
        }
      })
  )

  const { byEvent, crmConnected } = await meetingsByEvent(
    supabase,
    ownerId,
    perMission.map((m) => m.event.eventKey),
    options.now ?? new Date()
  )

  const missions = perMission.map((m): LoadedMission => {
    const facts: MissionFacts = {
      event: {
        key: m.event.eventKey,
        name: m.event.name,
        startsOn: m.event.startsOn,
        endsOn: m.event.endsOn,
        city: m.event.city,
        venue: m.event.venue,
      },
      today,
      setupComplete,
      exhibitors: m.exhibitors,
      matchedCompanies: m.matched,
      opportunities: m.opportunities,
      targets: m.targets,
      meetings: byEvent.get(m.event.eventKey) ?? [],
      crmConnected,
    }
    return { facts, action: nextMissionAction(facts), objective: m.objective, event: m.event }
  })

  return { missions, profile }
}

// ── Setup options ────────────────────────────────────────────────

export type MissionSetupOption = {
  key: string
  name: string
  startsOn: string | null
  endsOn: string | null
  city: string | null
  exhibitors: number
  hasMission: boolean
}

export type MissionSetupContext = {
  /** Fairs ABC holds an exhibitor list for that are not over yet. */
  events: MissionSetupOption[]
  defaults: MissionSetupInput
  profile: CompanyIntentProfile | null
  companyName: string | null
}

export async function loadMissionSetup(
  supabase: Client,
  ownerId: string,
  today: string,
  profile?: CompanyIntentProfile | null
): Promise<MissionSetupContext> {
  const [{ data: eventRows, error }, owned, resolvedProfile, products, account] = await Promise.all([
    supabase.from('intel_events').select(EVENT_COLUMNS).order('starts_on', { ascending: true, nullsFirst: false }),
    supabase.from('intel_event_objectives').select('event_id').eq('user_id', ownerId),
    profile === undefined ? loadIntentProfile(supabase, ownerId) : Promise.resolve(profile),
    productNames(supabase, ownerId),
    supabase.from('abc_profiles').select('company').eq('id', ownerId).maybeSingle(),
  ])

  if (error) console.error('[event-intelligence/mission] event list failed:', error.code ?? 'unknown')
  const withMission = new Set(((owned.data ?? []) as Row[]).map((row) => String(row.event_id)))

  const notOver = ((eventRows ?? []) as Row[])
    .map(toEvent)
    .filter((event) => !event.endsOn || event.endsOn >= today)
    .slice(0, 50)

  const counts = await Promise.all(notOver.map((event) => listedExhibitors(supabase, event.id)))

  const events = notOver
    .map((event, i) => ({
      key: event.eventKey,
      name: event.name,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      city: event.city,
      exhibitors: counts[i],
      hasMission: withMission.has(event.id),
    }))
    .filter((event) => event.exhibitors > 0)

  return {
    events,
    defaults: missionSetupDefaults(resolvedProfile, null, [...products.values()]),
    profile: resolvedProfile,
    companyName: str((account.data as Row | null)?.company),
  }
}

// ── Home ─────────────────────────────────────────────────────────

export type HomeMission =
  | { kind: 'mission'; summary: MissionHomeSummary; missionCount: number }
  | { kind: 'setup'; setup: MissionSetupContext; missionCount: number }

/**
 * What the Home card needs, and nothing more. Called only when the feature is
 * on; with it off, Home never reaches this and renders as it always has.
 */
export async function loadHomeMission(today: string, now: Date = new Date()): Promise<HomeMission | null> {
  const supabase = createServerComponentClient()
  const ownerId = await currentOwnerId(supabase)
  if (!ownerId) return null

  const { missions, profile } = await loadMissions(supabase, ownerId, today, { now })
  const primary = selectPrimaryMission(missions.map((m) => m.facts))

  if (primary) {
    const loaded = missions.find((m) => m.facts === primary) as LoadedMission
    return { kind: 'mission', summary: missionHomeSummary(primary, loaded.action), missionCount: missions.length }
  }

  return { kind: 'setup', setup: await loadMissionSetup(supabase, ownerId, today, profile), missionCount: missions.length }
}
