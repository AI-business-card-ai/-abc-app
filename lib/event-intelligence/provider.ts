/**
 * The seam between ABC and wherever event data comes from.
 *
 * ABC's core must never learn the shape of a provider's payload. A scraper's
 * field names, an actor's run ids, a directory's pagination cursors — all of
 * that stops at the provider module, which hands back the two types below and
 * nothing else. That is what makes the source replaceable: swapping one for
 * another is a new file implementing this interface, not a search through the
 * application for a vendor's vocabulary.
 *
 * Possible implementations, in the order they are likely to matter:
 *
 *   JsonFixtureProvider     local synthetic data — the only one that exists
 *   CsvEventProvider        an organiser's export
 *   OfficialEventApiProvider an organiser's own API, where one exists
 *   ApifyEventProvider      documented in docs/event-intelligence/apify-provider.md,
 *                           deliberately not built: choosing an actor, paying
 *                           for runs and accepting a source's terms are owner
 *                           decisions, not engineering ones
 *
 * Two rules every implementation follows:
 *
 *   1. Never invent. A field the source does not give is null or absent, never
 *      a plausible default. A missing stand has to reach the screen as missing.
 *   2. Identify stably. `providerRecordId` must name the same real-world thing
 *      across runs, because it is what makes a re-import free rather than
 *      duplicative.
 */

/** Which event to fetch, in the provider's own terms. */
export type ProviderEventRef = {
  /** The provider's identifier for the event. */
  providerEventId: string
}

/** An event as a source describes it. ABC's vocabulary, not the source's. */
export type ProviderEvent = {
  providerRecordId: string
  name: string
  editionYear?: number | null
  organizer?: string | null
  venue?: string | null
  city?: string | null
  country?: string | null
  /** ISO date, `YYYY-MM-DD`. */
  startsOn?: string | null
  endsOn?: string | null
  websiteUrl?: string | null
  sourceUrl?: string | null
  sourceUpdatedAt?: string | null
}

/**
 * One exhibitor listing.
 *
 * Note that this carries both company-level facts and event-level facts, and
 * that ingestion splits them: the website and the description of what a company
 * is belong to the company, while the hall, the stand and the categories the
 * organiser filed it under belong only to its presence at this event.
 *
 * Deliberately absent: any personal data. No names of staff, no direct emails,
 * no phone numbers, no social profiles. Exhibitor *people* are out of scope for
 * this phase and adding them is a privacy decision, not a schema change.
 */
export type ProviderExhibitor = {
  providerRecordId: string

  companyName: string
  website?: string | null
  country?: string | null
  companyDescription?: string | null
  companyCategories?: string[]

  exhibitorDisplayName?: string | null
  hall?: string | null
  stand?: string | null
  eventCategories?: string[]
  eventDescription?: string | null
  productsServices?: string[]

  listingUrl?: string | null
  sourceUpdatedAt?: string | null
}

export interface EventDataProvider {
  /** Stable, and namespaced by kind: 'fixture:abc-expo', 'apify:<actor>', 'csv'. */
  readonly id: string

  /** How the provider describes itself to a reader of the match detail. */
  readonly displayName: string

  /** The payload shape this provider currently emits. Part of the source key. */
  readonly payloadVersion: string

  fetchEvent(ref: ProviderEventRef): Promise<ProviderEvent | null>

  /**
   * Exhibitors, streamed.
   *
   * An iterable rather than an array because a real directory is thousands of
   * rows behind a paginated API, and ingestion should be able to start writing
   * before the last page arrives.
   */
  fetchExhibitors(ref: ProviderEventRef): AsyncIterable<ProviderExhibitor>
}
