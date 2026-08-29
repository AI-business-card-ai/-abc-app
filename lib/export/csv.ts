/**
 * Canonical CSV export.
 *
 * ABC's own data, flattened deterministically. Not a CRM provider: no OAuth, no
 * connection, no object mapping, nothing remembered. The file is a function of
 * the database and the same input always produces the same bytes.
 *
 * Pure by design — no database, no React, no provider code — so every claim
 * below can be tested without a network or a session.
 *
 * One row per encounter. A person met twice at two fairs is two meetings, with
 * two sets of "where, when, discussed, next action", and collapsing them would
 * either discard one or invent a composite that never happened. Contact columns
 * repeat across that person's rows; `ABC Contact ID` regroups them.
 */

export type CsvContact = {
  id: string
  firstName: string | null
  lastName: string | null
  fullName: string | null
  email: string | null
  phone: string | null
  jobTitle: string | null
  company: string | null
  website: string | null
}

export type CsvEncounter = {
  id: string
  metAt: string | null
  /** Already resolved by the caller: the sanitised name when there is one. */
  event: string | null
  discussed: string | null
  nextAction: string | null
  followUpAt: string | null
  captureOrigin: string | null
  captureKind: string | null
}

/** A contact, and the one meeting this row is about — or none, for a contact with no meetings yet. */
export type CanonicalCsvRow = { contact: CsvContact; encounter: CsvEncounter | null }

/**
 * What a column holds.
 *
 * Kept for what it says about the data — a reader can see at a glance which
 * columns are ABC's own identifiers and which are text somebody typed. It no
 * longer changes how a value is made safe: the formula guard below is universal,
 * because a rule with exceptions is a rule that has to be right about every
 * exception.
 */
type ColumnKind = 'id' | 'text' | 'phone' | 'timestamp'

type Column = {
  header: string
  kind: ColumnKind
  value: (row: CanonicalCsvRow) => string | null
}

/**
 * The launch columns, in output order.
 *
 * Every one traces to a field ABC actually stores. Nothing is derived, scored,
 * defaulted or inferred, and nothing arrives from a CRM: no remote ids, no
 * enrichment, no pipeline or opportunity fields, no injected lead source.
 */
const COLUMNS: Column[] = [
  { header: 'ABC Contact ID', kind: 'id', value: (r) => r.contact.id },
  { header: 'ABC Encounter ID', kind: 'id', value: (r) => r.encounter?.id ?? null },

  { header: 'First Name', kind: 'text', value: (r) => r.contact.firstName },
  { header: 'Last Name', kind: 'text', value: (r) => r.contact.lastName },
  { header: 'Full Name', kind: 'text', value: (r) => r.contact.fullName },
  { header: 'Email', kind: 'text', value: (r) => r.contact.email },
  { header: 'Phone', kind: 'phone', value: (r) => r.contact.phone },
  { header: 'Job Title', kind: 'text', value: (r) => r.contact.jobTitle },

  { header: 'Company', kind: 'text', value: (r) => r.contact.company },
  { header: 'Company Website', kind: 'text', value: (r) => r.contact.website },

  { header: 'Meeting Date/Time', kind: 'timestamp', value: (r) => r.encounter?.metAt ?? null },
  { header: 'Event', kind: 'text', value: (r) => r.encounter?.event ?? null },
  { header: 'Discussed', kind: 'text', value: (r) => r.encounter?.discussed ?? null },
  { header: 'Next Action', kind: 'text', value: (r) => r.encounter?.nextAction ?? null },
  { header: 'Follow-up Date/Time', kind: 'timestamp', value: (r) => r.encounter?.followUpAt ?? null },

  { header: 'Capture Origin', kind: 'text', value: (r) => r.encounter?.captureOrigin ?? null },
  { header: 'Capture Kind', kind: 'text', value: (r) => r.encounter?.captureKind ?? null },
]

export const CSV_HEADERS: readonly string[] = COLUMNS.map((c) => c.header)

