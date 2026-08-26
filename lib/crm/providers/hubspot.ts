import { getValidHubSpotAccessToken } from '@/lib/crm/hubspot-oauth'
import type { ExportContact, ExportEncounter } from '@/lib/crm/types'

/**
 * HubSpot, and the only place in ABC that knows what HubSpot looks like.
 *
 * Endpoints are the current dated API — `/crm/objects/2026-03/…` — matching the
 * OAuth endpoints Phase 7A moved to. The v1 generation is deprecated and stops
 * working in February 2027, so nothing here uses it.
 *
 * Associations go through the *default* endpoint rather than a labelled one.
 * That endpoint is a PUT, documented as idempotent, and takes no
 * associationTypeId — which matters because those numeric ids differ per object
 * pair, are not fully documented for every pair, and a wrong one silently
 * associates the wrong kind of thing. Not hard-coding a number we cannot verify
 * is worth more than the label would be.
 */

const BASE = 'https://api.hubapi.com'
const V = '2026-03'

export type HubSpotError = {
  kind: 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'rate_limited' | 'server' | 'unknown'
  status: number
  /** Safe to show a person. Never the provider's raw body. */
  message: string
}

export type HubSpotResult<T> = { ok: true; data: T } | { ok: false; error: HubSpotError }

/** One place that decides what a status code means, so callers never guess. */
function classify(status: number): HubSpotError {
  if (status === 401) return { kind: 'unauthorized', status, message: 'HubSpot rejected the connection.' }
  if (status === 403) return { kind: 'forbidden', status, message: 'This HubSpot connection is missing a required permission.' }
  if (status === 404) return { kind: 'not_found', status, message: 'Not found in HubSpot.' }
  if (status === 409) return { kind: 'conflict', status, message: 'HubSpot reported a conflicting record.' }
  if (status === 429) return { kind: 'rate_limited', status, message: 'HubSpot is rate limiting; try again shortly.' }
  if (status >= 500) return { kind: 'server', status, message: 'HubSpot is temporarily unavailable.' }
  return { kind: 'unknown', status, message: 'HubSpot could not complete that request.' }
}

/**
 * One request.
 *
 * Failures are logged as a method, a path and a status — never the response
 * body, which for this API can echo the properties that were sent, and those
 * are somebody's contact details.
 */
async function call<T>(
  token: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  path: string,
  body?: unknown
): Promise<HubSpotResult<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

    if (!res.ok) {
      console.error(`[hubspot] ${method} ${path} -> ${res.status}`)
      return { ok: false, error: classify(res.status) }
    }

    // PUT associations answer 204 with no body.
    const text = await res.text()
    return { ok: true, data: (text ? JSON.parse(text) : {}) as T }
  } catch {
    console.error(`[hubspot] ${method} ${path} -> request failed`)
    return { ok: false, error: { kind: 'unknown', status: 0, message: 'Could not reach HubSpot.' } }
  }
}

export type TokenResult = { ok: true; token: string } | { ok: false; needsReconnect: boolean; message: string }

/**
 * The access token, from Phase 7A's helper and nowhere else.
 *
 * That helper decrypts, refreshes when the token is spent, persists whatever
 * HubSpot hands back, and marks the connection when a refresh fails. Reaching
 * around it would mean a second place that knows how to read a credential.
 */
export async function getToken(ownerId: string): Promise<TokenResult> {
  const result = await getValidHubSpotAccessToken(ownerId)
  if (result.ok) return { ok: true, token: result.accessToken }

  if (result.reason === 'not_configured') {
    return { ok: false, needsReconnect: false, message: 'HubSpot is not configured on this server.' }
  }
  if (result.reason === 'not_connected') {
    return { ok: false, needsReconnect: true, message: 'Connect HubSpot first.' }
  }
  return { ok: false, needsReconnect: true, message: 'Reconnect HubSpot to continue.' }
}

type ObjectResponse = { id?: string }

/**
 * A record matched by one of its own properties, or null when there is none.
 *
 * HubSpot exposes this as a plain GET with `idProperty`, which is both simpler
 * and more precise than a search query: it either matches that exact value or
 * it does not. A 404 is the honest "no such record" and is not an error.
 */
