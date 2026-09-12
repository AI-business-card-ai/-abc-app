import { createServerComponentClient } from '@/lib/supabase-server'
import {
  buildEventWorkspace,
  groupEncountersIntoEvents,
  type EventSummary,
  type EventWorkspace,
  type GroupingInput,
  type WorkspaceEncounter,
  type WorkspacePerson,
} from '@/lib/events/workspace'

/**
 * Reading the owner's event workspaces.
 *
 * Three queries, whatever the size of the account: the meetings, the people they
 * were with, and the CRM mappings for those meetings. Never one query per
 * encounter — a fair is hundreds of rows and a screen that costs a round trip
 * each would be unusable at exactly the moment it matters.
 *
 * Every query filters on `user_id` as well as relying on row-level security.
 * The belt is RLS; this is the braces, and it is what makes the guarantee
 * readable in the file rather than only in the database.
 */

/** PostgREST caps a response at 1000 rows, so ask in pages rather than hope. */
const PAGE = 1000
const MAX_PAGES = 25

type Row = Record<string, unknown>
const str = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || null
}

async function fetchAllEncounters(
  supabase: ReturnType<typeof createServerComponentClient>,
  ownerId: string
): Promise<WorkspaceEncounter[]> {
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
      console.error('[events] encounter query failed:', error.code ?? 'unknown')
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

/** `.in()` on thousands of ids is one enormous URL; ask in chunks instead. */
function chunk<T>(values: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size))
  return out
}

async function fetchPeople(
  supabase: ReturnType<typeof createServerComponentClient>,
  ownerId: string,
  contactIds: string[]
): Promise<Map<string, WorkspacePerson>> {
  const people = new Map<string, WorkspacePerson>()

  for (const ids of chunk(contactIds, 200)) {
    const { data, error } = await supabase
      .from('scanned_contacts')
      .select('id, name, company, role')
      .eq('user_id', ownerId)
      .in('id', ids)

    if (error) {
      console.error('[events] contact query failed:', error.code ?? 'unknown')
      continue
    }

    for (const row of (data ?? []) as Row[]) {
      people.set(String(row.id), {
        id: String(row.id),
        name: str(row.name),
        company: str(row.company),
        role: str(row.role),
      })
    }
  }

  return people
}

/**
 * Which meetings reached a CRM, and through which providers.
 *
 * `local_object_type = 'encounter'` is the meeting itself — every provider
 * writes it when the push succeeds. A contact mapping is deliberately not read
 * here: it says the person exists in the CRM, not that this meeting was sent.
 */
async function fetchCrmByEncounter(
  supabase: ReturnType<typeof createServerComponentClient>,
  ownerId: string,
  encounterIds: string[]
): Promise<Map<string, string[]>> {
  const byEncounter = new Map<string, string[]>()

  for (const ids of chunk(encounterIds, 200)) {
    const { data, error } = await supabase
      .from('crm_object_mappings')
      .select('local_object_id, provider')
      .eq('user_id', ownerId)
      .eq('local_object_type', 'encounter')
      .in('local_object_id', ids)

    if (error) {
      console.error('[events] crm mapping query failed:', error.code ?? 'unknown')
      continue
    }

    for (const row of (data ?? []) as Row[]) {
      const id = String(row.local_object_id)
      const provider = String(row.provider)
      const providers = byEncounter.get(id) ?? []
      if (!providers.includes(provider)) providers.push(provider)
      byEncounter.set(id, providers)
    }
  }

  return byEncounter
}

async function loadGroupingInput(): Promise<GroupingInput | null> {
  const supabase = createServerComponentClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const encounters = await fetchAllEncounters(supabase, user.id)
  if (encounters.length === 0) {
    return { encounters, people: new Map(), crmByEncounter: new Map() }
  }

  const contactIds = Array.from(new Set(encounters.map((row) => row.contactId)))
  const encounterIds = encounters.map((row) => row.id)

  const [people, crmByEncounter] = await Promise.all([
    fetchPeople(supabase, user.id, contactIds),
    fetchCrmByEncounter(supabase, user.id, encounterIds),
  ])

  return { encounters, people, crmByEncounter }
}

/** Every event this owner has met somebody at. `null` means no session. */
export async function loadEventWorkspaces(): Promise<EventSummary[] | null> {
  const input = await loadGroupingInput()
  if (!input) return null
  return groupEncountersIntoEvents(input)
}

/**
 * One workspace. `null` for no session; `undefined` for a key this owner has no
 * meetings under — which is the same answer a stranger's key gives, because the
 * rows were never theirs to match against.
 */
export async function loadEventWorkspace(
  eventKey: string
): Promise<EventWorkspace | null | undefined> {
  const input = await loadGroupingInput()
  if (!input) return null
  return buildEventWorkspace(input, eventKey) ?? undefined
}
