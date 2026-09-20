import { normalizeCompanyName, normalizeDomain } from '@/lib/event-intelligence/normalize'
import { normalizeCompany, normalizePresence } from '@/lib/event-intelligence/ingest'
import type { ProviderExhibitor } from '@/lib/event-intelligence/provider'

/**
 * What ABC is about to import, shown before a single row is written.
 *
 * A preview is not decoration. Somebody is handing ABC a file they did not
 * write, about companies they do not know, and the answer to "is this file any
 * good?" has to arrive before the data does — not as a success screen
 * afterwards saying 500 rows were imported when 300 of them were blank.
 *
 * Three states, and the middle one is the one that matters:
 *
 *   VALID    — a company ABC can identify and describe.
 *   WARNING  — importable, but thinner than it should be. A missing stand is
 *              the normal case in a real directory, not an error, and blocking
 *              on it would reject most real exports.
 *   INVALID  — not importable. Nothing identifiable, so nothing that could be
 *              written without inventing it.
 *
 * Warnings never block. Invalid rows never enter the graph.
 *
 * Everything here is pure: same file, same preview, and none of it touches a
 * database. Duplicates *against already-imported data* need a query and are
 * added by the route, which is why `existingDuplicate` is filled in later.
 */

export type IssueLevel = 'warning' | 'error'

export type RecordIssue = {
  level: IssueLevel
  code:
    | 'no_company_name'
    | 'no_identity'
    | 'duplicate_in_file'
    | 'already_imported'
    | 'no_hall'
    | 'no_stand'
    | 'no_website'
    | 'sparse_description'
    | 'no_categories'
  message: string
}

export type PreviewRecord = {
  /** Position in the file, 1-based, for a person counting rows in a spreadsheet. */
  row: number
  companyName: string | null
  description: string | null
  categories: string[]
  productsServices: string[]
  hall: string | null
  stand: string | null
  website: string | null
  listingUrl: string | null
  state: 'valid' | 'warning' | 'invalid'
  issues: RecordIssue[]
  /** True when an earlier row in this same file is the same company. */
  duplicateInFile: boolean
  /** Filled in by the route, from what is already in the event graph. */
  alreadyImported: boolean
}

export type ImportPreview = {
  records: PreviewRecord[]
  counts: {
    total: number
    valid: number
    warning: number
    invalid: number
    duplicateInFile: number
    alreadyImported: number
    /** What would actually be written: valid + warning, minus in-file duplicates. */
    importable: number
  }
  /** File-level notes from the parser, e.g. rows skipped for having no id. */
  parserWarnings: string[]
}

const ISSUE_TEXT: Record<RecordIssue['code'], string> = {
  no_company_name: 'No company name, so there is nothing to import.',
  no_identity: 'Nothing stable identifies this row, so a re-import could not match it again.',
  duplicate_in_file: 'The same company appears earlier in this file.',
  already_imported: 'Already in ABC for this event — it will be updated, not duplicated.',
  no_hall: 'No hall.',
  no_stand: 'No stand number.',
  no_website: 'No website, so ABC cannot confirm this company against another listing.',
  sparse_description: 'Very little description, so matching will have less to work from.',
  no_categories: 'No categories or products listed.',
}

const issue = (level: IssueLevel, code: RecordIssue['code']): RecordIssue => ({
  level,
  code,
  message: ISSUE_TEXT[code],
})

/**
 * How a row is identified for the purpose of "is this the same company twice".
 *
 * Domain first, because it is the only thing two listings can share and mean
 * it; the normalised name is the fallback, and only *within one file*, where a
 * repeated name is far more likely to be a repeated row than two real firms.
 * Across the whole graph, the conservative resolution in `ingest.ts` decides,
 * and this preview does not second-guess it.
 */
function identityOf(exhibitor: ProviderExhibitor): string | null {
  const domain = normalizeDomain(exhibitor.website)
  if (domain) return `domain:${domain}`
  const name = normalizeCompanyName(exhibitor.companyName ?? '')
  return name ? `name:${name}` : null
}

