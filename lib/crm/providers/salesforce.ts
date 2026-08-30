import {
  SALESFORCE_API_VERSION,
  getSalesforceAccess,
  refreshSalesforceAccess,
} from '@/lib/crm/salesforce-oauth'
import { extractNormalizedEmails, extractNormalizedPhones } from '@/lib/contacts/identity'
import { companyDomainFrom, type ExportContact, type ExportEncounter } from '@/lib/crm/types'

/**
 * Salesforce, and the only place in ABC that knows what Salesforce looks like.
 *
 * REST against the org's own instance, at one pinned API version. SOQL appears
 * here and nowhere else, and every value interpolated into it goes through the
 * escaper below — a customer's company name is untrusted input as far as a
 * query language is concerned, however it got into the database.
 *
 * ABC writes Contacts, not Leads. A Lead is Salesforce's holding pen for an
 * unqualified prospect: it cannot belong to an Account, and it has to be
 * converted before it joins the customer's real relationship data. ABC's people
 * are not prospects in a funnel — they are people somebody met, often people
 * the customer already knows — and the export carries a real Company that maps
 * to a real Account. Writing Leads would throw that relationship away and would
 * duplicate, in a second object, everyone already in the CRM as a Contact.
 */

export type SalesforceError = {
  kind: 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'rate_limited' | 'server' | 'unknown'
  status: number
  /** Safe to show a person. Never the provider's raw body. */
  message: string
}

export type SalesforceResult<T> = { ok: true; data: T } | { ok: false; error: SalesforceError }

/** One place that decides what a status code means, so callers never guess. */
function classify(status: number): SalesforceError {
  if (status === 401) return { kind: 'unauthorized', status, message: 'Salesforce rejected the connection.' }
  if (status === 403) {
    // Salesforce also answers 403 when the org's API request allowance for the
    // day is gone, which is a wait rather than a permission problem — but the
    // body says which, and the body is not something to surface.
    return { kind: 'forbidden', status, message: 'Salesforce refused that request: a permission or API limit.' }
  }
  if (status === 404) return { kind: 'not_found', status, message: 'Not found in Salesforce.' }
  if (status === 409) return { kind: 'conflict', status, message: 'Salesforce reported a conflicting record.' }
  if (status === 429) return { kind: 'rate_limited', status, message: 'Salesforce is rate limiting; try again shortly.' }
  if (status >= 500) return { kind: 'server', status, message: 'Salesforce is temporarily unavailable.' }
  return { kind: 'unknown', status, message: `Salesforce could not complete that request (${status}).` }
}

export type Access = { ownerId: string; accessToken: string; instanceUrl: string }

/**
 * One request, refreshing once if the session has gone.
 *
 * Salesforce never says how long a token lasts, so expiry is discovered rather
 * than predicted: a 401 means refresh and try again, exactly once. A second 401
 * is a real refusal and is reported as one.
 *
 * Failures are logged as a method, a path and a status. Never the body — a
 * Salesforce error body quotes the record that was sent, and that record is
 * somebody's contact details. Never the host either: it names the customer's
 * org.
 */
