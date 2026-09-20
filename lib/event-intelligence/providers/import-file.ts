import { JsonFixtureProvider } from '@/lib/event-intelligence/providers/json-fixture'
import { sourceList, sourceText } from '@/lib/event-intelligence/normalize'
import type { ProviderEvent, ProviderExhibitor } from '@/lib/event-intelligence/provider'

/**
 * Event data from a file: a CSV an organiser exported, or a JSON document.
 *
 * This is the realistic first source of real data, and it needs no vendor, no
 * credential and no scraping — an organiser who will send you a spreadsheet has
 * given you better data than any crawler would infer, and they have given it to
 * you with permission. The Apify contract exists for the case where nobody
 * will; this exists for the case where somebody will.
 *
 * Only the parsers live here. Serving a parsed dataset is what
 * `JsonFixtureProvider` already does — it takes a dataset and yields it, which
 * is the whole of the job — so it is re-exported under a name that says so
 * rather than being copied.
 */

export { JsonFixtureProvider as DatasetEventProvider }

export type ProviderDataset = {
  event: ProviderEvent
  exhibitors: ProviderExhibitor[]
  id?: string
}

export type ParseResult =
  | { ok: true; dataset: ProviderDataset; warnings: string[] }
  | { ok: false; error: string }

// ── CSV ──────────────────────────────────────────────────────────

/**
 * A CSV reader that copes with what organisers actually send.
 *
 * Quoted fields, commas and new lines inside quotes, doubled quotes as an
 * escape, CRLF from Windows, and a UTF-8 BOM from Excel — which is the one that
 * silently breaks a naive parser, because the first header becomes "﻿name"
 * and every lookup for "name" misses.
 *
 * Semicolons are accepted as the delimiter too. A German or Czech Excel writes
 * them by default, and this feature is aimed squarely at German trade fairs.
 */
export function parseCsvRows(text: string): string[][] {
  const input = text.replace(/^﻿/, '')
  if (!input.trim()) return []

  // Decide the delimiter from the header line, outside quotes.
  const headerLine = input.slice(0, input.search(/\r?\n/) === -1 ? input.length : input.search(/\r?\n/))
  let commas = 0
  let semicolons = 0
  let inHeaderQuote = false
  for (const char of headerLine) {
    if (char === '"') inHeaderQuote = !inHeaderQuote
    else if (!inHeaderQuote && char === ',') commas++
    else if (!inHeaderQuote && char === ';') semicolons++
  }
  const delimiter = semicolons > commas ? ';' : ','

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < input.length; i++) {
    const char = input[i]

    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\r') {
      // Swallow; the \n that follows ends the row.
    } else if (char === '\n') {
      row.push(field)
      field = ''
      // A blank line is not a record.
      if (row.some((value) => value.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += char
    }
  }

  row.push(field)
  if (row.some((value) => value.trim() !== '')) rows.push(row)

  return rows
}

/**
 * Header names this accepts for each field.
 *
 * Organisers do not agree on any of these, and asking somebody to rename
 * columns before they can try the feature is asking them not to try it.
 * Matching folds case, spaces, underscores and hyphens.
 */
const HEADERS: Record<string, string[]> = {
  id: ['id', 'exhibitorid', 'recordid', 'externalid', 'reference'],
  companyName: ['companyname', 'company', 'name', 'exhibitor', 'exhibitorname', 'aussteller'],
  website: ['website', 'web', 'url', 'homepage', 'companyurl'],
  country: ['country', 'land', 'countrycode'],
  companyDescription: ['description', 'about', 'companydescription', 'profile', 'beschreibung'],
  companyCategories: ['categories', 'category', 'industry', 'industries', 'branche'],
  hall: ['hall', 'halle', 'hallno', 'hallnumber'],
  stand: ['stand', 'booth', 'standno', 'standnumber', 'boothnumber'],
  eventCategories: ['eventcategories', 'exhibitorcategories', 'productgroups', 'productgroup'],
  eventDescription: ['eventdescription', 'standdescription', 'exhibitdescription'],
  productsServices: ['products', 'productsservices', 'services', 'produkte'],
  listingUrl: ['listingurl', 'profileurl', 'exhibitorurl', 'link'],
  sourceUpdatedAt: ['updatedat', 'lastupdated', 'sourceupdatedat', 'modified'],
}

const foldHeader = (value: string) => value.toLowerCase().replace(/[\s_-]+/g, '').trim()

/** Which column holds which field, or -1. First match wins. */
function mapHeaders(header: string[]): Record<string, number> {
  const folded = header.map(foldHeader)
  const index: Record<string, number> = {}
  for (const [field, aliases] of Object.entries(HEADERS)) {
    index[field] = folded.findIndex((name) => aliases.includes(name))
  }
  return index
}

/**
 * A CSV export, as ABC's provider types.
 *
 * `event` is supplied by the caller rather than read from the file: a column of
 * the fair's own name repeated on every row is not how exports are written, and
 * guessing the event from the filename would be a fabrication.
 *
 * A row without a stable identifier is **rejected, not numbered**. Falling back
 * to the row index would make a re-import of a re-ordered export resolve every
 * exhibitor to the wrong company, which is precisely the failure the ingestion
 * contract is built to prevent — see docs/event-intelligence/apify-provider.md §3.
 */