export function buildImportPreview(
  exhibitors: ProviderExhibitor[],
  parserWarnings: string[] = []
): ImportPreview {
  const records: PreviewRecord[] = []
  const seen = new Set<string>()

  exhibitors.forEach((exhibitor, index) => {
    const company = normalizeCompany(exhibitor)
    const presence = normalizePresence(exhibitor)
    const issues: RecordIssue[] = []

    if (!company.displayName) issues.push(issue('error', 'no_company_name'))
    if (!exhibitor.providerRecordId) issues.push(issue('error', 'no_identity'))

    const identity = identityOf(exhibitor)
    const duplicateInFile = identity ? seen.has(identity) : false
    if (identity) seen.add(identity)
    if (duplicateInFile) issues.push(issue('warning', 'duplicate_in_file'))

    if (!presence.hall) issues.push(issue('warning', 'no_hall'))
    if (!presence.stand) issues.push(issue('warning', 'no_stand'))
    if (!company.websiteDomain) issues.push(issue('warning', 'no_website'))

    const described = company.descriptionPublic ?? presence.eventDescription
    if (!described || described.length < 24) issues.push(issue('warning', 'sparse_description'))
    if (company.categories.length === 0 && presence.eventCategories.length === 0 && presence.productsServices.length === 0) {
      issues.push(issue('warning', 'no_categories'))
    }

    const hasError = issues.some((entry) => entry.level === 'error')

    records.push({
      row: index + 1,
      companyName: company.displayName || null,
      description: described,
      categories: [...new Set([...company.categories, ...presence.eventCategories])],
      productsServices: presence.productsServices,
      hall: presence.hall,
      stand: presence.stand,
      website: company.websiteDomain,
      listingUrl: presence.listingUrl,
      state: hasError ? 'invalid' : issues.length > 0 ? 'warning' : 'valid',
      issues,
      duplicateInFile,
      alreadyImported: false,
    })
  })

  return { records, counts: countPreview(records), parserWarnings }
}

export function countPreview(records: PreviewRecord[]): ImportPreview['counts'] {
  const valid = records.filter((r) => r.state === 'valid').length
  const warning = records.filter((r) => r.state === 'warning').length
  const invalid = records.filter((r) => r.state === 'invalid').length
  const duplicateInFile = records.filter((r) => r.duplicateInFile).length
  const alreadyImported = records.filter((r) => r.alreadyImported).length

  return {
    total: records.length,
    valid,
    warning,
    invalid,
    duplicateInFile,
    alreadyImported,
    // A duplicate row is not a second company, so it is not a second import.
    importable: records.filter((r) => r.state !== 'invalid' && !r.duplicateInFile).length,
  }
}

/**
 * Note which rows ABC already holds for this event.
 *
 * Mutates nothing — returns a new preview — and changes no state: an
 * already-imported company is still imported, because that is how a refreshed
 * stand number reaches ABC. The point of saying so is that a person looking at
 * "500 rows" should be able to see that 480 of them are a re-import of what
 * they loaded last week, rather than 480 new companies.
 */
export function markAlreadyImported(
  preview: ImportPreview,
  knownDomains: Set<string>,
  knownNames: Set<string>
): ImportPreview {
  const records = preview.records.map((record) => {
    if (record.state === 'invalid') return record
    const domain = record.website
    const name = record.companyName ? normalizeCompanyName(record.companyName) : ''
    const known = (domain && knownDomains.has(domain)) || (!domain && name !== '' && knownNames.has(name))
    if (!known) return record

    return {
      ...record,
      alreadyImported: true,
      issues: [...record.issues, issue('warning', 'already_imported')],
      state: record.state === 'valid' ? ('warning' as const) : record.state,
    }
  })

  return { ...preview, records, counts: countPreview(records) }
}

/** The rows that will actually be written. */
export function importableExhibitors(
  exhibitors: ProviderExhibitor[],
  preview: ImportPreview
): ProviderExhibitor[] {
  return exhibitors.filter((_, index) => {
    const record = preview.records[index]
    return record && record.state !== 'invalid' && !record.duplicateInFile
  })
}
