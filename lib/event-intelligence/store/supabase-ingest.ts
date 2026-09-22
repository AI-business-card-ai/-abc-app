import type { SupabaseClient } from '@supabase/supabase-js'
import type { ListingSnapshot } from '@/lib/event-intelligence/change-detection'
import type {
  CompanyRecord,
  EventUpsert,
  IngestStore,
  PresenceRecord,
  PresenceSourceRow,
  SourceRecordUpsert,
} from '@/lib/event-intelligence/ingest'
import type { PresenceStatus } from '@/lib/event-intelligence/types'

/**
 * The ingest store over Supabase, for the service role only.
 *
 * Every table it writes has no owner column and no write grant outside
 * `service_role`, so passing an ordinary request client here would fail at the
 * database rather than quietly write somebody's session into shared data. The
 * guarantee lives in the migration's privileges; this file is only the shape of
 * the statements.
 *
 * Batched throughout. Each method issues one statement per chunk, and nothing
 * here loops a row at a time — against hosted Postgres every statement is a
 * network round trip, and a 2,000-stand fair imported one row at a time is
 * ~16,000 of them.
 *
 * No `user_id` appears anywhere below, because none of these rows have one.
 */

type Row = Record<string, unknown>

/**
 * How many rows go in one statement.
 *
 * PostgREST takes a large array happily; the ceiling in practice is the URL for
 * reads (`in.(…)` is a query string) and the body for writes. 500 keeps a
 * domain list well inside a safe URL length while still turning 5,000 rows into
 * ten statements rather than five thousand.
 */
const CHUNK = 500

function chunked<T>(values: T[], size = CHUNK): T[][] {
  if (values.length === 0) return []
  const out: T[][] = []
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size))
  return out
}

/** How many characters of `in.(…)` values one read may carry. */
const KEY_CHARS_PER_REQUEST = 6000

export function chunkedByLength(values: string[], maxChars: number, maxCount = CHUNK): string[][] {
  const out: string[][] = []
  let current: string[] = []
  let length = 0
  for (const value of values) {
    // +3 for the quoting and the comma PostgREST puts around each value.
    const cost = value.length + 3
    if (current.length > 0 && (length + cost > maxChars || current.length >= maxCount)) {
      out.push(current)
      current = []
      length = 0
    }
    current.push(value)
    length += cost
  }
  if (current.length > 0) out.push(current)
  return out
}

/** A stored snapshot, or not one: anything else is treated as absent. */
function isSnapshot(value: unknown): value is ListingSnapshot {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return Boolean(v.company && typeof v.company === 'object' && v.presence && typeof v.presence === 'object')
}

const str = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || null
}

const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []

function fail(scope: string, error: { code?: string } | null): never {
  // Codes, never messages: a Postgres message can quote a row.
  throw new Error(`event-intelligence ingest: ${scope} failed (${error?.code ?? 'unknown'})`)
}

const COMPANY_COLUMNS =
  'id, display_name, name_normalized, website_domain, country, description_public, categories, merge_candidate_of'

function toCompanyRecord(row: Row): CompanyRecord {
  return {
    id: String(row.id),
    displayName: String(row.display_name ?? ''),
    nameNormalized: String(row.name_normalized ?? ''),
    websiteDomain: str(row.website_domain),
    country: str(row.country),
    descriptionPublic: str(row.description_public),
    categories: list(row.categories),
    mergeCandidateOf: str(row.merge_candidate_of),
  }
}

const companyRow = (company: CompanyRecord): Row => ({
  id: company.id,
  display_name: company.displayName,
  name_normalized: company.nameNormalized,
  website_domain: company.websiteDomain,
  country: company.country,
  description_public: company.descriptionPublic,
  categories: company.categories,
  merge_candidate_of: company.mergeCandidateOf,
  updated_at: new Date().toISOString(),
})