async function call<T>(
  access: Access,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
  retried = false
): Promise<SalesforceResult<T>> {
  try {
    const res = await fetch(`${access.instanceUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${access.accessToken}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

    if (res.status === 401 && !retried) {
      const refreshed = await refreshSalesforceAccess(access.ownerId)
      if (!refreshed.ok) return { ok: false, error: classify(401) }
      // Same request, new session, once.
      return call<T>(
        { ownerId: access.ownerId, accessToken: refreshed.accessToken, instanceUrl: refreshed.instanceUrl },
        method,
        path,
        body,
        true
      )
    }

    if (!res.ok) {
      console.error(`[salesforce] ${method} ${path.split('?')[0]} -> ${res.status}`)
      return { ok: false, error: classify(res.status) }
    }

    // A PATCH answers 204 with no body.
    const text = await res.text()
    return { ok: true, data: (text ? JSON.parse(text) : {}) as T }
  } catch {
    console.error(`[salesforce] ${method} ${path.split('?')[0]} -> request failed`)
    return { ok: false, error: { kind: 'unknown', status: 0, message: 'Could not reach Salesforce.' } }
  }
}

export type AccessResult =
  | { ok: true; access: Access }
  | { ok: false; needsReconnect: boolean; message: string }

/** Credentials, from the canonical helper and nowhere else. */
export async function getAccess(ownerId: string): Promise<AccessResult> {
  const result = await getSalesforceAccess(ownerId)
  if (result.ok) {
    return {
      ok: true,
      access: { ownerId, accessToken: result.accessToken, instanceUrl: result.instanceUrl },
    }
  }

  if (result.reason === 'not_configured') {
    return { ok: false, needsReconnect: false, message: 'Salesforce is not configured on this server.' }
  }
  if (result.reason === 'not_connected') {
    return { ok: false, needsReconnect: true, message: 'Connect Salesforce first.' }
  }
  return { ok: false, needsReconnect: true, message: 'Reconnect Salesforce to continue.' }
}

/**
 * A value, safe to place inside a SOQL string literal.
 *
 * SOQL has no parameter binding over REST, so the query is assembled as text
 * and the only defence is escaping. A backslash first, then the quote — the
 * other order would double-escape the escapes. The remaining characters are the
 * ones SOQL treats specially inside a literal.
 *
 * Company names contain apostrophes as a matter of course; this is a
 * correctness fix as much as a security one.
 */
export function escapeSoql(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/"/g, '\\"')
}

const API = () => `/services/data/${SALESFORCE_API_VERSION}`

type QueryResponse<T> = { totalSize?: number; done?: boolean; records?: T[] }
type IdResponse = { id?: string; success?: boolean }

async function query<T>(access: Access, soql: string): Promise<SalesforceResult<T[]>> {
  const res = await call<QueryResponse<T>>(access, 'GET', `${API()}/query?q=${encodeURIComponent(soql)}`)
  if (!res.ok) return res
  return { ok: true, data: res.data.records ?? [] }
}

/**
 * What a lookup found.
 *
 * Three outcomes rather than an id-or-null, because "several records match" is
 * a real answer and not an empty one.
 */
export type Match = { kind: 'none' } | { kind: 'one'; id: string } | { kind: 'conflict'; count: number }

type ContactRecord = { Id: string }

/** Find a Contact by exact email. Two matches end the search, not start a guess. */
export async function findContactByEmail(
  access: Access,
  email: string
): Promise<SalesforceResult<Match>> {
  const [canonical] = extractNormalizedEmails(email)
  if (!canonical) return { ok: true, data: { kind: 'none' } }

  const res = await query<ContactRecord>(
    access,
    `SELECT Id FROM Contact WHERE Email = '${escapeSoql(canonical)}' LIMIT 2`
  )
  if (!res.ok) return res

  const ids = res.data.map((r) => r.Id).filter(Boolean)
  if (ids.length === 0) return { ok: true, data: { kind: 'none' } }
  if (ids.length > 1) return { ok: true, data: { kind: 'conflict', count: ids.length } }
  return { ok: true, data: { kind: 'one', id: ids[0] } }
}

type AccountRecord = { Id: string; Name?: string | null; Website?: string | null }

/**
 * How many candidate Accounts are worth inspecting.
 *
 * Truncation fails in the safe direction: missing one means creating an Account
 * that arguably existed — a duplicate somebody can merge — never filing a
 * meeting under a company that is not theirs.
 */
const ACCOUNT_CANDIDATE_LIMIT = 20

/**
 * Accounts that might be this company — candidates, not answers.
 *
 * Salesforce, unlike Pipedrive, will let you query the website field, so
 * discovery casts a slightly wider net than name alone: anything whose Website
 * mentions the domain, plus anything whose Name matches exactly. `LIKE` is used
 * only to *find* candidates and never to accept one — acme.com and notacme.com
 * both match that pattern, which is exactly why the caller confirms every
 * candidate by normalised domain before using it.
 */
export async function findAccountCandidates(
  access: Access,
  name: string,
  domain: string
): Promise<SalesforceResult<{ id: string; website: string | null }[]>> {
  const soql =
    `SELECT Id, Name, Website FROM Account ` +
    `WHERE Website LIKE '%${escapeSoql(domain)}%' OR Name = '${escapeSoql(name)}' ` +
    `LIMIT ${ACCOUNT_CANDIDATE_LIMIT}`

  const res = await query<AccountRecord>(access, soql)
  if (!res.ok) return res

  return { ok: true, data: res.data.map((r) => ({ id: r.Id, website: r.Website ?? null })) }
}

function nonEmpty(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(record)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'string' && !v.trim()) continue
    out[k] = v
  }
  return out
}

export async function createAccount(
  access: Access,
  args: { name: string; website: string | null }
): Promise<SalesforceResult<string>> {
  const res = await call<IdResponse>(access, 'POST', `${API()}/sobjects/Account`, nonEmpty({
    Name: args.name,
    Website: args.website,
  }))
  if (!res.ok) return res
  if (!res.data.id) {
    return { ok: false, error: { kind: 'unknown', status: 0, message: 'Salesforce did not return an account id.' } }
  }
  return { ok: true, data: res.data.id }
}

/**
 * Contact fields, from canonical ABC values.
 *
 * `LastName` is the one field Salesforce requires, and it will not accept a
 * blank. When ABC only holds a single-word name that word becomes the last
 * name, because putting a real name in the required field beats putting
 * "Unknown" there — which is what the previous integration did.
 *
 * `Title` is the job title. Unlike Pipedrive's, it is an ordinary standard
 * field with no configuration behind it, so it is sent.
 */
function contactFields(contact: ExportContact, accountId: string | null) {
  const full =
    contact.fullName || [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || ''
  const parts = full.split(/\s+/).filter(Boolean)

  const lastName = contact.lastName || (parts.length > 1 ? parts.slice(1).join(' ') : parts[0]) || null
  const firstName = contact.firstName || (parts.length > 1 ? parts[0] : null)

  const [email] = extractNormalizedEmails(contact.email)
  const [phone] = extractNormalizedPhones(contact.phone)

  return nonEmpty({
    FirstName: firstName,
    LastName: lastName,
    Email: email ?? null,
    Phone: phone ?? null,
    Title: contact.jobTitle,
    AccountId: accountId,
  })
}

/** Whether ABC can name this person well enough for Salesforce to accept them. */
export function contactHasRequiredName(contact: ExportContact): boolean {
  const fields = contactFields(contact, null)
  return typeof fields.LastName === 'string' && fields.LastName.trim().length > 0
}

export async function createContact(
  access: Access,
  contact: ExportContact,
  accountId: string | null
): Promise<SalesforceResult<string>> {
  const res = await call<IdResponse>(access, 'POST', `${API()}/sobjects/Contact`, contactFields(contact, accountId))
  if (!res.ok) return res
  if (!res.data.id) {
    return { ok: false, error: { kind: 'unknown', status: 0, message: 'Salesforce did not return a contact id.' } }
  }
  return { ok: true, data: res.data.id }
}

/**
 * Attach an existing Contact to an Account.
 *
 * Salesforce models the relationship as `AccountId` on the Contact, so there is
 * no association object to create and nothing to duplicate — writing the same
 * id twice is the same person with the same employer.
 */
export async function setContactAccount(
  access: Access,
  contactId: string,
  accountId: string
): Promise<SalesforceResult<string>> {
  const res = await call<IdResponse>(access, 'PATCH', `${API()}/sobjects/Contact/${contactId}`, {
    AccountId: accountId,
  })
  return res.ok ? { ok: true, data: contactId } : res
}

function displayName(contact: ExportContact): string {
  return (
    contact.fullName ||
    [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() ||
    'this contact'
  )
}
/**
 * The Task statuses this org actually has.
 *
 * Status is a per-org picklist. "Completed" is only its usual English label —
 * an org can rename it, translate it, or replace it — so the value is asked for
 * rather than assumed, and `ApiName` is what `Task.Status` accepts.
 *
 * The choice is deterministic and never reads a label: among the statuses of
 * the right kind, the org's own default wins, and if none is marked default the
 * lowest `SortOrder` does. Two orgs with the same configuration always get the
 * same answer, and no English word decides anything.
 */
type TaskStatusRecord = {
  ApiName?: string | null
  IsClosed?: boolean | null
  IsDefault?: boolean | null
  SortOrder?: number | null
}

export type TaskStatuses = { closed: string | null; open: string | null }

function pick(records: TaskStatusRecord[], closed: boolean): string | null {
  const candidates = records
    .filter((r) => Boolean(r.IsClosed) === closed && typeof r.ApiName === 'string' && r.ApiName)
    .sort((a, b) => (a.SortOrder ?? Number.MAX_SAFE_INTEGER) - (b.SortOrder ?? Number.MAX_SAFE_INTEGER))

  if (candidates.length === 0) return null
  return (candidates.find((r) => r.IsDefault) ?? candidates[0]).ApiName ?? null
}

export async function findTaskStatuses(access: Access): Promise<SalesforceResult<TaskStatuses>> {
  const res = await query<TaskStatusRecord>(
    access,
    'SELECT ApiName, IsClosed, IsDefault, SortOrder FROM TaskStatus ORDER BY SortOrder'
  )
  if (!res.ok) return res

  return { ok: true, data: { closed: pick(res.data, true), open: pick(res.data, false) } }
}

/**
 * The exact moment, spelled out for a human.
 *
 * Salesforce's `ActivityDate` is a date and nothing more, so the time of day
 * would otherwise be lost between ABC and the CRM. It is written into the
 * description instead — the canonical instant, in UTC, unrounded.
 */
function statedTime(label: string, iso: string): string | null {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  return `${label}: ${at.toISOString()}`
}

/** The UTC calendar date of a canonical instant. */
function utcDate(iso: string): string | null {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  return at.toISOString().slice(0, 10)
}

/**
 * The meeting, as a Task that is already done.
 *
 * Not an Event. Salesforce will not accept a timed Event without either a
 * duration or an end time, and ABC knows neither — it knows when the meeting
 * started and nothing else. Writing "60 minutes" would put a measurement in
 * somebody's CRM that nobody took, indistinguishable ever after from one that
 * was. A completed Task has no duration field to fill in, so nothing is
 * invented, and it lands in Activity History, which is where a thing that
 * already happened belongs.
 *
 * The cost is `ActivityDate` holding only the date. The exact `met_at` goes
 * into the description so the canonical time survives the trip.
 *
 * `Priority` is not sent. ABC has no truthful priority for a meeting, and
 * Salesforce fills its own org default — the org's choice rather than ours.
 */
function meetingTaskFields(
  contact: ExportContact,
  encounter: ExportEncounter,
  contactId: string,
  accountId: string | null,
  closedStatus: string
) {
  const who = displayName(contact)

  const lines = [
    statedTime('Meeting time', encounter.metAt),
    encounter.event ? `Event: ${encounter.event}` : null,
    encounter.discussed ? `Discussed: ${encounter.discussed}` : null,
    encounter.nextAction ? `Next action: ${encounter.nextAction}` : null,
  ].filter((line): line is string => Boolean(line))

  return nonEmpty({
    Subject: encounter.event ? `Met ${who} — ${encounter.event}` : `Met ${who}`,
    Description: lines.join('\n') || null,
    ActivityDate: utcDate(encounter.metAt),
    Status: closedStatus,
    WhoId: contactId,
    WhatId: accountId,
  })
}

export async function createMeetingTask(
  access: Access,
  contact: ExportContact,
  encounter: ExportEncounter,
  contactId: string,
  accountId: string | null,
  closedStatus: string
): Promise<SalesforceResult<string>> {
  const res = await call<IdResponse>(
    access,
    'POST',
    `${API()}/sobjects/Task`,
    meetingTaskFields(contact, encounter, contactId, accountId, closedStatus)
  )
  if (!res.ok) return res
  if (!res.data.id) {
    return { ok: false, error: { kind: 'unknown', status: 0, message: 'Salesforce did not return a task id.' } }
  }
  return { ok: true, data: res.data.id }
}

/** Revise the meeting ABC already recorded, rather than logging it twice. */
export async function updateMeetingTask(
  access: Access,
  remoteId: string,
  contact: ExportContact,
  encounter: ExportEncounter,
  contactId: string,
  accountId: string | null,
  closedStatus: string
): Promise<SalesforceResult<string>> {
  const res = await call<IdResponse>(
    access,
    'PATCH',
    `${API()}/sobjects/Task/${remoteId}`,
    meetingTaskFields(contact, encounter, contactId, accountId, closedStatus)
  )
  return res.ok ? { ok: true, data: remoteId } : res
}

/**
 * The follow-up, from the promise that was actually made.
 *
 * When a next action was recorded it becomes the subject verbatim; otherwise
 * the subject names who to follow up with and stops there — a truthful
 * placeholder rather than an invented commitment.
 *
 * Open, unlike the meeting: this one is the thing still to do. The follow-up
 * time can carry a time of day that `ActivityDate` cannot hold, so it is stated
 * in the description for the same reason the meeting's is.
 */
function followUpTaskFields(
  contact: ExportContact,
  encounter: ExportEncounter,
  contactId: string,
  accountId: string | null,
  openStatus: string
) {
  const who = displayName(contact)

  const lines = [
    encounter.followUpAt ? statedTime('Follow up at', encounter.followUpAt) : null,
    encounter.discussed ? `From your meeting: ${encounter.discussed}` : null,
  ].filter((line): line is string => Boolean(line))

  return nonEmpty({
    Subject: encounter.nextAction || `Follow up with ${who}`,
    Description: lines.join('\n') || null,
    ActivityDate: encounter.followUpAt ? utcDate(encounter.followUpAt) : null,
    Status: openStatus,
    WhoId: contactId,
    WhatId: accountId,
  })
}

export async function createFollowUpTask(
  access: Access,
  contact: ExportContact,
  encounter: ExportEncounter,
  contactId: string,
  accountId: string | null,
  openStatus: string
): Promise<SalesforceResult<string>> {
  const res = await call<IdResponse>(
    access,
    'POST',
    `${API()}/sobjects/Task`,
    followUpTaskFields(contact, encounter, contactId, accountId, openStatus)
  )
  if (!res.ok) return res
  if (!res.data.id) {
    return { ok: false, error: { kind: 'unknown', status: 0, message: 'Salesforce did not return a task id.' } }
  }
  return { ok: true, data: res.data.id }
}

export async function updateFollowUpTask(
  access: Access,
  remoteId: string,
  contact: ExportContact,
  encounter: ExportEncounter,
  contactId: string,
  accountId: string | null,
  openStatus: string
): Promise<SalesforceResult<string>> {
  const res = await call<IdResponse>(
    access,
    'PATCH',
    `${API()}/sobjects/Task/${remoteId}`,
    followUpTaskFields(contact, encounter, contactId, accountId, openStatus)
  )
  return res.ok ? { ok: true, data: remoteId } : res
}

/** Exported for the orchestrator's domain confirmation, which is provider-neutral. */
export { companyDomainFrom }
