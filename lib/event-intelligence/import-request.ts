import { parseCsvDataset, parseJsonDataset, type ProviderDataset } from '@/lib/event-intelligence/providers/import-file'
import { resolveEventEdition } from '@/lib/event-intelligence/event-identity'
import type { ProviderEvent } from '@/lib/event-intelligence/provider'

/**
 * Reading an import request, shared by preview and commit.
 *
 * Both routes must agree on exactly what a request means — a preview that
 * parsed a file differently from the commit that followed it would show
 * somebody one thing and import another. So the reading happens once, here.
 */

/**
 * The ceiling on an uploaded file.
 *
 * 4 MB of CSV is roughly 30,000 exhibitor rows, which is far more than any
 * single fair lists and far less than enough to trouble a request body. It is a
 * guardrail against an accident — a database export pasted into the wrong
 * box — rather than a product limit anybody will meet.
 */
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024

/** And a row ceiling, because a small file can still hold a silly number of rows. */
export const MAX_IMPORT_ROWS = 10000

export type ImportFormat = 'csv' | 'json'

export type ImportRequest = {
  format: ImportFormat
  text: string
  event: ProviderEvent
  eventKey: string
  providerId: string
}

export type ImportRequestResult =
  | { ok: true; request: ImportRequest }
  | { ok: false; error: string; status: number }

export function readImportRequest(body: Record<string, unknown> | null): ImportRequestResult {
  if (!body) return { ok: false, error: 'Expected a JSON body.', status: 400 }

  const format = body.format === 'json' ? 'json' : body.format === 'csv' ? 'csv' : null
  if (!format) {
    return { ok: false, error: 'ABC can read a CSV or a JSON file. Choose which this is.', status: 400 }
  }

  const text = typeof body.text === 'string' ? body.text : ''
  if (!text.trim()) return { ok: false, error: 'That file is empty.', status: 400 }

  /*
    Byte length, not character count. A file of accented company names is
    meaningfully larger than its string length suggests, and the limit exists to
    protect the request rather than to count letters.
  */
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes > MAX_IMPORT_BYTES) {
    const mb = (bytes / (1024 * 1024)).toFixed(1)
    return {
      ok: false,
      error: `That file is ${mb} MB. ABC reads files up to ${MAX_IMPORT_BYTES / (1024 * 1024)} MB.`,
      status: 413,
    }
  }

  const edition = resolveEventEdition((body.event ?? {}) as Record<string, unknown>)
  if (!edition.ok) return { ok: false, error: edition.error, status: 400 }

  /*
    The provider id records what kind of source this was, and it is derived
    here rather than accepted from the client: it ends up in every source
    record, and a caller that could choose it could label an uploaded
    spreadsheet as anything it liked.
  */
  const providerId = format === 'csv' ? 'csv:upload' : 'json:upload'

  const event: ProviderEvent = {
    providerRecordId: edition.eventKey,
    name: edition.edition.name,
    editionYear: edition.edition.editionYear,
    city: edition.edition.city,
    country: edition.edition.country,
    venue: edition.edition.venue,
    organizer: edition.edition.organizer,
    startsOn: edition.edition.startsOn,
    endsOn: edition.edition.endsOn,
    websiteUrl: edition.edition.websiteUrl,
    sourceUrl: null,
    sourceUpdatedAt: null,
  }

  return { ok: true, request: { format, text, event, eventKey: edition.eventKey, providerId } }
}

export type ParsedImport =
  | { ok: true; dataset: ProviderDataset; warnings: string[] }
  | { ok: false; error: string }

export function parseImport(request: ImportRequest): ParsedImport {
  const parsed =
    request.format === 'csv'
      ? parseCsvDataset(request.text, request.event, request.providerId)
      : parseJsonDataset(request.text, request.event, request.providerId)

  if (!parsed.ok) return parsed

  if (parsed.dataset.exhibitors.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: `That file holds ${parsed.dataset.exhibitors.length} exhibitors. ABC reads up to ${MAX_IMPORT_ROWS} at a time.`,
    }
  }

  return parsed
}