async function findByProperty(
  token: string,
  objectType: 'contacts' | 'companies',
  property: string,
  value: string
): Promise<HubSpotResult<string | null>> {
  const path = `/crm/objects/${V}/${objectType}/${encodeURIComponent(value)}?idProperty=${property}`
  const res = await call<ObjectResponse>(token, 'GET', path)

  if (res.ok) return { ok: true, data: res.data.id ?? null }
  if (res.error.kind === 'not_found') return { ok: true, data: null }

  // A 400 here means this object does not support lookup by that property.
  // Treated as "no match" rather than as a failure: creating is still correct,
  // and the mapping stops a retry from creating twice.
  if (res.error.status === 400) return { ok: true, data: null }

  return { ok: false, error: res.error }
}

function nonEmpty(record: Record<string, string | null | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(record)) {
    const text = (v || '').trim()
    if (text) out[k] = text
  }
  return out
}

/** Find a contact by exact email, or null. */
export function findContactByEmail(token: string, email: string) {
  return findByProperty(token, 'contacts', 'email', email.trim().toLowerCase())
}

/**
 * What a domain search found.
 *
 * Three outcomes rather than an id-or-null, because "several companies share
 * this domain" is a real answer and not an empty one. Picking the first would
 * file a customer's meeting under whichever record happened to sort first, and
 * creating another would add a fourth duplicate to a CRM that already has
 * three.
 */
export type CompanyMatch =
  | { kind: 'none' }
  | { kind: 'one'; id: string }
  | { kind: 'conflict'; count: number }

type SearchResponse = { total?: number; results?: { id?: string }[] }

/**
 * Companies with exactly this domain.
 *
 * The search API, which is what HubSpot documents for finding a record by a
 * property it does not key on. `EQ` and nothing else: `CONTAINS_TOKEN` would
 * match acme.com against notacme.com, and a company match that is nearly right
 * is worse than no match at all — it attaches somebody's meeting to the wrong
 * organisation, and no later push undoes that.
 */
export async function findCompanyByDomain(
  token: string,
  domain: string
): Promise<HubSpotResult<CompanyMatch>> {
  const res = await call<SearchResponse>(token, 'POST', `/crm/objects/${V}/companies/search`, {
    filterGroups: [
      { filters: [{ propertyName: 'domain', operator: 'EQ', value: domain }] },
    ],
    properties: ['domain'],
    limit: 2,
  })

  if (!res.ok) return res

  const results = res.data.results ?? []
  // `total` counts every match; `results` is capped at the limit above, so two
  // rows is enough to know there is more than one without fetching them all.
  const total = typeof res.data.total === 'number' ? res.data.total : results.length

  if (total === 0 || results.length === 0) return { ok: true, data: { kind: 'none' } }
  if (total > 1 || results.length > 1) return { ok: true, data: { kind: 'conflict', count: total } }

  const id = results[0]?.id
  return id ? { ok: true, data: { kind: 'one', id } } : { ok: true, data: { kind: 'none' } }
}

export async function createContact(
  token: string,
  contact: ExportContact
): Promise<HubSpotResult<string>> {
  const properties = nonEmpty({
    firstname: contact.firstName,
    lastname: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    jobtitle: contact.jobTitle,
    company: contact.companyName,
  })

  const res = await call<ObjectResponse>(token, 'POST', `/crm/objects/${V}/contacts`, { properties })
  if (!res.ok) return res
  if (!res.data.id) return { ok: false, error: { kind: 'unknown', status: 0, message: 'HubSpot did not return a contact id.' } }
  return { ok: true, data: res.data.id }
}

export async function createCompany(
  token: string,
  args: { name: string | null; domain: string | null }
): Promise<HubSpotResult<string>> {
  const properties = nonEmpty({ name: args.name, domain: args.domain })

  const res = await call<ObjectResponse>(token, 'POST', `/crm/objects/${V}/companies`, { properties })
  if (!res.ok) return res
  if (!res.data.id) return { ok: false, error: { kind: 'unknown', status: 0, message: 'HubSpot did not return a company id.' } }
  return { ok: true, data: res.data.id }
}

/**
 * The meeting, built only from what the encounter actually holds.
 *
 * An empty line is left out rather than filled in: a meeting with no recorded
 * discussion says nothing about the discussion, because writing "no notes" into
 * somebody's CRM is writing a claim they did not make. `hs_timestamp` is the
 * meeting's own `met_at` — not when the contact was scanned or created, which
 * is a different date and was already wrong once.
 */
