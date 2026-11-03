import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingSchema } from '@/lib/opportunities/store'

/**
 * Planned events: the only events ABC has.
 *
 * An event exists because the owner planned it, from the one explicit action
 * that calls `createPlannedEvent`. A scan, an OCR result, an import, enrichment,
 * a follow-up or a CRM sync never creates one, and no text is ever matched to
 * one: a meeting belongs to an event only when the owner chose it.
 *
 * It references meetings and never copies them. Contacts, meetings and follow-ups
 * stay where they already live, so there is no second contact list here.
 */

export type PlannedEvent = {
  id: string
  name: string
  startsOn: string | null
  endsOn: string | null
  location: string | null
  objectives: string | null
  companiesToVisit: string | null
  targetContacts: string | null
  meetingsToArrange: string | null
  followUpPlan: string | null
}

export type PlannedEventInput = Omit<PlannedEvent, 'id'>

/** A planned event with its linked meetings counted: people and meetings are different numbers. */
export type PlannedEventRow = PlannedEvent & { people: number; meetings: number }

/** Where an event stands today. An event with no dates has not been placed in time. */
export type EventPhase = 'upcoming' | 'during' | 'past' | 'undated'

export const PLANNED_LIMITS = { name: 160, location: 200, notes: 4000 }

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

type Row = Record<string, unknown>
const text = (value: unknown): string | null => {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed || null
}

export function toPlannedEvent(row: Row): PlannedEvent {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    startsOn: text(row.starts_on),
    endsOn: text(row.ends_on),
    location: text(row.location),
    objectives: text(row.objectives),
    companiesToVisit: text(row.companies_to_visit),
    targetContacts: text(row.target_contacts),
    meetingsToArrange: text(row.meetings_to_arrange),
    followUpPlan: text(row.follow_up_plan),
  }
}

function clip(value: unknown, max: number): string | null {
  const trimmed = text(value)
  return trimmed ? trimmed.slice(0, max) : null
}

function validDate(value: unknown): string | null | 'invalid' {
  const trimmed = text(value)
  if (!trimmed) return null
  if (!DATE_PATTERN.test(trimmed)) return 'invalid'
  const parsed = new Date(`${trimmed}T00:00:00Z`)
  // A rolled-over date like 2026-02-31 parses, and comes back as a different day.
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) return 'invalid'
  return trimmed
}

/** The form's fields, or the reason they cannot be saved. Untrusted input. */
export function parsePlannedEventInput(
  body: unknown
): { ok: true; value: PlannedEventInput } | { ok: false; error: string } {
  const input = (body && typeof body === 'object' ? body : {}) as Row

  const name = clip(input.name, PLANNED_LIMITS.name)
  if (!name) return { ok: false, error: 'Give the event a name.' }

  const startsOn = validDate(input.startsOn)
  const endsOn = validDate(input.endsOn)
  if (startsOn === 'invalid' || endsOn === 'invalid') return { ok: false, error: 'Check the dates.' }
  if (startsOn && endsOn && endsOn < startsOn) return { ok: false, error: 'The event ends before it starts.' }

  return {
    ok: true,
    value: {
      name,
      startsOn,
      endsOn,
      location: clip(input.location, PLANNED_LIMITS.location),
      objectives: clip(input.objectives, PLANNED_LIMITS.notes),
      companiesToVisit: clip(input.companiesToVisit, PLANNED_LIMITS.notes),
      targetContacts: clip(input.targetContacts, PLANNED_LIMITS.notes),
      meetingsToArrange: clip(input.meetingsToArrange, PLANNED_LIMITS.notes),
      followUpPlan: clip(input.followUpPlan, PLANNED_LIMITS.notes),
    },
  }
}

function toRow(input: PlannedEventInput) {
  return {
    name: input.name,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    location: input.location,
    objectives: input.objectives,
    companies_to_visit: input.companiesToVisit,
    target_contacts: input.targetContacts,
    meetings_to_arrange: input.meetingsToArrange,
    follow_up_plan: input.followUpPlan,
  }
}

