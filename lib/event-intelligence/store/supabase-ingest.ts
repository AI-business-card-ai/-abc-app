import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CompanyUpsert,
  EventUpsert,
  IngestStore,
  PresenceUpsert,
  SourceRecordUpsert,
} from '@/lib/event-intelligence/ingest'

/**
 * The ingest store over Supabase, for the service role only.
 *
 * Every table it writes has no owner column and no write grant outside
 * `service_role`, so passing an ordinary request client here would fail at the
 * database rather than quietly write somebody's session into shared data. That
 * is deliberate: the guarantee lives in the migration's privileges, and this
 * file is only the shape of the statements.
 *
 * No `user_id` appears anywhere below, because none of these rows have one.
 */

type Row = Record<string, unknown>

const str = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || null
}

function fail(scope: string, error: { code?: string } | null): never {
  // Codes, never messages: a Postgres message can quote a row.
  throw new Error(`event-intelligence ingest: ${scope} failed (${error?.code ?? 'unknown'})`)
}

export function supabaseIngestStore(supabase: SupabaseClient): IngestStore {
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

    async findCompanyByDomain(domain: string) {
      const { data, error } = await supabase
        .from('intel_companies')
        .select('id')
        .eq('website_domain', domain)
        .maybeSingle()

      if (error) fail('findCompanyByDomain', error)
      return data ? { id: String((data as Row).id) } : null
    },

    async findCompanyBySourceRecord(provider: string, providerRecordId: string) {
      /*
        A presence source record points at a presence, and the presence names the
        company. Going through the presence rather than storing a second company
        record keeps one row per provider record, which is what makes the unique
        key on (provider, provider_record_id, payload_version) meaningful.
      */
      const { data, error } = await supabase
        .from('intel_source_records')
        .select('entity_id, entity_type')
        .eq('provider', provider)
        .eq('provider_record_id', providerRecordId)
        .eq('entity_type', 'presence')
        .maybeSingle()

      if (error) fail('findCompanyBySourceRecord', error)
      const presenceId = data ? str((data as Row).entity_id) : null
      if (!presenceId) return null

      const presence = await supabase
        .from('intel_company_presences')
        .select('company_id')
        .eq('id', presenceId)
        .maybeSingle()

      if (presence.error) fail('findCompanyBySourceRecord.presence', presence.error)
      const companyId = presence.data ? str((presence.data as Row).company_id) : null
      return companyId ? { id: companyId } : null
    },

    async findCompaniesByName(nameNormalized: string) {
      const { data, error } = await supabase
        .from('intel_companies')
        .select('id, country, website_domain')
        .eq('name_normalized', nameNormalized)
        .order('created_at', { ascending: true })

      if (error) fail('findCompaniesByName', error)
      return ((data ?? []) as Row[]).map((row) => ({
        id: String(row.id),
        country: str(row.country),
        websiteDomain: str(row.website_domain),
      }))
    },

    async insertCompany(input: CompanyUpsert) {
      const { data, error } = await supabase
        .from('intel_companies')
        .insert({
          display_name: input.displayName,
          name_normalized: input.nameNormalized,
          website_domain: input.websiteDomain,
          country: input.country,
          description_public: input.descriptionPublic,
          categories: input.categories,
          merge_candidate_of: input.mergeCandidateOf,
        })
        .select('id')
        .single()

      if (error || !data) fail('insertCompany', error)
      return { id: String((data as Row).id) }
    },

    async updateCompany(id: string, input: CompanyUpsert) {
      /*
        A later listing fills gaps; it does not erase what an earlier one knew.
        A directory that omits a website this week has not told us the company
        lost one, so `null` from a source means "no new information" here, while
        a real value replaces the stored one.
      */
      const patch: Row = {
        display_name: input.displayName,
        name_normalized: input.nameNormalized,
        updated_at: new Date().toISOString(),
      }
      if (input.websiteDomain) patch.website_domain = input.websiteDomain
      if (input.country) patch.country = input.country
      if (input.descriptionPublic) patch.description_public = input.descriptionPublic
      if (input.categories.length > 0) patch.categories = input.categories
      if (input.mergeCandidateOf) patch.merge_candidate_of = input.mergeCandidateOf

      const { error } = await supabase.from('intel_companies').update(patch).eq('id', id)
      if (error) fail('updateCompany', error)
    },

    async upsertPresence(input: PresenceUpsert, options: { touchOnly: boolean }) {
      const existing = await supabase
        .from('intel_company_presences')
        .select('id')
        .eq('event_id', input.eventId)
        .eq('company_id', input.companyId)
        .maybeSingle()

      if (existing.error) fail('upsertPresence.find', existing.error)

      if (existing.data) {
        const id = String((existing.data as Row).id)

        // Unchanged: say only that it is still listed.
        const patch: Row = options.touchOnly
          ? { last_seen_at: input.lastSeenAt, status: 'listed' }
          : {
              exhibitor_display_name: input.exhibitorDisplayName,
              hall: input.hall,
              stand: input.stand,
              event_categories: input.eventCategories,
              event_description: input.eventDescription,
              products_services: input.productsServices,
              listing_url: input.listingUrl,
              status: 'listed',
              last_seen_at: input.lastSeenAt,
              updated_at: new Date().toISOString(),
            }

        const { error } = await supabase.from('intel_company_presences').update(patch).eq('id', id)
        if (error) fail('upsertPresence.update', error)
        return { id, created: false }
      }

      const { data, error } = await supabase
        .from('intel_company_presences')
        .insert({
          event_id: input.eventId,
          company_id: input.companyId,
          exhibitor_display_name: input.exhibitorDisplayName,
          hall: input.hall,
          stand: input.stand,
          event_categories: input.eventCategories,
          event_description: input.eventDescription,
          products_services: input.productsServices,
          listing_url: input.listingUrl,
          first_seen_at: input.lastSeenAt,
          last_seen_at: input.lastSeenAt,
        })
        .select('id')
        .single()

      if (error || !data) fail('upsertPresence.insert', error)
      return { id: String((data as Row).id), created: true }
    },

    async markMissingPresencesWithdrawn(eventId: string, seenPresenceIds: string[]) {
      /*
        Withdrawn, never deleted. Somebody may have saved this stand as a target
        and written a note on it; removing the row would take the note with it
        and leave a hole in a plan that nothing could explain.
      */
      let query = supabase
        .from('intel_company_presences')
        .update({ status: 'withdrawn', updated_at: new Date().toISOString() })
        .eq('event_id', eventId)
        .eq('status', 'listed')

      if (seenPresenceIds.length > 0) {
        query = query.not('id', 'in', `(${seenPresenceIds.join(',')})`)
      }

      const { data, error } = await query.select('id')
      if (error) fail('markMissingPresencesWithdrawn', error)
      return ((data ?? []) as Row[]).length
    },

    async findSourceRecord(provider: string, providerRecordId: string, payloadVersion: string) {
      const { data, error } = await supabase
        .from('intel_source_records')
        .select('content_hash, entity_id')
        .eq('provider', provider)
        .eq('provider_record_id', providerRecordId)
        .eq('payload_version', payloadVersion)
        .maybeSingle()

      if (error) fail('findSourceRecord', error)
      if (!data) return null
      return {
        contentHash: String((data as Row).content_hash),
        entityId: String((data as Row).entity_id),
      }
    },

    async recordSource(input: SourceRecordUpsert) {
      const { error } = await supabase.from('intel_source_records').upsert(
        {
          provider: input.provider,
          provider_record_id: input.providerRecordId,
          payload_version: input.payloadVersion,
          source_url: input.sourceUrl,
          entity_type: input.entityType,
          entity_id: input.entityId,
          content_hash: input.contentHash,
          fetched_at: input.fetchedAt,
          source_updated_at: input.sourceUpdatedAt,
        },
        { onConflict: 'provider,provider_record_id,payload_version' }
      )

      if (error) fail('recordSource', error)
    },
  }
}
