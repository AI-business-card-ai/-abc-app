import { eventKeyFromName } from '@/lib/events/workspace'
import {
  contentHash,
  normalizeCompanyName,
  normalizeDomain,
  sourceList,
  sourceText,
} from '@/lib/event-intelligence/normalize'
import type {
  EventDataProvider,
  ProviderEvent,
  ProviderEventRef,
  ProviderExhibitor,
} from '@/lib/event-intelligence/provider'

/**
 * Turning what a provider says into ABC's event graph.
 *
 * Everything here is backend-agnostic: it talks to an `IngestStore` and never
 * to Supabase, so the same orchestration that runs in production is what the
 * test suite drives against a real Postgres. The two properties it exists to
 * guarantee:
 *
 *   **Idempotent.** Importing the same listing twice changes nothing. The
 *   source record's content hash decides whether anything is written at all, so
 *   a nightly refresh of an unchanged directory is a pile of reads.
 *
 *   **Traceable.** Every company and presence it writes has a source record
 *   naming the provider, the provider's own id for the record, the URL where
 *   applicable and when it was fetched. Nothing enters the graph anonymously.
 */

// ── The storage seam ─────────────────────────────────────────────

export type EventUpsert = {
  eventKey: string
  name: string
  editionYear: number | null
  organizer: string | null
  venue: string | null
  city: string | null
  country: string | null
  startsOn: string | null
  endsOn: string | null
  websiteUrl: string | null
}

export type CompanyUpsert = {
  displayName: string
  nameNormalized: string
  websiteDomain: string | null
  country: string | null
  descriptionPublic: string | null
  categories: string[]
  mergeCandidateOf: string | null
}

export type PresenceUpsert = {
  eventId: string
  companyId: string
  exhibitorDisplayName: string | null
  hall: string | null
  stand: string | null
  eventCategories: string[]
  eventDescription: string | null
  productsServices: string[]
  listingUrl: string | null
  lastSeenAt: string
}

export type SourceRecordUpsert = {
  provider: string
  providerRecordId: string
  payloadVersion: string
  sourceUrl: string | null
  entityType: 'event' | 'company' | 'presence'
  entityId: string
  contentHash: string
  fetchedAt: string
  sourceUpdatedAt: string | null
}

export interface IngestStore {
  upsertEvent(input: EventUpsert): Promise<{ id: string }>

  findCompanyByDomain(domain: string): Promise<{ id: string } | null>
  /** The company a previous import of this exact provider record produced. */
  findCompanyBySourceRecord(provider: string, providerRecordId: string): Promise<{ id: string } | null>
  findCompaniesByName(
    nameNormalized: string
  ): Promise<{ id: string; country: string | null; websiteDomain: string | null }[]>
  insertCompany(input: CompanyUpsert): Promise<{ id: string }>
  updateCompany(id: string, input: CompanyUpsert): Promise<void>

  /**
   * Write a presence, or — when `touchOnly` — record only that it was seen
   * again. An unchanged listing must not rewrite a single field.
   */
  upsertPresence(
    input: PresenceUpsert,
    options: { touchOnly: boolean }
  ): Promise<{ id: string; created: boolean }>
  /** Everything at this event that the latest fetch did not mention. */
  markMissingPresencesWithdrawn(eventId: string, seenPresenceIds: string[]): Promise<number>

  findSourceRecord(
    provider: string,
    providerRecordId: string,
    payloadVersion: string
  ): Promise<{ contentHash: string; entityId: string } | null>
  recordSource(input: SourceRecordUpsert): Promise<void>
}

// ── Normalisation ────────────────────────────────────────────────

/** A provider's event, in ABC's terms. Pure; the key comes from the name. */
export function normalizeEvent(event: ProviderEvent): EventUpsert {
  const name = sourceText(event.name) ?? event.name.trim()
  return {
    // The same function the Event Workspace uses for its URLs, so a fair
    // imported here and a fair typed at a stand land on one address.
    eventKey: eventKeyFromName(name),
    name,
    editionYear: typeof event.editionYear === 'number' ? event.editionYear : null,
    organizer: sourceText(event.organizer),
    venue: sourceText(event.venue),
    city: sourceText(event.city),
    country: sourceText(event.country),
    startsOn: sourceText(event.startsOn),
    endsOn: sourceText(event.endsOn),
    websiteUrl: sourceText(event.websiteUrl),
  }
}

/**
 * The company-level half of a listing.
 *
 * `mergeCandidateOf` is filled in by resolution, not here — this only says what
 * the listing claims about the organisation itself.
 */
