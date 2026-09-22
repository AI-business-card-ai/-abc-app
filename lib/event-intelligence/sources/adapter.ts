import type {
  ProviderEvent,
  ProviderEventRef,
  ProviderExhibitor,
} from '@/lib/event-intelligence/provider'

/**
 * The Event Data Engine's source contract.
 *
 * `EventDataProvider` (provider.ts) is what ingestion consumes: an event and a
 * stream of `ProviderExhibitor`. That does not change, and there is no second
 * ingestion universe — every adapter here ends in exactly that model, and the
 * run (source-run.ts) hands it to the same `prepareIngest` / `commitIngest`
 * the CSV import uses.
 *
 * What an adapter adds is everything *before* that model, which is where real
 * sources differ and where they fail:
 *
 *   healthCheck        is the source configured, lawful to read, and reachable?
 *   discoverEvent      the edition, as the source describes it
 *   fetchListings      every listing, raw, with where and when it was read
 *   fetchListingDetail optional: the detail page, for a thin directory
 *   normalizeListing   raw → ProviderExhibitor, or a reason it cannot be one
 *
 * Splitting "read" from "normalise" is what lets a run count what it
 * discovered, what it parsed and what it rejected — which is what the quality
 * gates judge. A provider that normalised internally could only say "here are
 * 43 exhibitors", and 43 of what it found is not a thing anyone can check.
 *
 * `raw` never leaves the adapter's module boundary in any durable form: the
 * run keeps it in memory for normalisation and drops it. What is stored is the
 * normalised listing (the source record's snapshot), which by construction has
 * no field for personal data.
 */

/** What kind of source this is, which decides how much its facts are worth. */
export type SourceKind =
  | 'official_api'
  | 'official_directory'
  | 'official_detail'
  | 'company_website'
  | 'secondary'
  | 'file'

/**
 * Lower is better. An official structured endpoint beats scraping the
 * organiser's HTML on every axis — legality, stability, completeness, cost —
 * so where both exist the endpoint is used and the directory is not read.
 *
 * `file` ranks with the official API: an export somebody chose to hand ABC is
 * structured data given with permission. It is still judged by the same gates.
 */
export const SOURCE_PRIORITY: Record<SourceKind, number> = {
  official_api: 1,
  file: 1,
  official_directory: 2,
  official_detail: 3,
  company_website: 4,
  secondary: 5,
}

/**
 * Why ABC may read this source at all. Recorded per source, before the first
 * request — not reconstructed afterwards.
 *
 * `null` means nobody has decided, and a source with no basis is not read:
 * the health check fails before any network request is made.
 */
export type LegalBasis =
  /** Written permission or a licence from the organiser. */
  | 'organiser_agreement'
  /** An official API whose published terms permit this use. */
  | 'api_terms'
  /** A public page robots.txt permits, whose terms have been reviewed. */
  | 'public_listing_reviewed'
  /** A file an ABC account uploaded. */
  | 'owner_supplied'
  /** Invented data for tests and demos. Never real. */
  | 'synthetic_fixture'

export type SourceAccess = {
  legalBasis: LegalBasis | null
  /** YYYY-MM-DD, when somebody reviewed the basis. */
  reviewedOn?: string | null
}

export type SourceUnavailable =
  | 'not_configured'
  | 'no_legal_basis'
  | 'robots_disallowed'
  | 'robots_unavailable'
  | 'unreachable'
  | 'access_denied'
  | 'rate_limited'
  | 'protected'
  | 'run_not_finished'
  | 'run_failed'

export type SourceProbe = { available: true } | { available: false; reason: SourceUnavailable }

/** One listing as the source gave it. */
export type SourceListing<Raw = unknown> = {
  /** The source's own stable identifier, when it has one. */
  sourceRecordId: string | null
  /** Where this listing was read. Recorded without credentials. */
  sourceUrl: string | null
  retrievedAt: string
  /** Adapter-internal. Normalised and dropped; never stored. */
  raw: Raw
  /** Where more detail is, for adapters that read detail pages. */
  detailUrl?: string | null
}

export type RejectReason =
  | 'no_company_name'
  | 'no_stable_id'
  | 'malformed'
  | 'not_an_exhibitor'

export type NormalizedListing =
  | { ok: true; exhibitor: ProviderExhibitor; notes?: NormalizationNote[] }
  | { ok: false; reason: RejectReason }

/** Something normalisation noticed and did not guess about. */
export type NormalizationNote = 'location_unparsed' | 'contact_details_removed'

export interface EventSourceAdapter<Raw = unknown> {
  /** Stable and namespaced: 'official:medica', 'apify:<label>', 'csv:upload'. Stored, never shown. */
  readonly id: string
  readonly kind: SourceKind
  /** What a reader sees. Never a vendor's name. */
  readonly displayName: string
  /** Bumped when the adapter's output shape changes. */
  readonly payloadVersion: string
  readonly access: SourceAccess

  /** Never throws. A source that is not available says why. */
  healthCheck(ref: ProviderEventRef): Promise<SourceProbe>
  discoverEvent(ref: ProviderEventRef): Promise<ProviderEvent | null>
  /**
   * Every listing. Throws `SourceError` if the read cannot be completed — a
   * partial listing must never be mistaken for a complete one, because every
   * exhibitor missing from it would be withdrawn.
   */
  fetchListings(ref: ProviderEventRef): AsyncIterable<SourceListing<Raw>>
  /** Resolves null when the detail could not be read; the listing stands as it was. */
  fetchListingDetail?(listing: SourceListing<Raw>): Promise<SourceListing<Raw> | null>
  /** Pure. Rejects rather than invents. */
  normalizeListing(listing: SourceListing<Raw>): NormalizedListing
}

/** A source failure, as a code. Messages can quote URLs and bodies; codes cannot. */
export class SourceError extends Error {
  constructor(readonly code: string) {
    super(`event source: ${code}`)
    this.name = 'SourceError'
  }
}

/** The code of whatever went wrong, without its message. */
export function errorCode(err: unknown, fallback: string): string {
  if (err instanceof SourceError) return err.code
  return fallback
}

/**
 * Which of several configured sources to read for one edition: the best-ranked
 * one whose health check passes. Sources that were refused are reported with
 * their reason, so "why did ABC not use the organiser's directory" has an
 * answer.
 */
export async function selectSource(
  adapters: EventSourceAdapter[],
  ref: ProviderEventRef
): Promise<{ adapter: EventSourceAdapter | null; refused: { id: string; reason: SourceUnavailable }[] }> {
  const ordered = [...adapters].sort(
    (a, b) => SOURCE_PRIORITY[a.kind] - SOURCE_PRIORITY[b.kind] || a.id.localeCompare(b.id)
  )
  const refused: { id: string; reason: SourceUnavailable }[] = []
  for (const adapter of ordered) {
    const probe = await adapter.healthCheck(ref)
    if (probe.available) return { adapter, refused }
    refused.push({ id: adapter.id, reason: probe.reason })
  }
  return { adapter: null, refused }
}

/** The legal-basis gate every adapter's health check starts with. */
export function accessRefusal(access: SourceAccess): SourceUnavailable | null {
  return access.legalBasis ? null : 'no_legal_basis'
}
