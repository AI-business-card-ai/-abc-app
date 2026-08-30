/**
 * The client half of the canonical CSV export.
 *
 * Deliberately free of React and of the DOM, so every claim it makes can be
 * tested without a browser: what the request looks like, what a failure says,
 * and what the saved file is called.
 *
 * The server route is the source of truth. Nothing here builds a CSV — the old
 * client-side exporters assembled rows in the browser from whatever the list
 * screen happened to have loaded, which is how a person met twice came out
 * once. This asks `/api/export/csv` and hands the answer to the browser.
 *
 * Not a CRM provider. No connection is read, no token is involved, and the
 * request carries no provider name.
 */

/** The one route. No variants, so there is nowhere else a download can go. */
export const EXPORT_CSV_PATH = '/api/export/csv'

/** Used when the response does not name the file, or names it unsafely. */
export const FALLBACK_CSV_FILENAME = 'abc-contacts.csv'

/**
 * What a failure says.
 *
 * Fixed strings, both of them. The response body on a failure is the route's
 * own generic message today, but a client that renders whatever the server
 * sent is one deploy away from putting a database error in front of a user.
 * Only the status code is read.
 */
export const CSV_DOWNLOAD_ERROR = 'Could not download your CSV. Please try again.'
export const CSV_SIGNED_OUT_ERROR = 'Your session expired. Sign in again to download.'

/**
 * The request, whole.
 *
 * A GET with no query string and no body. There is no `userId`, no `ownerId`
 * and no provider: the route derives the owner from the session cookie, so a
 * caller has nothing to say about whose contacts these are. There is no row
 * data either — the browser asks for the export, it does not supply it.
 *
 * `?event=` exists on the route and is not sent. See the Phase 7E.1 note: the
 * Contacts screen's event filter reads different columns than the export
 * matches on, so wiring the two together would quietly produce empty files.
 */
export function exportCsvRequest(): { url: string; init: RequestInit } {
  return {
    url: EXPORT_CSV_PATH,
    init: {
      method: 'GET',
      // The session cookie, and nothing else the caller chose.
      credentials: 'same-origin',
      // A contacts export is not something to serve from a stale cache.
      cache: 'no-store',
    },
  }
}

/**
 * Characters a filename may contain before it is allowed near `a.download`.
 *
 * The route generates this name from a date and cannot produce anything else,
 * so the guard never fires in practice. It is here because "the server would
 * never send that" is an assumption, and an assumption in the one place a
 * string becomes a path is worth removing rather than relying on.
 */
const SAFE_FILENAME = /^[A-Za-z0-9._-]{1,120}$/

export function filenameFromDisposition(header: string | null | undefined): string {
  const quoted = /filename="([^"]*)"/.exec(header ?? '')
  const name = (quoted?.[1] ?? '').trim()

  // A leading dot covers `.` and `..`; the character class already excludes
  // every separator, so there is no path left to traverse.
  if (!SAFE_FILENAME.test(name) || name.startsWith('.')) return FALLBACK_CSV_FILENAME
  return name
}

export type CsvDownloadResult =
  | { ok: true; filename: string }
  | { ok: false; message: string }

/**
 * Ask for the export and hand it over.
 *
 * `fetchImpl` and `save` are injected so the whole path can be exercised in a
 * test: the request that goes out, the branch each status takes, and the fact
 * that nothing is saved when the response is not a file.
 *
 * Read-only from end to end. The route is a GET that writes nothing, and this
 * makes exactly one of them per call, so a second click produces a second file
 * and no database state either time.
 */
export async function runCsvDownload(deps: {
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>
  save: (blob: Blob, filename: string) => void
}): Promise<CsvDownloadResult> {
  const { url, init } = exportCsvRequest()

  try {
    const res = await deps.fetchImpl(url, init)

    if (!res.ok) {
      return {
        ok: false,
        message: res.status === 401 ? CSV_SIGNED_OUT_ERROR : CSV_DOWNLOAD_ERROR,
      }
    }

    const blob = await res.blob()
    const filename = filenameFromDisposition(res.headers.get('content-disposition'))
    deps.save(blob, filename)
    return { ok: true, filename }
  } catch {
    // Offline, aborted, or a body that would not read. All the same to a
    // person looking at a button, and none of it theirs to debug.
    return { ok: false, message: CSV_DOWNLOAD_ERROR }
  }
}
