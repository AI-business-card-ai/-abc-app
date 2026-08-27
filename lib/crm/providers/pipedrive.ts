import { getValidPipedriveAccess } from '@/lib/crm/pipedrive-oauth'
import { extractNormalizedEmails, extractNormalizedPhones } from '@/lib/contacts/identity'
import type { ExportContact, ExportEncounter } from '@/lib/crm/types'

/**
 * Pipedrive, and the only place in ABC that knows what Pipedrive looks like.
 *
 * Endpoints are API v2. That is not a preference: Pipedrive deprecated the v1
 * equivalents of persons, organizations, activities and search, and the
 * migration window for them has already closed. v1 survives here in exactly one
 * place — `/api/v1/activityTypes`, which has no v2 replacement and was never on
 * the deprecation list.
 *
 * Every request goes to the account's own host, never a shared one. Pipedrive
 * issues a per-company `api_domain` and the token is only valid against it.
 */

const V2 = '/api/v2'

export type PipedriveError = {
  kind: 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'rate_limited' | 'server' | 'unknown'
  status: number
  /** Safe to show a person. Never the provider's raw body. */
  message: string
}

export type PipedriveResult<T> = { ok: true; data: T } | { ok: false; error: PipedriveError }

/** One place that decides what a status code means, so callers never guess. */
function classify(status: number): PipedriveError {
  if (status === 401) return { kind: 'unauthorized', status, message: 'Pipedrive rejected the connection.' }
  if (status === 403) return { kind: 'forbidden', status, message: 'This Pipedrive connection is missing a required permission.' }
  if (status === 404) return { kind: 'not_found', status, message: 'Not found in Pipedrive.' }
  if (status === 409) return { kind: 'conflict', status, message: 'Pipedrive reported a conflicting record.' }
  // Pipedrive spends a daily token budget rather than counting requests, and a
  // spent budget is a wait, not a bug. Cloudflare answers 403 for sustained
  // abuse, which `classify` deliberately keeps distinct from a scope problem
  // only insofar as both tell the owner to look at the connection.
  if (status === 429) return { kind: 'rate_limited', status, message: 'Pipedrive is rate limiting; try again shortly.' }
  if (status >= 500) return { kind: 'server', status, message: 'Pipedrive is temporarily unavailable.' }
  // The status number, and nothing more. A validation rejection is otherwise
  // indistinguishable from every other refusal, which cost a real push once.
  return { kind: 'unknown', status, message: `Pipedrive could not complete that request (${status}).` }
}

type Envelope<T> = { success?: boolean; data?: T }

/**
 * One request.
 *
 * Failures are logged as a method, a path and a status — never the response
 * body, which for this API echoes the properties that were sent, and those are
 * somebody's contact details. The path logged is the route, not the host: the
 * host identifies the customer's company.
 */