function meetingProperties(contact: ExportContact, encounter: ExportEncounter) {
  const who = contact.fullName || [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'a contact'

  const lines: string[] = []
  if (encounter.event) lines.push(`Where: ${encounter.event}`)
  if (encounter.discussed) lines.push(`Discussed: ${encounter.discussed}`)
  if (encounter.nextAction) lines.push(`Next action: ${encounter.nextAction}`)

  return nonEmpty({
    hs_timestamp: encounter.metAt,
    hs_meeting_title: encounter.event ? `Met ${who} — ${encounter.event}` : `Met ${who}`,
    hs_meeting_body: lines.join('\n') || null,
    hs_meeting_start_time: encounter.metAt,
    hs_meeting_outcome: 'COMPLETED',
  })
}

export async function createMeeting(
  token: string,
  contact: ExportContact,
  encounter: ExportEncounter
): Promise<HubSpotResult<string>> {
  const res = await call<ObjectResponse>(token, 'POST', `/crm/objects/${V}/meetings`, {
    properties: meetingProperties(contact, encounter),
  })
  if (!res.ok) return res
  if (!res.data.id) return { ok: false, error: { kind: 'unknown', status: 0, message: 'HubSpot did not return a meeting id.' } }
  return { ok: true, data: res.data.id }
}

/** Revise a meeting ABC has already created, rather than adding a second one. */
export async function updateMeeting(
  token: string,
  remoteId: string,
  contact: ExportContact,
  encounter: ExportEncounter
): Promise<HubSpotResult<string>> {
  const res = await call<ObjectResponse>(token, 'PATCH', `/crm/objects/${V}/meetings/${remoteId}`, {
    properties: meetingProperties(contact, encounter),
  })
  return res.ok ? { ok: true, data: remoteId } : res
}

/**
 * The task, from the promise that was actually made.
 *
 * When a next action was recorded it becomes the subject verbatim. When only a
 * date was set, the subject says who to follow up with and nothing more — a
 * truthful placeholder rather than an invented commitment.
 */
function taskProperties(contact: ExportContact, encounter: ExportEncounter) {
  const who = contact.fullName || [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'this contact'

  return nonEmpty({
    hs_timestamp: encounter.followUpAt,
    hs_task_subject: encounter.nextAction || `Follow up with ${who}`,
    hs_task_body: encounter.discussed ? `From your meeting: ${encounter.discussed}` : null,
    hs_task_status: 'NOT_STARTED',
    hs_task_priority: 'MEDIUM',
    hs_task_type: 'TODO',
  })
}

export async function createTask(
  token: string,
  contact: ExportContact,
  encounter: ExportEncounter
): Promise<HubSpotResult<string>> {
  const res = await call<ObjectResponse>(token, 'POST', `/crm/objects/${V}/tasks`, {
    properties: taskProperties(contact, encounter),
  })
  if (!res.ok) return res
  if (!res.data.id) return { ok: false, error: { kind: 'unknown', status: 0, message: 'HubSpot did not return a task id.' } }
  return { ok: true, data: res.data.id }
}

export async function updateTask(
  token: string,
  remoteId: string,
  contact: ExportContact,
  encounter: ExportEncounter
): Promise<HubSpotResult<string>> {
  const res = await call<ObjectResponse>(token, 'PATCH', `/crm/objects/${V}/tasks/${remoteId}`, {
    properties: taskProperties(contact, encounter),
  })
  return res.ok ? { ok: true, data: remoteId } : res
}

/**
 * Associate two records using HubSpot's default association.
 *
 * A PUT, and idempotent by HubSpot's own description, so calling it again on an
 * association that already exists is a no-op rather than a duplicate or an
 * error. That is what makes pressing Push twice safe at this step.
 */
export async function associate(
  token: string,
  from: { type: string; id: string },
  to: { type: string; id: string }
): Promise<HubSpotResult<Record<string, unknown>>> {
  return call(
    token,
    'PUT',
    `/crm/objects/${V}/${from.type}/${from.id}/associations/default/${to.type}/${to.id}`
  )
}
