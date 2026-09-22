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
import { redactUrl, type PoliteFetcher, type RobotsMode } from '@/lib/event-intelligence/sources/http'
import { mapListing, readPath, type ListingFieldMap } from '@/lib/event-intelligence/sources/mapping'

/**
 * An organiser's own structured exhibitor data: an official API or a public
 * JSON endpoint behind their directory.
 *
 * One generic adapter, configured per event — not one adapter per fair. What a
 * fair contributes is a configuration: the edition, where the pages are, and
 * where each field lives in a record. MEDICA is the first such configuration
 * (sources/pilots/medica.ts); nothing here knows about it.
 *
 * JSON only. An HTML directory needs extraction rules written against one
 * site's markup, which is a different and far more brittle thing; it is not
 * built, and the source priority says it should be the second choice anyway.
 *
 * Paged reads stop at the first empty or short page, and fail — they do not
 * truncate — at the page ceiling. A dataset cut off at page 40 of 60 looks
 * exactly like a fair that shrank by a third, and the difference matters,
 * because everything absent from a published read is withdrawn.
 */

export type OfficialDirectoryConfig = {
  /** 'official:<source>'. Stored on every source record; never displayed. */
  id: string
  kind: 'official_api' | 'official_directory'
  displayName?: string
  payloadVersion: string
  access: SourceAccess
  /**
   * `obey` unless this is an authenticated API read under agreed terms. An
   * organiser's public JSON is still a crawl and still obeys robots.txt.
   */
  robots: RobotsMode
  /** The edition this source describes. */
  event: ProviderEvent
  listing: {
    /** Page 1, 2, 3, … */
    pageUrl: (page: number) => string
    /** Where the array of records is in a page's JSON. '' for a bare array. */
    itemsPath: string
    /** A full page has this many records; fewer means the last page. */
    pageSize: number
    /** A read that would need more pages than this fails rather than truncates. */
    maxPages: number
  }
  detail?: {
    /** Where one record's detail JSON is, or null when it has none. */
    url: (record: Record<string, unknown>) => string | null
    /** Where the record is inside the detail JSON. '' for the whole document. */
    recordPath: string
  }
  fields: ListingFieldMap
  /** Extra request headers — an API key header for an agreed API, for instance. Never logged. */
  headers?: () => Record<string, string>
}

type RawRecord = Record<string, unknown>

export function officialDirectoryAdapter(
  config: OfficialDirectoryConfig,
  fetcher: PoliteFetcher
): EventSourceAdapter<RawRecord> {
  const request = () => ({ robots: config.robots, headers: config.headers?.() ?? {} })

  return {
    id: config.id,
    kind: config.kind,
    displayName: config.displayName ?? 'Event directory',
    payloadVersion: config.payloadVersion,
    access: config.access,

    async healthCheck(ref: ProviderEventRef): Promise<SourceProbe> {
      const refused = accessRefusal(config.access)
      if (refused) return { available: false, reason: refused }
      if (ref.providerEventId !== config.event.providerRecordId) return { available: false, reason: 'not_configured' }
      if (config.robots === 'obey') {
        const robots = await fetcher.checkRobots(config.listing.pageUrl(1))
        if (!robots.allowed) {
          if (robots.aiOptOut) return { available: false, reason: 'robots_ai_opt_out' }
          return { available: false, reason: robots.status === 'ok' || robots.status === 'missing' ? 'robots_disallowed' : 'robots_unavailable' }
        }
      }
      return { available: true }
    },

    async discoverEvent(ref: ProviderEventRef) {
      return ref.providerEventId === config.event.providerRecordId ? config.event : null
    },

    async *fetchListings(ref: ProviderEventRef): AsyncIterable<SourceListing<RawRecord>> {
      if (ref.providerEventId !== config.event.providerRecordId) return
      for (let page = 1; page <= config.listing.maxPages; page++) {
        const url = config.listing.pageUrl(page)
        const result = await fetcher.get(url, 'json', request())
        if (!result.ok) throw new SourceError(`listing_${result.code}`)

        let document: unknown
        try {
          document = JSON.parse(result.body)
        } catch {
          throw new SourceError('listing_not_json')
        }
        const items = config.listing.itemsPath ? readPath(document, config.listing.itemsPath) : document
        // The page arrived but not in the shape this source had: the layout changed.
        if (!Array.isArray(items)) throw new SourceError('listing_unexpected_shape')

        for (const item of items) {
          const raw = (item && typeof item === 'object' && !Array.isArray(item) ? item : { value: item }) as RawRecord
          const id = readPath(raw, typeof config.fields.id === 'string' ? config.fields.id : config.fields.id[0])
          yield {
            sourceRecordId: typeof id === 'string' || typeof id === 'number' ? String(id) : null,
            sourceUrl: redactUrl(result.finalUrl),
            retrievedAt: result.retrievedAt,
            raw,
            detailUrl: config.detail?.url(raw) ?? null,
          }
        }

        if (items.length < config.listing.pageSize) return
      }
      throw new SourceError('listing_page_limit_reached')
    },

    async fetchListingDetail(listing: SourceListing<RawRecord>) {
      if (!config.detail || !listing.detailUrl) return listing
      const result = await fetcher.get(listing.detailUrl, 'json', request())
      if (!result.ok) return null
      let document: unknown
      try {
        document = JSON.parse(result.body)
      } catch {
        return null
      }
      const detail = config.detail.recordPath ? readPath(document, config.detail.recordPath) : document
      if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return null
      // The detail page adds to the listing; an empty detail field does not erase a listed one.
      const merged: RawRecord = { ...listing.raw }
      for (const [key, value] of Object.entries(detail as RawRecord)) {
        if (value === null || value === undefined || value === '') continue
        if (Array.isArray(value) && value.length === 0) continue
        merged[key] = value
      }
      return { ...listing, raw: merged, sourceUrl: redactUrl(result.finalUrl), retrievedAt: result.retrievedAt }
    },

    normalizeListing(listing: SourceListing<RawRecord>): NormalizedListing {
      return mapListing(listing.raw, config.fields, listing.sourceUrl)
    },
  }
}