export function normalizeCompany(exhibitor: ProviderExhibitor): Omit<CompanyUpsert, 'mergeCandidateOf'> {
  const displayName = sourceText(exhibitor.companyName) ?? exhibitor.companyName.trim()
  return {
    displayName,
    nameNormalized: normalizeCompanyName(displayName),
    websiteDomain: normalizeDomain(exhibitor.website),
    country: sourceText(exhibitor.country),
    descriptionPublic: sourceText(exhibitor.companyDescription),
    categories: sourceList(exhibitor.companyCategories),
  }
}

/** The event-level half: where they are and what they brought. */
export function normalizePresence(
  exhibitor: ProviderExhibitor
): Omit<PresenceUpsert, 'eventId' | 'companyId' | 'lastSeenAt'> {
  return {
    exhibitorDisplayName: sourceText(exhibitor.exhibitorDisplayName) ?? sourceText(exhibitor.companyName),
    // A hall or stand the source did not give stays null all the way to the
    // screen. There is no default that would be true.
    hall: sourceText(exhibitor.hall),
    stand: sourceText(exhibitor.stand),
    eventCategories: sourceList(exhibitor.eventCategories),
    eventDescription: sourceText(exhibitor.eventDescription),
    productsServices: sourceList(exhibitor.productsServices),
    listingUrl: sourceText(exhibitor.listingUrl),
  }
}

// ── Company identity ─────────────────────────────────────────────

export type CompanyMatchBasis = 'domain' | 'source_record' | 'name_and_country' | 'new'

export type CompanyResolution = {
  companyId: string
  basis: CompanyMatchBasis
  /** Set when a same-name company existed that ABC would not merge into. */
  mergeCandidateOf: string | null
}

/**
 * Which company a listing is about.
 *
 * Four tiers, in descending order of how much they are worth believing, and the
 * fourth is "do not decide":
 *
 *   1. **Domain.** Two listings giving the same registrable host are the same
 *      company. This is the only signal strong enough to merge on alone.
 *   2. **Provider record.** A listing ABC has imported before resolves to
 *      whatever it resolved to last time, so a re-import cannot drift.
 *   3. **Name and country.** Exact normalised name *and* a country both sides
 *      state and agree on. Weak, and used only when neither side offers a
 *      domain — with a caveat below.
 *   4. **Neither.** A new company, and if a same-name company exists, the new
 *      row points at it as a merge candidate for a human to settle.
 *
 * The caveat on tier 3 matters: if the existing company has a domain and the
 * incoming listing does not, they are *not* merged. The existing row has been
 * positively identified and the new one has not, so folding one into the other
 * would attach an unidentified listing's stand and products to an identified
 * company. Same name, no evidence — that is exactly a merge candidate.
 */
export async function resolveCompany(
  store: IngestStore,
  provider: string,
  exhibitor: ProviderExhibitor,
  normalized: Omit<CompanyUpsert, 'mergeCandidateOf'>
): Promise<CompanyResolution> {
  if (normalized.websiteDomain) {
    const byDomain = await store.findCompanyByDomain(normalized.websiteDomain)
    if (byDomain) {
      return { companyId: byDomain.id, basis: 'domain', mergeCandidateOf: null }
    }
  }

  const bySource = await store.findCompanyBySourceRecord(provider, exhibitor.providerRecordId)
  if (bySource) {
    return { companyId: bySource.id, basis: 'source_record', mergeCandidateOf: null }
  }

  const sameName = normalized.nameNormalized
    ? await store.findCompaniesByName(normalized.nameNormalized)
    : []

  if (sameName.length > 0 && !normalized.websiteDomain && normalized.country) {
    const agreeing = sameName.filter(
      (row) =>
        row.country === normalized.country &&
        // The caveat: an identified company is not merged into by an
        // unidentified listing. If the stored row has a domain and this listing
        // has none, all they share is a name, and attaching this stand and
        // these products to that company would be a guess wearing a fact's
        // clothes.
        row.websiteDomain === null
    )
    // Exactly one, or the agreement means nothing: two same-named companies in
    // one country is precisely where a guess is a coin toss.
    if (agreeing.length === 1) {
      return { companyId: agreeing[0].id, basis: 'name_and_country', mergeCandidateOf: null }
    }
  }

  const created = await store.insertCompany({
    ...normalized,
    mergeCandidateOf: sameName.length > 0 ? sameName[0].id : null,
  })

  return {
    companyId: created.id,
    basis: 'new',
    mergeCandidateOf: sameName.length > 0 ? sameName[0].id : null,
  }
}

