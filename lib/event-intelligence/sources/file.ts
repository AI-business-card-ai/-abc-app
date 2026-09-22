import type { ProviderEventRef, ProviderExhibitor } from '@/lib/event-intelligence/provider'
import type { ProviderDataset } from '@/lib/event-intelligence/providers/import-file'
import type {
  EventSourceAdapter,
  NormalizedListing,
  SourceListing,
} from '@/lib/event-intelligence/sources/adapter'

/**
 * An exhibitor list somebody uploaded, as an event source.
 *
 * The CSV and JSON parsers (providers/import-file.ts) already clean and
 * validate every row; this only lets a parsed file go through the same run as
 * every other source, so an upload is judged by the same quality gates. That
 * matters more for files than for anything else: re-uploading a truncated
 * export would otherwise withdraw every exhibitor it happens to leave out.
 */
export function fileSourceAdapter(
  dataset: ProviderDataset,
  providerId: string,
  retrievedAt: () => string = () => new Date().toISOString()
): EventSourceAdapter<ProviderExhibitor> {
  return {
    id: providerId,
    kind: 'file',
    displayName: 'Uploaded exhibitor list',
    payloadVersion: 'v1',
    access: { legalBasis: 'owner_supplied' },

    async healthCheck() {
      return { available: true }
    },

    async discoverEvent(ref: ProviderEventRef) {
      return ref.providerEventId === dataset.event.providerRecordId ? dataset.event : null
    },

    async *fetchListings(ref: ProviderEventRef): AsyncIterable<SourceListing<ProviderExhibitor>> {
      if (ref.providerEventId !== dataset.event.providerRecordId) return
      const at = retrievedAt()
      for (const exhibitor of dataset.exhibitors) {
        yield { sourceRecordId: exhibitor.providerRecordId, sourceUrl: exhibitor.listingUrl ?? null, retrievedAt: at, raw: exhibitor }
      }
    },

    normalizeListing(listing: SourceListing<ProviderExhibitor>): NormalizedListing {
      const exhibitor = listing.raw
      if (!exhibitor.companyName?.trim()) return { ok: false, reason: 'no_company_name' }
      if (!exhibitor.providerRecordId?.trim()) return { ok: false, reason: 'no_stable_id' }
      return { ok: true, exhibitor }
    },
  }
}
