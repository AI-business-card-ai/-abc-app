import type { SupabaseClient } from '@supabase/supabase-js'
import { sanitizeEventName } from '@/lib/event-normalizer'

/**
 * Meetings, and the one place they are written.
 *
 * A contact is a person; an encounter is a time you met them. Before this
 * existed, meeting the same person twice meant either overwriting what happened
 * the first time or saving a second contact for someone you already knew.
 *
 * `contact_encounters` is the history. The flat columns on `scanned_contacts`
 * remain, now as a projection of the most recent encounter — follow-ups, the
 * dashboard, the contact list and CRM scoring all read them, and Phase 4 does
 * not ask any of that to change. Anything writing an encounter updates the
 * projection in the same breath, which is why both live in this file: they are
 * two halves of one write, and separating them is how they drift apart.
 */

/** The four things the meeting form actually collects, plus when it happened. */
export type MeetingInput = {
  event: string | null
  eventNormalized: string | null
  discussed: string | null
  nextAction: string | null
  followUpAt: string | null
  metAt?: string | null
}

/** Provenance for a single meeting — how this one entered ABC. */
export type EncounterCapture = {
  captureOrigin?: string | null
  captureKind?: string | null
}

export type EncounterRow = {
  id: string
  contact_id: string
  user_id: string
  met_at: string
  event: string | null
  event_normalized: string | null
  discussed: string | null
  next_action: string | null
  follow_up_at: string | null
  capture_origin: string | null
  capture_kind: string | null
  created_at: string
}

/** Longest text a meeting field may carry. Notes are notes, not documents. */
const MAX_SHORT = 300
const MAX_LONG = 2000

function trimTo(value: string | null | undefined, max: number): string | null {
  const text = (value || '').trim()
  if (!text) return null
  return text.length > max ? text.slice(0, max) : text
}

/**
 * An ISO timestamp, or null.
 *
 * Anything unparseable becomes null rather than reaching the database, where a
 * bad date is a 500 on a route that had nothing else wrong with it.
 */
export function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return null
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function sanitizeMeetingInput(input: MeetingInput): MeetingInput {
  return {
    event: trimTo(input.event, MAX_SHORT),
    /*
      Second line of defence, not the first. The normalizer already refuses to
      return anything that is not a name, and this is here so that a future
      caller reaching the encounter table by another route cannot store one
      either. Null on rejection: the owner's own `event` above still holds what
      they typed, so nothing is lost by declining the machine's version of it.
    */
    eventNormalized: sanitizeEventName(trimTo(input.eventNormalized, MAX_SHORT)),
    discussed: trimTo(input.discussed, MAX_LONG),
    nextAction: trimTo(input.nextAction, MAX_SHORT),
    followUpAt: isoOrNull(input.followUpAt),
    metAt: isoOrNull(input.metAt),
  }
}

export function meetingHasContent(input: MeetingInput): boolean {
  return Boolean(input.event || input.discussed || input.nextAction || input.followUpAt)
}

function encounterPayload(input: MeetingInput, capture: EncounterCapture) {
  return {
    met_at: input.metAt || new Date().toISOString(),
    event: input.event,
    event_normalized: input.eventNormalized,
    discussed: input.discussed,
    next_action: input.nextAction,
    follow_up_at: input.followUpAt,
    capture_origin: capture.captureOrigin ?? null,
    capture_kind: capture.captureKind ?? null,
  }
}

/**
 * Record a meeting with a contact.
 *
 * The caller must already have proved the contact belongs to this user. That is
 * not the only thing standing between an owner and someone else's contact,
 * though: `contact_encounters` carries a composite foreign key on
 * (contact_id, user_id), so the database itself refuses a row whose contact and
 * owner disagree. A route that forgot to check would fail here rather than
 * writing a cross-tenant row.
 */
export async function createEncounter(
  supabase: SupabaseClient,
  args: { contactId: string; userId: string; meeting: MeetingInput; capture?: EncounterCapture }
): Promise<EncounterRow | null> {
  const { data, error } = await supabase
    .from('contact_encounters')
    .insert({
      contact_id: args.contactId,
      user_id: args.userId,
      ...encounterPayload(args.meeting, args.capture || {}),
    })
    .select('*')
    .single()

  if (error || !data) {
    console.error('[encounters] create failed:', error)
    return null
  }
  return data as EncounterRow
}

