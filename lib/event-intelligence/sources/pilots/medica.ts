import type { ProviderEvent } from '@/lib/event-intelligence/provider'
import type { OfficialDirectoryConfig } from '@/lib/event-intelligence/sources/official-directory'
import type { ListingFieldMap } from '@/lib/event-intelligence/sources/mapping'

/**
 * MEDICA 2026 — the pilot event for the Event Data Engine.
 *
 * This file is configuration, not an adapter: the edition as the organiser
 * publishes it, and where a structured exhibitor feed would be read. The
 * engine is generic; MEDICA is its first validation case, and a second fair
 * is a second file like this one.
 *
 * ## Real-source status: NOT READ — three independent reasons
 *
 * medica-tradefair.com/robots.txt, read raw on 2026-09-22 by ABC's own
 * fetcher (robots.txt only, nothing else requested):
 *
 *   * `User-agent: *` — in two groups, merged — disallows `/kati-cgi/kati/` and
 *     `/vis/v1/en/search`. The directory pages (`/vis/v1/en/directory/…`) are
 *     not disallowed for a generic crawler.
 *   * GPTBot, ClaudeBot, Google-Extended, PerplexityBot and ChatGPT-User are
 *     each disallowed `/vis/` — the whole exhibitor directory — by name.
 *
 * (An earlier note here, written from a tool's summary rather than the raw
 * file, said `/vis/` was disallowed for every agent. It was wrong, and
 * reading the raw file is also what found that ABC's parser used only the
 * first of the two `*` groups.)
 *
 * So:
 *
 *   1. **AI opt-out.** The organiser has reserved `/vis/` against AI crawlers.
 *      ABC is an AI product, and its fetcher honours that reservation for
 *      itself (`robots_ai_opt_out`), whatever its own user agent is called.
 *   2. **No legal basis.** `legalBasis` is null: nobody has reviewed the
 *      site's terms or taken the decision, and that is the owner's to take.
 *   3. **HTML.** The directory is HTML; the official-directory adapter reads a
 *      structured feed. An HTML reader would be per-site extraction rules, and
 *      is not built.
 *
 * The routes to real MEDICA data are an agreement with the organiser (Messe
 * Düsseldorf) for a licensed feed or an export, or an exhibitor list somebody
 * is entitled to upload as a file. Until then the pilot runs against a
 * fixture shaped like a structured feed, and every result from it is
 * FIXTURE-tested, not real.
 *
 * The edition facts below are public (dates, venue, city); nothing in this
 * file was read from the directory.
 */

export const MEDICA_2026: ProviderEvent = {
  providerRecordId: 'medica-2026',
  name: 'MEDICA',
  editionYear: 2026,
  organizer: 'Messe Düsseldorf',
  venue: 'Messe Düsseldorf',
  city: 'Düsseldorf',
  country: 'DE',
  startsOn: '2026-11-16',
  endsOn: '2026-11-19',
  websiteUrl: 'https://www.medica-tradefair.com',
  sourceUrl: null,
  sourceUpdatedAt: null,
}

/** The public directory address. The organiser opts it out for AI crawlers; the adapter refuses it. */
export const MEDICA_DIRECTORY_URL = 'https://www.medica-tradefair.com/vis/v1/en/directory'

/**
 * Where each field lives in a structured feed record, as the fixture models
 * one. A real licensed feed would come with its own field names and replace
 * this map — nothing else.
 */
export const MEDICA_FIELDS: ListingFieldMap = {
  id: ['exhibitorId', 'id'],
  companyName: ['companyName', 'name'],
  website: ['website', 'contact.website'],
  country: ['country', 'address.country'],
  companyDescription: ['profile', 'about'],
  companyCategories: ['sectors'],
  hall: 'hall',
  stand: 'stand',
  location: 'location',
  eventCategories: ['productGroups', 'categories'],
  eventDescription: 'showcase',
  productsServices: ['products'],
  listingUrl: ['profileUrl', 'url'],
  sourceUpdatedAt: 'updatedAt',
}

/**
 * The pilot source configuration. Defaults describe the real, blocked
 * address; tests pass a fixture base URL and a synthetic legal basis.
 */
export function medicaDirectoryConfig(
  overrides: Partial<Pick<OfficialDirectoryConfig, 'access' | 'robots' | 'id' | 'payloadVersion'>> & {
    baseUrl?: string
    maxPages?: number
    pageSize?: number
    withDetail?: boolean
  } = {}
): OfficialDirectoryConfig {
  const base = overrides.baseUrl ?? MEDICA_DIRECTORY_URL
  const pageSize = overrides.pageSize ?? 100
  return {
    id: overrides.id ?? 'official:medica',
    kind: 'official_directory',
    displayName: 'Event directory',
    payloadVersion: overrides.payloadVersion ?? 'v1',
    access: overrides.access ?? { legalBasis: null },
    robots: overrides.robots ?? 'obey',
    event: MEDICA_2026,
    listing: {
      pageUrl: (page) => `${base}/exhibitors?page=${page}&pageSize=${pageSize}`,
      itemsPath: 'exhibitors',
      pageSize,
      maxPages: overrides.maxPages ?? 100,
    },
    detail: overrides.withDetail
      ? {
          url: (record) => (typeof record.exhibitorId === 'string' ? `${base}/exhibitors/${encodeURIComponent(record.exhibitorId)}` : null),
          recordPath: 'exhibitor',
        }
      : undefined,
    fields: MEDICA_FIELDS,
  }
}