// ── The run ──────────────────────────────────────────────────────

export type IngestReport = {
  provider: string
  eventId: string
  eventKey: string
  exhibitorsSeen: number
  companiesCreated: number
  companiesMatched: number
  presencesCreated: number
  presencesUpdated: number
  presencesUnchanged: number
  presencesWithdrawn: number
  mergeCandidates: number
}

/**
 * Import one event's exhibitors.
 *
 * Runs with the service role, from a server job — never from a request an owner
 * makes, because this writes shared reference data that is not theirs.
 */
export async function ingestEvent(
  provider: EventDataProvider,
  ref: ProviderEventRef,
  store: IngestStore,
  now: () => string = () => new Date().toISOString()
): Promise<IngestReport> {
  const providerEvent = await provider.fetchEvent(ref)
  if (!providerEvent) {
    throw new Error(`ingest: provider ${provider.id} has no event ${ref.providerEventId}`)
  }

  const fetchedAt = now()
  const normalizedEvent = normalizeEvent(providerEvent)
  const event = await store.upsertEvent(normalizedEvent)

  await store.recordSource({
    provider: provider.id,
    providerRecordId: providerEvent.providerRecordId,
    payloadVersion: provider.payloadVersion,
    sourceUrl: sourceText(providerEvent.sourceUrl),
    entityType: 'event',
    entityId: event.id,
    contentHash: contentHash(normalizedEvent),
    fetchedAt,
    sourceUpdatedAt: sourceText(providerEvent.sourceUpdatedAt),
  })

  const report: IngestReport = {
    provider: provider.id,
    eventId: event.id,
    eventKey: normalizedEvent.eventKey,
    exhibitorsSeen: 0,
    companiesCreated: 0,
    companiesMatched: 0,
    presencesCreated: 0,
    presencesUpdated: 0,
    presencesUnchanged: 0,
    presencesWithdrawn: 0,
    mergeCandidates: 0,
  }

  const seenPresenceIds: string[] = []

  for await (const exhibitor of provider.fetchExhibitors(ref)) {
    report.exhibitorsSeen++

    const companyFields = normalizeCompany(exhibitor)
    const resolution = await resolveCompany(store, provider.id, exhibitor, companyFields)

    if (resolution.basis === 'new') {
      report.companiesCreated++
      if (resolution.mergeCandidateOf) report.mergeCandidates++
    } else {
      report.companiesMatched++
    }

    const presenceFields = normalizePresence(exhibitor)
    const payload = { company: companyFields, presence: presenceFields }
    const hash = contentHash(payload)

    const previous = await store.findSourceRecord(
      provider.id,
      exhibitor.providerRecordId,
      provider.payloadVersion
    )

    /*
      An unchanged listing is the common case on every refresh after the first,
      and it must be cheap and inert: the presence is touched only to say it was
      seen again, so `last_seen_at` stays honest without a single field being
      rewritten. Nothing downstream — a saved target, a note, a priority — has
      any reason to notice that an import ran.
    */
    const unchanged = previous?.contentHash === hash

    const presence = await store.upsertPresence(
      {
        ...presenceFields,
        eventId: event.id,
        companyId: resolution.companyId,
        lastSeenAt: fetchedAt,
      },
      { touchOnly: unchanged }
    )

    seenPresenceIds.push(presence.id)

    if (presence.created) report.presencesCreated++
    else if (unchanged) report.presencesUnchanged++
    else report.presencesUpdated++

    // A company matched by domain or by an earlier import still gains whatever
    // this listing knows that the stored row does not.
    if (!unchanged && resolution.basis !== 'new') {
      await store.updateCompany(resolution.companyId, {
        ...companyFields,
        mergeCandidateOf: resolution.mergeCandidateOf,
      })
    }

    await store.recordSource({
      provider: provider.id,
      providerRecordId: exhibitor.providerRecordId,
      payloadVersion: provider.payloadVersion,
      sourceUrl: sourceText(exhibitor.listingUrl),
      entityType: 'presence',
      entityId: presence.id,
      contentHash: hash,
      fetchedAt,
      sourceUpdatedAt: sourceText(exhibitor.sourceUpdatedAt),
    })
  }

  report.presencesWithdrawn = await store.markMissingPresencesWithdrawn(event.id, seenPresenceIds)

  return report
}