export function parseCsvDataset(text: string, event: ProviderEvent, providerId = 'csv'): ParseResult {
  const rows = parseCsvRows(text)
  if (rows.length === 0) return { ok: false, error: 'That file is empty.' }
  if (rows.length === 1) return { ok: false, error: 'That file has a header row and no exhibitors.' }

  const [header, ...records] = rows
  const index = mapHeaders(header)

  if (index.companyName < 0) {
    return {
      ok: false,
      error: 'No company-name column found. Expected one of: company, company name, name, exhibitor.',
    }
  }

  const warnings: string[] = []
  const at = (row: string[], field: string): string | null => {
    const column = index[field]
    return column >= 0 ? sourceText(row[column]) : null
  }

  const exhibitors: ProviderExhibitor[] = []
  const seen = new Set<string>()
  let skippedNoName = 0
  let skippedNoId = 0

  for (const row of records) {
    const companyName = at(row, 'companyName')
    if (!companyName) {
      skippedNoName++
      continue
    }

    // Identity, in descending order of how stable it is across exports.
    const providerRecordId = at(row, 'id') ?? at(row, 'listingUrl') ?? at(row, 'website')
    if (!providerRecordId) {
      skippedNoId++
      continue
    }
    if (seen.has(providerRecordId)) continue
    seen.add(providerRecordId)

    exhibitors.push({
      providerRecordId,
      companyName,
      website: at(row, 'website'),
      country: at(row, 'country'),
      companyDescription: at(row, 'companyDescription'),
      companyCategories: splitCell(at(row, 'companyCategories')),
      hall: at(row, 'hall'),
      stand: at(row, 'stand'),
      eventCategories: splitCell(at(row, 'eventCategories')),
      eventDescription: at(row, 'eventDescription'),
      productsServices: splitCell(at(row, 'productsServices')),
      listingUrl: at(row, 'listingUrl'),
      sourceUpdatedAt: at(row, 'sourceUpdatedAt'),
    })
  }

  if (skippedNoName > 0) warnings.push(`${skippedNoName} row(s) had no company name and were skipped.`)
  if (skippedNoId > 0) {
    warnings.push(
      `${skippedNoId} row(s) had no id, listing URL or website to identify them and were skipped — a re-import could not match them again.`
    )
  }
  if (exhibitors.length === 0) return { ok: false, error: 'No usable exhibitor rows in that file.' }

  return { ok: true, dataset: { event, exhibitors, id: providerId }, warnings }
}

/** One cell holding several values. Organisers use all three separators. */
function splitCell(value: string | null): string[] {
  if (!value) return []
  return sourceList(value.split(/[;|]|,(?=\s)/))
}

// ── JSON ─────────────────────────────────────────────────────────

/**
 * A JSON document of the same shape ABC's provider types describe.
 *
 * Validated rather than trusted: this is a file somebody uploaded, so every
 * field is read through the same `sourceText` / `sourceList` cleaners the CSV
 * path uses, and anything unrecognised is dropped instead of being passed into
 * the graph. A document is accepted as `{ event, exhibitors }` or as a bare
 * array of exhibitors when the caller already knows the event.
 */
export function parseJsonDataset(text: string, event: ProviderEvent, providerId = 'json'): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' }
  }

  const raw = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { exhibitors?: unknown }).exhibitors)
      ? ((parsed as { exhibitors: unknown[] }).exhibitors)
      : null

  if (!raw) {
    return { ok: false, error: 'Expected a list of exhibitors, or an object with an "exhibitors" list.' }
  }

  const warnings: string[] = []
  const exhibitors: ProviderExhibitor[] = []
  const seen = new Set<string>()
  let skipped = 0

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      skipped++
      continue
    }
    const row = entry as Record<string, unknown>
    const companyName = sourceText(row.companyName) ?? sourceText(row.name) ?? sourceText(row.company)
    const providerRecordId =
      sourceText(row.providerRecordId) ?? sourceText(row.id) ?? sourceText(row.listingUrl) ?? sourceText(row.website)

    if (!companyName || !providerRecordId || seen.has(providerRecordId)) {
      if (!companyName || !providerRecordId) skipped++
      continue
    }
    seen.add(providerRecordId)

    exhibitors.push({
      providerRecordId,
      companyName,
      website: sourceText(row.website),
      country: sourceText(row.country),
      companyDescription: sourceText(row.companyDescription) ?? sourceText(row.description),
      companyCategories: sourceList(row.companyCategories ?? row.categories),
      hall: sourceText(row.hall),
      stand: sourceText(row.stand) ?? sourceText(row.booth),
      eventCategories: sourceList(row.eventCategories),
      eventDescription: sourceText(row.eventDescription),
      productsServices: sourceList(row.productsServices ?? row.products),
      listingUrl: sourceText(row.listingUrl),
      sourceUpdatedAt: sourceText(row.sourceUpdatedAt),
    })
  }

  if (skipped > 0) warnings.push(`${skipped} entr(y/ies) had no name or no stable id and were skipped.`)
  if (exhibitors.length === 0) return { ok: false, error: 'No usable exhibitors in that document.' }

  return { ok: true, dataset: { event, exhibitors, id: providerId }, warnings }
}