const presenceRow = (presence: PresenceRecord): Row => ({
  id: presence.id,
  event_id: presence.eventId,
  company_id: presence.companyId,
  exhibitor_display_name: presence.exhibitorDisplayName,
  hall: presence.hall,
  stand: presence.stand,
  event_categories: presence.eventCategories,
  event_description: presence.eventDescription,
  products_services: presence.productsServices,
  listing_url: presence.listingUrl,
  status: 'listed',
  last_seen_at: presence.lastSeenAt,
})

export function supabaseIngestStore(supabase: SupabaseClient): IngestStore {
  async function companiesWhere(
    column: string,
    values: string[]
  ): Promise<CompanyRecord[]> {
    const out: CompanyRecord[] = []
    for (const batch of chunked(values)) {
      const { data, error } = await supabase.from('intel_companies').select(COMPANY_COLUMNS).in(column, batch)
      if (error) fail(`findCompaniesBy(${column})`, error)
      for (const row of (data ?? []) as Row[]) out.push(toCompanyRecord(row))
    }
    return out
  }

  return {
    async upsertEvent(input: EventUpsert) {
      const { data, error } = await supabase
        .from('intel_events')
        .upsert(
          {
            event_key: input.eventKey,
            name: input.name,
            edition_year: input.editionYear,
            organizer: input.organizer,
            venue: input.venue,
            city: input.city,
            country: input.country,
            starts_on: input.startsOn,
            ends_on: input.endsOn,
            website_url: input.websiteUrl,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'event_key' }
        )
        .select('id')
        .single()

      if (error || !data) fail('upsertEvent', error)
      return { id: String((data as Row).id) }
    },

    findCompaniesByDomains: (domains) => companiesWhere('website_domain', domains),
    findCompaniesByNames: (names) => companiesWhere('name_normalized', names),
    findCompaniesByIds: (ids) => companiesWhere('id', ids),

    async findEventByKey(eventKey: string) {
      const { data, error } = await supabase.from('intel_events').select('id').eq('event_key', eventKey).maybeSingle()
      if (error) fail('findEventByKey', error)
      return data ? { id: String((data as Row).id) } : null
    },

    async findPresencesForEvent(eventId: string) {
      /*
        Paged rather than one unbounded select: PostgREST caps a response at
        1,000 rows, and a large fair has more presences than that. Asking in
        pages is the difference between a complete refresh and one that
        silently thinks 1,000 stands are the whole fair and withdraws the rest.
      */
      const out: { id: string; companyId: string; status: PresenceStatus }[] = []
      for (let page = 0; page < 50; page++) {
        const from = page * 1000
        const { data, error } = await supabase
          .from('intel_company_presences')
          .select('id, company_id, status')
          .eq('event_id', eventId)
          .order('id', { ascending: true })
          .range(from, from + 999)

        if (error) fail('findPresencesForEvent', error)
        const rows = (data ?? []) as Row[]
        for (const row of rows) {
          out.push({
            id: String(row.id),
            companyId: String(row.company_id),
            status: row.status === 'withdrawn' ? 'withdrawn' : 'listed',
          })
        }
        if (rows.length < 1000) break
      }
      return out
    },

    async findPresenceSources(provider, sourceKeys, payloadVersion) {
      const out: PresenceSourceRow[] = []
      /*
        Chunked by length, not only by count. A source key is the edition plus
        the provider's id, and a provider's id is often the listing URL: 500 of
        those in one `in.(…)` is a query string of tens of kilobytes, past what
        a gateway will accept. Bounded by characters, the request stays small
        whatever the ids look like.
      */
      for (const batch of chunkedByLength(sourceKeys, KEY_CHARS_PER_REQUEST)) {
        const { data, error } = await supabase
          .from('intel_source_records')
          .select('provider_record_id, content_hash, entity_id, snapshot')
          .eq('provider', provider)
          .eq('payload_version', payloadVersion)
          .eq('entity_type', 'presence')
          .in('provider_record_id', batch)

        if (error) fail('findPresenceSources', error)
        for (const row of (data ?? []) as Row[]) {
          out.push({
            providerRecordId: String(row.provider_record_id),
            contentHash: String(row.content_hash),
            entityId: String(row.entity_id),
            snapshot: isSnapshot(row.snapshot) ? row.snapshot : null,
          })
        }
      }
      return out
    },

    async insertCompanies(rows: CompanyRecord[]) {
      for (const batch of chunked(rows)) {
        const { error } = await supabase.from('intel_companies').insert(batch.map(companyRow))
        if (error) fail('insertCompanies', error)
      }
    },

    async updateCompanies(rows: CompanyRecord[]) {
      /*
        Upsert on the primary key, which is an update: the rows were read from
        the database moments ago and carry their own ids. The merge that decides
        what each row should contain already happened in `planIngest`, so there
        is no per-column coalesce here — and therefore no second copy of that
        rule to drift from the first.
      */
      for (const batch of chunked(rows)) {
        const { error } = await supabase.from('intel_companies').upsert(batch.map(companyRow), { onConflict: 'id' })
        if (error) fail('updateCompanies', error)
      }
    },

    async insertPresences(rows: PresenceRecord[]) {
      for (const batch of chunked(rows)) {
        const { error } = await supabase
          .from('intel_company_presences')
          .insert(batch.map((presence) => ({ ...presenceRow(presence), first_seen_at: presence.lastSeenAt })))
        if (error) fail('insertPresences', error)
      }
    },

    async updatePresences(rows: PresenceRecord[]) {
      for (const batch of chunked(rows)) {
        const { error } = await supabase
          .from('intel_company_presences')
          .upsert(
            batch.map((presence) => ({ ...presenceRow(presence), updated_at: new Date().toISOString() })),
            { onConflict: 'id' }
          )
        if (error) fail('updatePresences', error)
      }
    },

    async touchPresences(ids: string[], lastSeenAt: string) {
      /*
        The whole point of the unchanged bucket: one statement per chunk that
        writes two columns. `updated_at` is deliberately not among them — an
        unchanged listing has not been updated, and saying it was would make
        every refresh look like a change to anything watching that column.
      */
      for (const batch of chunked(ids)) {
        const { error } = await supabase
          .from('intel_company_presences')
          .update({ last_seen_at: lastSeenAt, status: 'listed' })
          .in('id', batch)
        if (error) fail('touchPresences', error)
      }
    },

    async markMissingPresencesWithdrawn(eventId: string, fetchedAt: string) {
      /*
        Withdrawn, never deleted. Somebody may have saved this stand as a target
        and written a note on it; removing the row would take the note with it.

        Anything still 'listed' whose last_seen_at predates this run was not in
        the fetch. That is one statement at any size.
      */
      const { data, error } = await supabase
        .from('intel_company_presences')
        .update({ status: 'withdrawn', updated_at: new Date().toISOString() })
        .eq('event_id', eventId)
        .eq('status', 'listed')
        .lt('last_seen_at', fetchedAt)
        .select('id')

      if (error) fail('markMissingPresencesWithdrawn', error)
      return ((data ?? []) as Row[]).length
    },

    async recordSources(rows: SourceRecordUpsert[]) {
      for (const batch of chunked(rows)) {
        const { error } = await supabase.from('intel_source_records').upsert(
          batch.map((input) => ({
            provider: input.provider,
            provider_record_id: input.providerRecordId,
            payload_version: input.payloadVersion,
            source_url: input.sourceUrl,
            entity_type: input.entityType,
            entity_id: input.entityId,
            content_hash: input.contentHash,
            fetched_at: input.fetchedAt,
            source_updated_at: input.sourceUpdatedAt,
            snapshot: input.snapshot ?? null,
            run_id: input.runId ?? null,
          })),
          { onConflict: 'provider,provider_record_id,payload_version' }
        )
        if (error) fail('recordSources', error)
      }
    },
  }
}