function localDay(now: Date): string {
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

export function eventPhase(event: Pick<PlannedEvent, 'startsOn' | 'endsOn'>, now: Date = new Date()): EventPhase {
  const first = event.startsOn ?? event.endsOn
  const last = event.endsOn ?? event.startsOn
  if (!first || !last) return 'undated'
  const today = localDay(now)
  if (today < first) return 'upcoming'
  if (today > last) return 'past'
  return 'during'
}

/** What is happening or next first, then what has no date yet, then the past, newest first. */
export function sortForPlanning<T extends Pick<PlannedEvent, 'startsOn' | 'endsOn' | 'name'>>(
  events: T[],
  now: Date = new Date()
): T[] {
  const rank: Record<EventPhase, number> = { during: 0, upcoming: 1, undated: 2, past: 3 }
  return [...events].sort((a, b) => {
    const phaseA = eventPhase(a, now)
    const phaseB = eventPhase(b, now)
    if (phaseA !== phaseB) return rank[phaseA] - rank[phaseB]
    const dayA = a.startsOn ?? a.endsOn ?? ''
    const dayB = b.startsOn ?? b.endsOn ?? ''
    const byDay = phaseA === 'past' ? dayB.localeCompare(dayA) : dayA.localeCompare(dayB)
    return byDay || a.name.localeCompare(b.name)
  })
}

/** "2 – 5 Jun 2026", or "2 Jun 2026" for one day, or null with no dates. */
export function eventDateLabel(event: Pick<PlannedEvent, 'startsOn' | 'endsOn'>): string | null {
  const format = (day: string, options: Intl.DateTimeFormatOptions) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', ...options })
  const full: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }

  const first = event.startsOn ?? event.endsOn
  const last = event.endsOn ?? event.startsOn
  if (!first || !last) return null
  if (first === last) return format(first, full)
  return `${format(first, { day: 'numeric', month: 'short' })} – ${format(last, full)}`
}

// ─────────────────────────── READS AND WRITES ───────────────────────────
// Every one takes the caller's RLS client and filters on the owner as well.

export async function listPlannedEvents(
  supabase: SupabaseClient,
  ownerId: string
): Promise<{ available: boolean; events: PlannedEvent[] }> {
  const { data, error } = await supabase.from('planned_events').select('*').eq('user_id', ownerId).limit(500)
  if (error) {
    // Before the migration is applied the feature is simply not there yet.
    if (!isMissingSchema(error)) console.error('[planned-events] list failed:', error.code ?? 'unknown')
    return { available: false, events: [] }
  }
  return { available: true, events: sortForPlanning(((data ?? []) as Row[]).map(toPlannedEvent)) }
}

export async function getPlannedEvent(
  supabase: SupabaseClient,
  ownerId: string,
  id: string
): Promise<PlannedEvent | null> {
  if (!UUID_PATTERN.test(id)) return null
  const { data, error } = await supabase
    .from('planned_events')
    .select('*')
    .eq('id', id)
    .eq('user_id', ownerId)
    .maybeSingle()
  if (error || !data) return null
  return toPlannedEvent(data as Row)
}

/** The authorization a link needs: this event is this owner's. The database checks again. */
export async function ownsPlannedEvent(supabase: SupabaseClient, ownerId: string, id: unknown): Promise<boolean> {
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) return false
  const { data, error } = await supabase
    .from('planned_events')
    .select('id')
    .eq('id', id)
    .eq('user_id', ownerId)
    .maybeSingle()
  return !error && Boolean(data)
}

/** The one place an event is created. Only the "Plan an event" route calls it. */
export async function createPlannedEvent(
  supabase: SupabaseClient,
  ownerId: string,
  input: PlannedEventInput
): Promise<{ event: PlannedEvent | null; error: unknown }> {
  const { data, error } = await supabase
    .from('planned_events')
    .insert({ user_id: ownerId, ...toRow(input) })
    .select('*')
    .single()
  if (error || !data) return { event: null, error }
  return { event: toPlannedEvent(data as Row), error: null }
}

export async function updatePlannedEvent(
  supabase: SupabaseClient,
  ownerId: string,
  id: string,
  input: PlannedEventInput
): Promise<{ event: PlannedEvent | null; error: unknown }> {
  const { data, error } = await supabase
    .from('planned_events')
    .update({ ...toRow(input), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', ownerId)
    .select('*')
    .maybeSingle()
  if (error || !data) return { event: null, error }
  return { event: toPlannedEvent(data as Row), error: null }
}
