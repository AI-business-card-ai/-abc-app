import type { ProviderEvent, ProviderEventRef } from '@/lib/event-intelligence/provider'
import {
  SourceError,
  accessRefusal,
  type EventSourceAdapter,
  type NormalizedListing,
  type SourceAccess,
  type SourceListing,
  type SourceProbe,
} from '@/lib/event-intelligence/sources/adapter'
import type { PoliteFetcher } from '@/lib/event-intelligence/sources/http'
import { mapListing, type ListingFieldMap } from '@/lib/event-intelligence/sources/mapping'

/**
 * An optional acquisition provider: the dataset of an Apify run that has
 * already finished.
 *
 * ABC is not structurally dependent on it. This is one adapter among several,
 * implementing the same contract as the organiser's feed and the uploaded
 * file, and ingestion never learns that it exists.
 *
 * What it deliberately does **not** do:
 *
 *   * Start runs. Starting an actor is a billed action against somebody's
 *     account, choosing the actor is choosing a third-party dependency, and
 *     both are owner decisions (docs/event-intelligence/apify-provider.md §1).
 *     This reads the output of a run a person chose to make.
 *   * Read a run that has not SUCCEEDED. A running, aborted or timed-out run's
 *     dataset is partial, and a partial dataset published as complete
 *     withdraws every exhibitor it happens to be missing.
 *   * Carry a legal basis of its own. Apify is infrastructure; the question is
 *     whether the *underlying* source may be read, so the configuration must
 *     state that source's basis, and a run of a robots-disallowed directory is
 *     no more acceptable for having been made by somebody else's crawler.
 *
 * Credentials: `APIFY_TOKEN`, server-side, sent in an Authorization header —
 * never in a URL, so it cannot reach a source record, a log line or an error.
 * The run id is supplied at call time and never committed. No token means the
 * source is unavailable, not that it is read anonymously.
 *
 * Status: adapter and mock-tested only. No token exists in this repository and
 * no real run has been read.
 */

export const APIFY_API = 'https://api.apify.com/v2'

export type ApifyDatasetConfig = {
  /** A non-secret label, e.g. the event key. The provider id is `apify:<label>`. */
  label: string
  /** The finished run whose dataset to read. Supplied at runtime; never committed. */
  runId: string
  /** The legal basis of the *underlying* source the run read. */
  access: SourceAccess
  event: ProviderEvent
  fields: ListingFieldMap
  /** A dataset larger than this fails the read rather than being truncated. */
  maxItems: number
  pageSize?: number
  payloadVersion?: string
}

type RawRecord = Record<string, unknown>

type RunInfo = { status: string; datasetId: string | null }

export function apifyDatasetAdapter(
  config: ApifyDatasetConfig,
  fetcher: PoliteFetcher,
  env: Record<string, string | undefined> = process.env
): EventSourceAdapter<RawRecord> {
  const token = (env.APIFY_TOKEN ?? '').trim()
  const pageSize = Math.min(Math.max(config.pageSize ?? 1000, 1), 1000)
  const onlyApify = (url: URL) => url.origin === new URL(APIFY_API).origin
  const request = () => ({
    robots: 'api_terms' as const,
    scope: onlyApify,
    headers: { Authorization: `Bearer ${token}` },
  })

  async function runInfo(): Promise<RunInfo | null> {
    const result = await fetcher.get(`${APIFY_API}/actor-runs/${encodeURIComponent(config.runId)}`, 'json', request())
    if (!result.ok) return null
    try {
      const data = (JSON.parse(result.body) as { data?: { status?: unknown; defaultDatasetId?: unknown } }).data
      return {
        status: typeof data?.status === 'string' ? data.status : 'UNKNOWN',
        datasetId: typeof data?.defaultDatasetId === 'string' ? data.defaultDatasetId : null,
      }
    } catch {
      return null
    }
  }

  return {
    id: `apify:${config.label}`,
    kind: 'secondary',
    // What a reader sees is the kind of source, never the infrastructure.
    displayName: 'Event directory',
    payloadVersion: config.payloadVersion ?? 'v1',
    access: config.access,

    async healthCheck(ref: ProviderEventRef): Promise<SourceProbe> {
      if (!token || !config.runId) return { available: false, reason: 'not_configured' }
      const refused = accessRefusal(config.access)
      if (refused) return { available: false, reason: refused }
      if (ref.providerEventId !== config.event.providerRecordId) return { available: false, reason: 'not_configured' }
      const info = await runInfo()
      if (!info) return { available: false, reason: 'unreachable' }
      if (info.status === 'SUCCEEDED' && info.datasetId) return { available: true }
      if (info.status === 'READY' || info.status === 'RUNNING') return { available: false, reason: 'run_not_finished' }
      return { available: false, reason: 'run_failed' }
    },

    async discoverEvent(ref: ProviderEventRef) {
      return ref.providerEventId === config.event.providerRecordId ? config.event : null
    },

    async *fetchListings(ref: ProviderEventRef): AsyncIterable<SourceListing<RawRecord>> {
      if (ref.providerEventId !== config.event.providerRecordId) return
      const info = await runInfo()
      // Checked again at read time: a health check a minute ago is not a guarantee now.
      if (!info || info.status !== 'SUCCEEDED' || !info.datasetId) throw new SourceError('run_not_succeeded')

      let read = 0
      for (let offset = 0; ; offset += pageSize) {
        const url = `${APIFY_API}/datasets/${encodeURIComponent(info.datasetId)}/items?format=json&clean=true&offset=${offset}&limit=${pageSize}`
        const result = await fetcher.get(url, 'json', request())
        if (!result.ok) throw new SourceError(`dataset_${result.code}`)
        let items: unknown
        try {
          items = JSON.parse(result.body)
        } catch {
          throw new SourceError('dataset_not_json')
        }
        if (!Array.isArray(items)) throw new SourceError('dataset_unexpected_shape')

        for (const item of items) {
          read++
          if (read > config.maxItems) throw new SourceError('dataset_limit_reached')
          const raw = (item && typeof item === 'object' && !Array.isArray(item) ? item : { value: item }) as RawRecord
          yield {
            sourceRecordId: null,
            // The dataset address carries no credential; the listing's own URL, if any, is the provenance a person can check.
            sourceUrl: null,
            retrievedAt: result.retrievedAt,
            raw,
          }
        }
        if (items.length < pageSize) return
      }
    },

    normalizeListing(listing: SourceListing<RawRecord>): NormalizedListing {
      return mapListing(listing.raw, config.fields, null)
    },
  }
}