/**
 * Correct an existing meeting rather than inventing a new one.
 *
 * Editing a typo in what you discussed must not claim you met the person
 * twice, so the meeting form edits the encounter it is showing and only creates
 * one when the owner says "add meeting".
 *
 * All three of id, contact and owner must agree. Owner alone is not enough:
 * every contact I own passes that test, so a stale or muddled client could
 * rewrite the meeting notes of a different person entirely — my own data, so
 * RLS raises no objection, and still the wrong meeting. Naming the contact
 * makes the mismatch a miss, and a miss returns null, which the caller reports
 * as "not found" whether the row belongs to another contact, another owner, or
 * nobody at all.
 */
export async function updateEncounter(
  supabase: SupabaseClient,
  args: { encounterId: string; contactId: string; userId: string; meeting: MeetingInput }
): Promise<EncounterRow | null> {
  const payload = encounterPayload(args.meeting, {})
  // An edit revises what was said, not when it happened or how it was captured.
  const { met_at: _metAt, capture_origin: _origin, capture_kind: _kind, ...revisable } = payload

  const { data, error } = await supabase
    .from('contact_encounters')
    .update(revisable)
    .eq('id', args.encounterId)
    .eq('contact_id', args.contactId)
    .eq('user_id', args.userId)
    .select('*')
    .single()

  if (error || !data) {
    console.error('[encounters] update failed:', error)
    return null
  }
  return data as EncounterRow
}

/**
 * Bring the contact's reminder back in line with its meetings.
 *
 * `contact_encounters.follow_up_at` is where a follow-up actually lives: one
 * per meeting, because that is what a follow-up is about.
 * `scanned_contacts.next_action_date` holds a single date and is read by the
 * follow-up inbox, the dashboard counts and the header badge — so it is a
 * projection, and this is the only thing allowed to compute it.
 *
 * The rule is the soonest unresolved meeting, and it is one rule rather than
 * two because the alternatives disagree. Projecting the *latest* meeting's date
 * — which is what saving a meeting used to do — hides an earlier reminder
 * behind a later one, and since the inbox drops anything past its horizon, an
 * overdue follow-up could vanish from view because a newer meeting was added.
 * Latest meeting and next action are different questions.
 *
 * Never invents a date: the value always comes from a real pending meeting, or
 * is null because none remain. Contacts with no meetings are left alone —
 * their reminder is contact-level and there is nothing here to derive it from.
 */
export async function recomputeContactFollowUpProjection(
  supabase: SupabaseClient,
  args: { ownerId: string; contactId: string }
): Promise<string | null> {
  const { data, error } = await supabase
    .from('contact_encounters')
    .select('follow_up_at')
    .eq('contact_id', args.contactId)
    .eq('user_id', args.ownerId)
    .not('follow_up_at', 'is', null)
    .order('follow_up_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[encounters] follow-up projection read failed:', error)
    return null
  }

  const nextDue = (data?.follow_up_at as string | undefined) ?? null

  const { error: writeError } = await supabase
    .from('scanned_contacts')
    .update({ next_action_date: nextDue })
    .eq('id', args.contactId)
    .eq('user_id', args.ownerId)

  if (writeError) {
    console.error('[encounters] follow-up projection write failed:', writeError)
  }

  return nextDue
}

/**
 * The legacy flat columns, rebuilt from a meeting.
 *
 * Everything outside the contact detail screen still reads these, so the latest
 * encounter has to be visible there or follow-ups quietly stop firing. Returns
 * only the meeting-context keys; the caller decides what else to update.
 *
 * Deliberately not . That column is the reminder, and a
 * reminder is not a property of the newest meeting — it is whichever meeting
 * is due soonest. recomputeContactFollowUpProjection owns it, and writing it
 * here as well is how the two answers drifted apart.
 */
export function legacyProjection(
  input: MeetingInput,
  options: { leadSource?: string; followupNote?: string | null } = {}
): Record<string, unknown> {
  const noteParts = [input.event, input.discussed, options.followupNote].filter(Boolean)

  const projection: Record<string, unknown> = {
    meeting_topic: input.discussed,
    notes: noteParts.length > 0 ? noteParts.join('. ') : null,
    next_action: input.nextAction,
    next_step: input.nextAction,
  }

  if (input.event) {
    /*
      Falling back to what the owner typed when normalization produced nothing
      usable. These columns are what the contact screen and the CRM exports
      read, so leaving them null would blank a name the owner had already
      given — and the un-normalized version of their words beats the absence of
      them, and beats a model's paragraph about them by a wider margin still.
    */
    const normalized = input.eventNormalized || input.event
    projection.raw_event_text = input.event
    projection.normalized_event_text = normalized
    projection.event_name = normalized
    projection.meeting_event_name = normalized
    if (options.leadSource) projection.lead_source = options.leadSource
  }

  return projection
}