async function call<T>(
  access: { accessToken: string; apiBaseUrl: string },
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown
): Promise<PipedriveResult<T>> {
  try {
    const res = await fetch(`${access.apiBaseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${access.accessToken}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

    if (!res.ok) {
      console.error(`[pipedrive] ${method} ${path.split('?')[0]} -> ${res.status}`)
      return { ok: false, error: classify(res.status) }
    }

    const text = await res.text()
    const parsed = (text ? JSON.parse(text) : {}) as Envelope<T>
    return { ok: true, data: (parsed.data ?? {}) as T }
  } catch {
    console.error(`[pipedrive] ${method} ${path.split('?')[0]} -> request failed`)
    return { ok: false, error: { kind: 'unknown', status: 0, message: 'Could not reach Pipedrive.' } }
  }
}

export type AccessResult =
  | { ok: true; access: { accessToken: string; apiBaseUrl: string } }
  | { ok: false; needsReconnect: boolean; message: string }

/**
 * Credentials, from the canonical helper and nowhere else.
 *
 * That helper decrypts, refreshes when the token is spent, re-stores the
 * account's API host each time Pipedrive sends it, and marks the connection
 * when a refresh fails.
 */
export async function getAccess(ownerId: string): Promise<AccessResult> {
  const result = await getValidPipedriveAccess(ownerId)
  if (result.ok) {
    return { ok: true, access: { accessToken: result.accessToken, apiBaseUrl: result.apiBaseUrl } }
  }

  if (result.reason === 'not_configured') {
    return { ok: false, needsReconnect: false, message: 'Pipedrive is not configured on this server.' }
  }
  if (result.reason === 'not_connected') {
    return { ok: false, needsReconnect: true, message: 'Connect Pipedrive first.' }
  }
  return { ok: false, needsReconnect: true, message: 'Reconnect Pipedrive to continue.' }
}

type Access = { accessToken: string; apiBaseUrl: string }
type IdObject = { id?: number }

/**
 * What a search found.
 *
 * Three outcomes rather than an id-or-null, because "several records match" is
 * a real answer and not an empty one. Picking the first would file a customer's
 * meeting against whichever record happened to sort first.
 */
export type Match = { kind: 'none' } | { kind: 'one'; id: number } | { kind: 'conflict'; count: number }

type SearchResponse = { items?: { item?: { id?: number } }[] }

/**
 * An exact search, read defensively.
 *
 * `exact_match` means a full, case-insensitive equality against the term and
 * nothing looser — no prefix, no substring.
 *
 * The result list is read through both shapes Pipedrive's search has used, the
 * wrapped `items[].item.id` and a bare array of records, because the published
 * reference does not pin the envelope down and a parser that silently returned
 * "no match" would create duplicates rather than fail.
 */
async function searchExactIds(
  access: Access,
  objectPath: 'persons' | 'organizations',
  term: string,
  fields: string,
  limit: number
): Promise<PipedriveResult<number[]>> {
  const query = new URLSearchParams({
    term,
    fields,
    exact_match: 'true',
    limit: String(limit),
  })

  const res = await call<SearchResponse | IdObject[]>(access, 'GET', `${V2}/${objectPath}/search?${query.toString()}`)
  if (!res.ok) return res

  const raw = res.data
  const ids = Array.isArray(raw)
    ? raw.map((r) => r?.id)
    : (raw.items ?? []).map((entry) => entry?.item?.id)

  return { ok: true, data: ids.filter((id): id is number => typeof id === 'number') }
}

/**
 * Find a person by exact email. Two matches end the search, not start a guess.
 *
 * The search term is the first canonical address, not the raw column. An exact
 * search for "a@x.com, b@y.com" matches nobody, so a contact holding two
 * addresses would never find the person it already created and would make a
 * second one on every push — the duplicate this whole layer exists to prevent.
 */
export async function findPersonByEmail(
  access: Access,
  email: string
): Promise<PipedriveResult<Match>> {
  const [canonical] = extractNormalizedEmails(email)
  if (!canonical) return { ok: true, data: { kind: 'none' } }

  const res = await searchExactIds(access, 'persons', canonical, 'email', 2)
  if (!res.ok) return res

  const found = res.data
  if (found.length === 0) return { ok: true, data: { kind: 'none' } }
  if (found.length > 1) return { ok: true, data: { kind: 'conflict', count: found.length } }
  return { ok: true, data: { kind: 'one', id: found[0] } }
}

/**
 * How many exact-name organizations are worth inspecting.
 *
 * Truncation here fails in the safe direction. Missing a candidate means ABC
 * creates an organization that arguably already existed — a duplicate somebody
 * can merge. Inspecting fewer never causes the opposite mistake, which is
 * filing a customer's meeting under a company that is not theirs.
 */
const ORG_CANDIDATE_LIMIT = 20

/**
 * Organizations whose name is exactly this — candidates, not answers.
 *
 * Pipedrive stores a `website` on an organization but will not let you search
 * it: name, address, notes and custom fields are the searchable set. So a name
 * search is the only way to find anything, and a name is not an identity —
 * "Apex Solutions" is a dozen unrelated companies.
 *
 * What comes back is therefore a shortlist to check, never a match. The caller
 * confirms identity by domain; this function deliberately cannot.
 */
export function findOrganizationCandidatesByName(access: Access, name: string) {
  return searchExactIds(access, 'organizations', name.trim(), 'name', ORG_CANDIDATE_LIMIT)
}

type OrganizationRecord = { id?: number; website?: string | null }

/**
 * One organization's website, for confirming whether a candidate is the same
 * company. Absent is a real answer and means "cannot confirm", never "assume".
 */
export async function getOrganizationWebsite(
  access: Access,
  id: number
): Promise<PipedriveResult<string | null>> {
  const res = await call<OrganizationRecord>(access, 'GET', `${V2}/organizations/${id}`)
  if (!res.ok) return res
  return { ok: true, data: res.data.website ?? null }
}

/** Drop empty values rather than sending them as blanks. */
function nonEmpty(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(record)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'string' && !v.trim()) continue
    if (Array.isArray(v) && v.length === 0) continue
    out[k] = v
  }
  return out
}

/**
 * One array entry per real value, first one primary.
 *
 * ABC stores an email and a phone as single free-text columns, and a scanned or
 * hand-edited card can put two numbers in one of them. v2 wants an array of
 * discrete entries, so posting the raw column as a single entry produces one
 * Pipedrive phone containing two numbers — which is not a phone number.
 *
 * The splitting is ABC's own, from the Phase 5 identity helpers, because a
 * second parser for the same job is a second parser to disagree with the first.
 * Those helpers also drop fragments too short to be a real number, so nothing
 * malformed is sent.
 */
function contactEntries(values: string[]) {
  return values.map((value, index) => ({ value, primary: index === 0, label: 'work' }))
}

/**
 * What ABC sends about a person.
 *
 * No `job_title`. Pipedrive documents it — with `notes`, `birthday`,
 * `postal_address` and `im` — as available only when Contact Sync is enabled
 * for the company, and v2 validates strictly rather than ignoring what it does
 * not accept. Requiring a customer to switch on Contact Sync before they can
 * export a contact would be ABC's problem leaking into their configuration, so
 * the job title stays canonical in ABC and simply is not sent here.
 */
function personProperties(contact: ExportContact, orgId: number | null) {
  const name =
    contact.fullName || [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || contact.email

  return nonEmpty({
    name,
    // v2 replaced the flat `email`/`phone` strings with labelled arrays.
    emails: contactEntries(extractNormalizedEmails(contact.email)),
    phones: contactEntries(extractNormalizedPhones(contact.phone)),
    org_id: orgId,
  })
}

export async function createPerson(
  access: Access,
  contact: ExportContact,
  orgId: number | null
): Promise<PipedriveResult<number>> {
  const res = await call<IdObject>(access, 'POST', `${V2}/persons`, personProperties(contact, orgId))
  if (!res.ok) return res
  if (typeof res.data.id !== 'number') {
    return { ok: false, error: { kind: 'unknown', status: 0, message: 'Pipedrive did not return a person id.' } }
  }
  return { ok: true, data: res.data.id }
}

/**
 * Attach an existing person to an organization.
 *
 * Pipedrive models the relationship as a field on the person, so there is no
 * association to create and nothing to duplicate — writing the same `org_id`
 * twice is the same person with the same employer. Building an association
 * subsystem on top of that would be inventing work the data model already did.
 */
export async function setPersonOrganization(
  access: Access,
  personId: number,
  orgId: number
): Promise<PipedriveResult<number>> {
  const res = await call<IdObject>(access, 'PATCH', `${V2}/persons/${personId}`, { org_id: orgId })
  return res.ok ? { ok: true, data: personId } : res
}

export async function createOrganization(
  access: Access,
  args: { name: string; website: string | null }
): Promise<PipedriveResult<number>> {
  // The website is written even though it cannot be searched. It is true, it is
  // useful to whoever opens the record, and storing it costs nothing.
  const res = await call<IdObject>(access, 'POST', `${V2}/organizations`, nonEmpty({
    name: args.name,
    website: args.website,
  }))
  if (!res.ok) return res
  if (typeof res.data.id !== 'number') {
    return { ok: false, error: { kind: 'unknown', status: 0, message: 'Pipedrive did not return an organization id.' } }
  }
  return { ok: true, data: res.data.id }
}

type ActivityType = { key_string?: string; active_flag?: boolean }

/**
 * The account's key for an activity type, or null.
 *
 * Activity types are per-company: they can be renamed, added to, and deleted.
 * `meeting` and `task` exist in a default account, but hard-coding them would
 * turn somebody's tidied-up configuration into a failed export. So the account
 * is asked, and if the preferred type is missing the activity is created
 * without a type rather than with an invented one — Pipedrive then applies the
 * account's own default, which is a better guess than any ABC could make.
 *
 * No type is ever created. Adding "ABC Meeting" to a customer's configuration
 * because ours did not fit is not a repair, it is litter.
 */
export async function findActivityTypeKey(
  access: Access,
  preferred: string
): Promise<string | null> {
  const res = await call<ActivityType[]>(access, 'GET', '/api/v1/activityTypes')
  if (!res.ok || !Array.isArray(res.data)) return null

  const match = res.data.find(
    (t) => t?.key_string === preferred && t?.active_flag !== false
  )
  return match?.key_string ?? null
}

/**
 * A moment, in the two fields Pipedrive wants it in.
 *
 * `due_date` is YYYY-MM-DD and `due_time` is HH:MM, both UTC. Splitting an
 * instant this way loses the seconds and nothing else that matters for a
 * meeting.
 */
function dueParts(iso: string): { due_date: string; due_time: string } | null {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const stamp = at.toISOString()
  return { due_date: stamp.slice(0, 10), due_time: stamp.slice(11, 16) }
}

function displayName(contact: ExportContact): string {
  return (
    contact.fullName ||
    [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() ||
    'this contact'
  )
}

/**
 * The meeting, built only from what the encounter actually holds.
 *
 * An empty line is left out rather than filled in: writing "no notes" into
 * somebody's CRM is writing a claim they did not make. The time is the
 * encounter's own `met_at`, not when the card was scanned.
 *
 * Marked done, because it is a record of a meeting that happened — an open
 * activity dated in the past would sit in the owner's overdue list for ever.
 */
function meetingProperties(
  contact: ExportContact,
  encounter: ExportEncounter,
  typeKey: string | null,
  personId: number,
  orgId: number | null
) {
  const who = displayName(contact)
  const lines: string[] = []
  if (encounter.event) lines.push(`Event: ${encounter.event}`)
  if (encounter.discussed) lines.push(`Discussed: ${encounter.discussed}`)
  if (encounter.nextAction) lines.push(`Next action: ${encounter.nextAction}`)

  return nonEmpty({
    subject: encounter.event ? `Met ${who} — ${encounter.event}` : `Met ${who}`,
    type: typeKey,
    ...(dueParts(encounter.metAt) ?? {}),
    person_id: personId,
    org_id: orgId,
    note: lines.join('\n') || null,
    done: true,
  })
}

export async function createMeetingActivity(
  access: Access,
  contact: ExportContact,
  encounter: ExportEncounter,
  typeKey: string | null,
  personId: number,
  orgId: number | null
): Promise<PipedriveResult<number>> {
  const res = await call<IdObject>(
    access,
    'POST',
    `${V2}/activities`,
    meetingProperties(contact, encounter, typeKey, personId, orgId)
  )
  if (!res.ok) return res
  if (typeof res.data.id !== 'number') {
    return { ok: false, error: { kind: 'unknown', status: 0, message: 'Pipedrive did not return an activity id.' } }
  }
  return { ok: true, data: res.data.id }
}

/** Revise the activity ABC already created, rather than adding a second one. */
export async function updateMeetingActivity(
  access: Access,
  remoteId: number,
  contact: ExportContact,
  encounter: ExportEncounter,
  typeKey: string | null,
  personId: number,
  orgId: number | null
): Promise<PipedriveResult<number>> {
  const res = await call<IdObject>(
    access,
    'PATCH',
    `${V2}/activities/${remoteId}`,
    meetingProperties(contact, encounter, typeKey, personId, orgId)
  )
  return res.ok ? { ok: true, data: remoteId } : res
}

/**
 * The follow-up, from the promise that was actually made.
 *
 * When a next action was recorded it becomes the subject verbatim. When only a
 * date was set, the subject names who to follow up with and stops there — a
 * truthful placeholder rather than an invented commitment.
 *
 * Left open, unlike the meeting: this one is the thing still to do.
 */
function followUpProperties(
  contact: ExportContact,
  encounter: ExportEncounter,
  typeKey: string | null,
  personId: number,
  orgId: number | null
) {
  const who = displayName(contact)

  return nonEmpty({
    subject: encounter.nextAction || `Follow up with ${who}`,
    type: typeKey,
    ...(encounter.followUpAt ? (dueParts(encounter.followUpAt) ?? {}) : {}),
    person_id: personId,
    org_id: orgId,
    note: encounter.discussed ? `From your meeting: ${encounter.discussed}` : null,
    done: false,
  })
}

export async function createFollowUpActivity(
  access: Access,
  contact: ExportContact,
  encounter: ExportEncounter,
  typeKey: string | null,
  personId: number,
  orgId: number | null
): Promise<PipedriveResult<number>> {
  const res = await call<IdObject>(
    access,
    'POST',
    `${V2}/activities`,
    followUpProperties(contact, encounter, typeKey, personId, orgId)
  )
  if (!res.ok) return res
  if (typeof res.data.id !== 'number') {
    return { ok: false, error: { kind: 'unknown', status: 0, message: 'Pipedrive did not return an activity id.' } }
  }
  return { ok: true, data: res.data.id }
}

export async function updateFollowUpActivity(
  access: Access,
  remoteId: number,
  contact: ExportContact,
  encounter: ExportEncounter,
  typeKey: string | null,
  personId: number,
  orgId: number | null
): Promise<PipedriveResult<number>> {
  const res = await call<IdObject>(
    access,
    'PATCH',
    `${V2}/activities/${remoteId}`,
    followUpProperties(contact, encounter, typeKey, personId, orgId)
  )
  return res.ok ? { ok: true, data: remoteId } : res
}