/**
 * Characters a spreadsheet reads as "this cell is a formula".
 *
 * Leading whitespace is stripped before the test, because a space before an `=`
 * hides the character from a naive check and not from Excel.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/

/**
 * Make one value safe for a spreadsheet.
 *
 * The rule is universal and deliberately has no exceptions: if a value would
 * begin a cell with a character a spreadsheet reads as the start of a formula,
 * an apostrophe goes in front of it. Leading whitespace is stripped before the
 * test, because a space before an `=` hides the character from a naive check
 * and not from Excel.
 *
 * Phone numbers are included, and that is a change of mind worth recording. It
 * is tempting to argue that `+420777123456` is harmless because it evaluates to
 * arithmetic rather than calling anything — but "this particular formula is
 * benign" is not a security rule, it is a case-by-case judgement that has to be
 * right every time. It also loses data: Excel evaluates the cell and the `+`
 * disappears, so the number silently stops being a phone number. Guarding it
 * fixes both at once.
 *
 * `="..."` is not used. That would neutralise the value by making the cell a
 * formula, which is the thing being defended against. No invisible Unicode
 * either: a zero-width character that survives into a CRM import is a bug
 * nobody can see.
 *
 * Ids and ISO timestamps cannot begin with one of these characters, so the test
 * never fires for them. They still go through it rather than around it — an
 * exception is a thing that can be wrong.
 */
export function guardValue(value: string, _kind: ColumnKind): string {
  return FORMULA_LEAD.test(value.trimStart()) ? `'${value}` : value
}

/**
 * One field, quoted per RFC 4180.
 *
 * Every field is quoted rather than only the ones that need it: unconditional
 * quoting has no ambiguity to get wrong, and a value that gains a comma later
 * cannot break a file that was already quoting it. Embedded quotes are doubled;
 * commas and newlines then need nothing further.
 */
function quote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

/** Null, undefined and absent all mean an empty cell — never the word "null". */
function present(value: string | null | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}

export function toCsvRow(row: CanonicalCsvRow): string {
  return COLUMNS.map((column) => quote(guardValue(present(column.value(row)), column.kind))).join(',')
}

/**
 * The whole file.
 *
 * A byte-order mark, because without one Excel on Windows reads UTF-8 as the
 * local codepage and turns Nováková into NovÃ¡kovÃ¡. CRLF line endings, which
 * RFC 4180 specifies and every spreadsheet accepts.
 *
 * A header row is always emitted, so an export with no contacts is an empty
 * file with columns rather than nothing at all.
 */
export function toCsv(rows: CanonicalCsvRow[]): string {
  const lines = [COLUMNS.map((c) => quote(c.header)).join(','), ...rows.map(toCsvRow)]
  return '﻿' + lines.join('\r\n') + '\r\n'
}

/**
 * Contacts and their meetings, flattened into rows.
 *
 * Deterministic twice over. Contacts keep the order the caller supplied — the
 * route asks the database for newest first, with the id as a tiebreak so equal
 * timestamps cannot shuffle between runs. Within a contact, meetings are sorted
 * newest first here rather than trusted to arrive that way, again with the id
 * breaking ties.
 *
 * A contact with no meetings still produces one row. Dropping them would mean a
 * scanned person silently missing from an export of scanned people.
 */
export function buildRows(
  contacts: CsvContact[],
  encountersByContact: Map<string, CsvEncounter[]>
): CanonicalCsvRow[] {
  const rows: CanonicalCsvRow[] = []

  for (const contact of contacts) {
    const encounters = [...(encountersByContact.get(contact.id) ?? [])].sort((a, b) => {
      const at = String(b.metAt ?? '').localeCompare(String(a.metAt ?? ''))
      return at !== 0 ? at : a.id.localeCompare(b.id)
    })

    if (encounters.length === 0) {
      rows.push({ contact, encounter: null })
      continue
    }
    for (const encounter of encounters) rows.push({ contact, encounter })
  }

  return rows
}

/**
 * A filename nothing downstream has to sanitise.
 *
 * Only the date varies, and it is generated rather than taken from input, so
 * there is no path or header separator a value could smuggle in.
 */
export function csvFilename(now: Date = new Date()): string {
  return `abc-contacts-${now.toISOString().slice(0, 10)}.csv`
}
