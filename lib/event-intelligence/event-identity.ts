import { eventKeyFromName } from '@/lib/events/workspace'

/**
 * Which fair, and which year of it.
 *
 * ## The audit
 *
 * `intel_events.event_key` is the identity, and it is deliberately the string
 * `eventKeyFromName()` already derives for the Event Workspace's URLs — that
 * shared address space is what lets a fair known from meetings and a fair known
 * from a listing be the same fair without anything being migrated.
 *
 * Annual editions are therefore distinct **as long as the year is in the name**:
 *
 *     "Ambiente 2026"        -> ambiente-2026
 *     "Ambiente 2027"        -> ambiente-2027        different rows, correctly
 *     "Hannover Messe 2026"  -> hannover-messe-2026
 *     "Hannover Messe 2027"  -> hannover-messe-2027
 *
 * The hazard is what happens when it is not. "Ambiente" entered for 2026 and
 * "Ambiente" entered again for 2027 both key to `ambiente`, and because the
 * ingest store upserts on `event_key`, the second import would quietly adopt the
 * first edition's row — two years of exhibitors merged into one fair, with last
 * year's stands still attached. Nothing would error. That was tolerable while
 * the only event came from a fixture whose name carries its year; it stops being
 * tolerable the moment a person can create an event edition in the import flow.
 *
 * ## The fix, and why it needs no migration
 *
 * The key is derived rather than stored-as-typed, so the derivation is where
 * this belongs: an edition with a year gets that year in its key, whether or not
 * the person typed it. The column, its unique constraint and every existing row
 * are untouched, and the fixture — "ABC Industrial Future Expo 2026", which
 * already names its year — keys exactly as it did before.
 *
 * ## Series vs edition
 *
 * ABC models the **edition** and not the series. "Ambiente" as a lasting thing
 * that has a 2026 and a 2027 is a real concept and a real future table; it is
 * not one V1 needs, because every question this feature answers — who is
 * exhibiting, in which hall, worth meeting this time — is a question about one
 * edition. `edition_year` plus a distinct key is enough to add a series later by
 * grouping rows that already exist, which is the cheap direction to leave it in.
 */

/**
 * The key for one edition of a fair.
 *
 * A year already present in the name is not repeated — "Ambiente 2026" keys as
 * `ambiente-2026`, not `ambiente-2026-2026` — so a person who types the year
 * (most of them) gets exactly what the Event Workspace would derive from an
 * encounter they typed the same way, and the bridge between the two still lands.
 */
export function eventEditionKey(name: string, editionYear?: number | null): string {
  const base = name.trim()
  if (!editionYear || !Number.isInteger(editionYear)) return eventKeyFromName(base)

  const year = String(editionYear)
  // Word-boundary, so "Expo 2026" is not matched by a stand number or a street.
  const alreadyNamed = new RegExp(`(^|[^0-9])${year}([^0-9]|$)`).test(base)
  return eventKeyFromName(alreadyNamed ? base : `${base} ${year}`)
}

/**
 * Segments under /events/intelligence that are screens rather than fairs.
 *
 * A static segment beats a dynamic one in the App Router, so each of these is a
 * key no event can occupy. They are listed in one place, and pages refuse to
 * resolve an event under any of them, so the reservation is explicit rather than
 * an accident of the file tree that somebody discovers when a fair called
 * "Import" disappears.
 */
export const RESERVED_EVENT_KEYS = ['intelligence', 'import'] as const

export function isReservedEventKey(eventKey: string): boolean {
  return (RESERVED_EVENT_KEYS as readonly string[]).includes(eventKey.trim().toLowerCase())
}

/** The year range a person can sensibly be entering a trade fair for. */
export const MIN_EDITION_YEAR = 2000
export const MAX_EDITION_YEAR = 2100

export type EventEditionInput = {
  name: string
  editionYear: number | null
  city?: string | null
  country?: string | null
  venue?: string | null
  organizer?: string | null
  startsOn?: string | null
  endsOn?: string | null
  websiteUrl?: string | null
}

export type EditionResult =
  | { ok: true; eventKey: string; edition: EventEditionInput & { editionYear: number } }
  | { ok: false; error: string }

/**
 * Validate what somebody typed into "which fair is this?".
 *
 * The year is required, and that is the whole point of this function rather
 * than a nicety: it is what stops two editions of one fair becoming one row.
 * Everything else is optional, because ABC is not an event-management platform
 * and has no business insisting on a venue before it will read a spreadsheet.
 */
export function resolveEventEdition(input: Partial<EventEditionInput>): EditionResult {
  const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : ''
  if (!name) return { ok: false, error: 'What is the event called?' }
  if (name.length > 200) return { ok: false, error: 'That event name is too long.' }

  const year = Number(input.editionYear)
  if (!Number.isInteger(year) || year < MIN_EDITION_YEAR || year > MAX_EDITION_YEAR) {
    return {
      ok: false,
      error: `Which year of ${name}? Editions are kept apart by year, so ABC needs it.`,
    }
  }

  const eventKey = eventEditionKey(name, year)
  if (isReservedEventKey(eventKey)) {
    return { ok: false, error: 'That name is reserved by ABC. Please add the year or use the full event name.' }
  }

  const text = (value: unknown): string | null => {
    const raw = typeof value === 'string' ? value.trim() : ''
    return raw ? raw.slice(0, 200) : null
  }

  return {
    ok: true,
    eventKey,
    edition: {
      name,
      editionYear: year,
      city: text(input.city),
      country: text(input.country),
      venue: text(input.venue),
      organizer: text(input.organizer),
      startsOn: text(input.startsOn),
      endsOn: text(input.endsOn),
      websiteUrl: text(input.websiteUrl),
    },
  }
}
