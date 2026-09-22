import { randomUUID } from 'node:crypto'
import {
  emptyChangeSummary,
  recordChange,
  snapshotDiff,
  type ChangeSummary,
  type ListingChangeKind,
  type ListingSnapshot,
} from '@/lib/event-intelligence/change-detection'
import { eventEditionKey } from '@/lib/event-intelligence/event-identity'
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
import type { PresenceStatus } from '@/lib/event-intelligence/types'

/**
 * Turning what a provider says into ABC's event graph.
 *
 * Backend-agnostic: this talks to an `IngestStore` and never to Supabase, so
 * the orchestration that runs in production is what the test suite drives
 * against a real Postgres.
 *
 * ## Shape, and why it is this shape
 *
 * Read everything, decide everything in memory, then write everything — three
 * phases, each of a bounded number of statements, rather than a loop that asks
 * the database eight questions per exhibitor.
 *
 * The row-at-a-time version that came before was correct and fine on 21
 * fixture rows. It was also ~8 statements per exhibitor, which is ~16,000
 * statements for a 2,000-stand fair. Locally, against PGlite, that is a
 * second or two. Against hosted Postgres every one of those is a network round
 * trip, and the import stops being something a person waits for.
 *
 * So the middle phase — `planIngest` — is pure. Identity resolution,
 * idempotency and the merge rules all happen on plain objects, which is also
 * what makes them testable without a database at all.
 *
 * The two properties this exists to guarantee are unchanged:
 *
 *   **Idempotent.** Importing the same listing twice changes nothing. The
 *   content hash decides whether anything is written, so a refresh of an
 *   unchanged directory is a handful of reads.
 *
 *   **Traceable.** Every company and presence has a source record naming the
 *   provider, its own id for the record, the URL where there is one, and when
 *   it was fetched.
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
  /** What the source said, as hashed. Presence records only. */
  snapshot?: ListingSnapshot | null
  /** The source run that wrote this, when the write came through one. */
  runId?: string | null
}

/** A company as it exists in the graph. */
export type CompanyRecord = CompanyUpsert & { id: string }
export type PresenceRecord = PresenceUpsert & { id: string }

/** What a previous import of one listing left behind. */
export type PresenceSourceRow = {
  providerRecordId: string
  contentHash: string
  entityId: string
  /** Absent for records written before snapshots existed. */
  snapshot?: ListingSnapshot | null
}

/**
 * The key a listing's source record is stored under: the edition, then the
 * provider's own id for the listing.
 *
 * A listing is always a listing *at one edition*. Organisers commonly keep an
 * exhibitor's id across years, and a spreadsheet's row ids restart at 1 for
 * every fair, so the provider's id alone is not unique across editions — and
 * `intel_source_records` is unique on `(provider, provider_record_id,
 * payload_version)`. Stored unscoped, importing MEDICA 2027 re-pointed MEDICA
 * 2026's source records at the 2027 presences: the 2026 stands silently lost
 * their provenance, and a refresh of 2026 then compared its listings against
 * 2027's hashes. Scoping the key by the edition is what keeps two editions'
 * provenance apart, and it needs no change to the table.
 */
export function listingSourceKey(eventKey: string, providerRecordId: string): string {
  return `${eventKey}::${providerRecordId}`
}

/**
 * Everything the store must do, in batches.
 *
 * Each method takes or returns a set rather than a row. An implementation is
 * free to chunk internally — both of ABC's do — but nothing here invites a
 * caller to iterate.
 */
export interface IngestStore {
  upsertEvent(input: EventUpsert): Promise<{ id: string }>

  /**
   * An edition ABC already holds, without writing anything. A gated run reads
   * the graph through this, so a run its quality gates refuse leaves no trace
   * — not even a touched event row.
   */
  findEventByKey(eventKey: string): Promise<{ id: string } | null>

  findCompaniesByDomains(domains: string[]): Promise<CompanyRecord[]>
  findCompaniesByNames(nameNormalized: string[]): Promise<CompanyRecord[]>
  findCompaniesByIds(ids: string[]): Promise<CompanyRecord[]>

  /**
   * Presences already recorded for this event, so identity survives a refresh.
   * `status` is what lets a run project what it would withdraw before it
   * withdraws anything; a store that omits it is read as "listed".
   */
  findPresencesForEvent(eventId: string): Promise<{ id: string; companyId: string; status?: PresenceStatus }[]>

  /** What a previous import of these exact source keys produced. */
  findPresenceSources(
    provider: string,
    sourceKeys: string[],
    payloadVersion: string
  ): Promise<PresenceSourceRow[]>

  insertCompanies(rows: CompanyRecord[]): Promise<void>
  updateCompanies(rows: CompanyRecord[]): Promise<void>

  insertPresences(rows: PresenceRecord[]): Promise<void>
  updatePresences(rows: PresenceRecord[]): Promise<void>
  /** Say only that these were seen again. An unchanged listing rewrites nothing. */
  touchPresences(ids: string[], lastSeenAt: string): Promise<void>

  /**
   * Everything at this event the latest fetch did not mention.
   *
   * Identified by timestamp rather than by a list of ids: every presence this
   * run saw had last_seen_at set to the run time, so the ones that did not are
   * exactly the ones older than it. One small statement whether the fair has
   * twenty stands or five thousand — the id list would have been a query string
   * with five thousand UUIDs in it.
   */
  markMissingPresencesWithdrawn(eventId: string, fetchedAt: string): Promise<number>

  recordSources(rows: SourceRecordUpsert[]): Promise<void>
}

// ── Normalisation ────────────────────────────────────────────────

/** A provider's event, in ABC's terms. Pure; the key comes from the edition. */
export function normalizeEvent(event: ProviderEvent): EventUpsert {
  const name = sourceText(event.name) ?? event.name.trim()
  return {
    /*
      The same address space the Event Workspace uses for its URLs, so a fair
      imported here and a fair typed at a stand land on one key — but derived
      per *edition*, not per name. See event-identity.ts for what goes wrong
      when two years of one fair share a key.
    */
    eventKey: eventEditionKey(name, typeof event.editionYear === 'number' ? event.editionYear : null),
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

/** The company-level half of a listing. */
export function normalizeCompany(exhibitor: ProviderExhibitor): Omit<CompanyUpsert, 'mergeCandidateOf'> {
  const displayName = sourceText(exhibitor.companyName) ?? (exhibitor.companyName ?? '').trim()
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

/**
 * A later listing fills gaps; it does not erase what an earlier one knew.
 *
 * A directory that omits a website this week has not said the company lost
 * one, so an absent value means "no new information" and a real one replaces
 * what is stored. This used to live in SQL, once per backend, which is two
 * places for one rule to drift.
 */
function mergeCompany(existing: CompanyRecord, incoming: Omit<CompanyUpsert, 'mergeCandidateOf'>): CompanyRecord {
  return {
    id: existing.id,
    displayName: incoming.displayName || existing.displayName,
    nameNormalized: incoming.nameNormalized || existing.nameNormalized,
    websiteDomain: incoming.websiteDomain ?? existing.websiteDomain,
    country: incoming.country ?? existing.country,
    descriptionPublic: incoming.descriptionPublic ?? existing.descriptionPublic,
    categories: incoming.categories.length > 0 ? incoming.categories : existing.categories,
    mergeCandidateOf: existing.mergeCandidateOf,
  }
}

// ── Company identity ─────────────────────────────────────────────

export type CompanyMatchBasis = 'domain' | 'source_record' | 'name_and_country' | 'new'

/**
 * Which company a listing is about.
 *
 * Four tiers, in descending order of how much they are worth believing, and the
 * fourth is "do not decide":
 *
 *   1. **Domain.** Two listings giving the same registrable host are the same
 *      company. The only signal strong enough to merge on alone.
 *   2. **Provider record.** A listing ABC imported before resolves to whatever
 *      it resolved to last time, so a re-import cannot drift.
 *   3. **Name and country.** Exact normalised name *and* a country both sides
 *      state and agree on — used only when neither side offers a domain. An
 *      identified company is never merged into by an unidentified listing: if
 *      the stored row has a domain and the incoming listing has none, all they
 *      share is a name, and folding one into the other would attach an
 *      unidentified stand to an identified company.
 *   4. **Neither.** A new company, and if a same-name company exists, the new
 *      row points at it as a merge candidate for a human to settle.
 *
 * Pure: it reads the maps the batched phase fetched, and decides nothing by
 * asking the database.
 */
export type IdentityIndex = {
  byDomain: Map<string, CompanyRecord>
  byName: Map<string, CompanyRecord[]>
  /** provider record id → the company a previous import resolved it to. */
  bySourceRecord: Map<string, CompanyRecord>
}

export function resolveCompanyIdentity(
  normalized: Omit<CompanyUpsert, 'mergeCandidateOf'>,
  providerRecordId: string,
  index: IdentityIndex
): { company: CompanyRecord | null; basis: CompanyMatchBasis; mergeCandidateOf: string | null } {
  if (normalized.websiteDomain) {
    const byDomain = index.byDomain.get(normalized.websiteDomain)
    if (byDomain) return { company: byDomain, basis: 'domain', mergeCandidateOf: null }
  }

  const bySource = index.bySourceRecord.get(providerRecordId)
  if (bySource) return { company: bySource, basis: 'source_record', mergeCandidateOf: null }

  const sameName = normalized.nameNormalized ? index.byName.get(normalized.nameNormalized) ?? [] : []

  if (sameName.length > 0 && !normalized.websiteDomain && normalized.country) {
    const agreeing = sameName.filter(
      (row) => row.country === normalized.country && row.websiteDomain === null
    )
    // Exactly one, or the agreement means nothing: two same-named companies in
    // one country is precisely where a guess is a coin toss.
    if (agreeing.length === 1) {
      return { company: agreeing[0], basis: 'name_and_country', mergeCandidateOf: null }
    }
  }

  return { company: null, basis: 'new', mergeCandidateOf: sameName.length > 0 ? sameName[0].id : null }
}

// ── Planning ─────────────────────────────────────────────────────

export type IngestReport = {
  provider: string
  eventId: string
  eventKey: string
  exhibitorsSeen: number
  companiesCreated: number
  companiesMatched: number
  /** Matched companies this read taught something new — a website, a description. */
  companiesUpdated: number
  presencesCreated: number
  presencesUpdated: number
  presencesUnchanged: number
  presencesWithdrawn: number
  mergeCandidates: number
  /** How many statements the write phase issued. Reported so it can be watched. */
  writeStatements: number
  /** What changed, field by field, against what the source said last time. */
  changes: ChangeSummary
}

export type IngestPlan = {
  companiesToInsert: CompanyRecord[]
  companiesToUpdate: CompanyRecord[]
  presencesToInsert: PresenceRecord[]
  presencesToUpdate: PresenceRecord[]
  presencesToTouch: string[]
  sources: SourceRecordUpsert[]
  seenPresenceIds: string[]
  counts: Omit<
    IngestReport,
    'provider' | 'eventId' | 'eventKey' | 'presencesWithdrawn' | 'writeStatements' | 'changes' | 'companiesUpdated'
  >
  changes: ChangeSummary
  /** Listed at this edition before the run and not seen by it: what committing would withdraw. */
  projectedWithdrawals: number
  /** Listed at this edition before the run. */
  listedBefore: number
}

export type ExistingGraph = {
  index: IdentityIndex
  /** company id → the presence it already has at this event. */
  presenceByCompany: Map<string, string>
  /** provider record id → content hash from the last import. */
  hashByRecord: Map<string, string>
  /** provider record id → what that source said last time, where it was kept. */
  snapshotByRecord?: Map<string, ListingSnapshot>
  /** presence id → its status before this run. Absent means every presence counts as listed. */
  presenceStatus?: Map<string, PresenceStatus>
}

/**
 * Decide everything, write nothing.
 *
 * Rows are processed in order and accumulate, so a company listed twice in one
 * file behaves exactly as it did row-at-a-time: the second listing updates what
 * the first produced rather than creating a second company or a second stand.
 */
export function planIngest(
  exhibitors: ProviderExhibitor[],
  event: { id: string; key: string },
  provider: { id: string; payloadVersion: string },
  existing: ExistingGraph,
  fetchedAt: string
): IngestPlan {
  const eventId = event.id
  const insertedCompanies = new Map<string, CompanyRecord>()
  const updatedCompanies = new Map<string, CompanyRecord>()
  const insertedPresences = new Map<string, PresenceRecord>()
  const updatedPresences = new Map<string, PresenceRecord>()
  const touched = new Set<string>()
  const sources: SourceRecordUpsert[] = []
  const seenPresenceIds: string[] = []
  const seenPresenceSet = new Set<string>()
  const changes = emptyChangeSummary()
  const reappeared = new Set<string>()

  const counts = {
    exhibitorsSeen: 0,
    companiesCreated: 0,
    companiesMatched: 0,
    presencesCreated: 0,
    presencesUpdated: 0,
    presencesUnchanged: 0,
    mergeCandidates: 0,
  }

  /*
    A working copy. The maps grow as the file is read — a company created by row
    12 has to be findable by row 300 — and copying them keeps that growth inside
    this call instead of mutating what the caller handed in.
  */
  const index = {
    byId: new Map<string, CompanyRecord>(),
    byDomain: new Map(existing.index.byDomain),
    byName: new Map([...existing.index.byName].map(([key, rows]) => [key, [...rows]])),
    bySourceRecord: existing.index.bySourceRecord,
  }
  for (const company of index.byDomain.values()) index.byId.set(company.id, company)
  for (const list of index.byName.values()) for (const row of list) index.byId.set(row.id, row)
  for (const company of index.bySourceRecord.values()) index.byId.set(company.id, company)

  /** The company as it stands right now, counting what this run has planned. */
  const currentCompany = (id: string): CompanyRecord | undefined =>
    insertedCompanies.get(id) ?? updatedCompanies.get(id) ?? index.byId.get(id)

  const presenceByCompany = new Map(existing.presenceByCompany)

  for (const exhibitor of exhibitors) {
    counts.exhibitorsSeen++

    const companyFields = normalizeCompany(exhibitor)
    const resolution = resolveCompanyIdentity(companyFields, exhibitor.providerRecordId, index)

    let companyId: string
    if (resolution.company) {
      counts.companiesMatched++
      companyId = resolution.company.id
    } else {
      counts.companiesCreated++
      if (resolution.mergeCandidateOf) counts.mergeCandidates++
      companyId = randomUUID()
      const created: CompanyRecord = { id: companyId, ...companyFields, mergeCandidateOf: resolution.mergeCandidateOf }
      insertedCompanies.set(companyId, created)
      index.byId.set(companyId, created)
      /*
        Make it findable by the rest of this same file. Without this, a company
        listed three times in one export becomes three companies — the row-at-a-
        time version was saved from that by writing as it went.
      */
      if (created.websiteDomain) index.byDomain.set(created.websiteDomain, created)
      if (created.nameNormalized) {
        index.byName.set(created.nameNormalized, [...(index.byName.get(created.nameNormalized) ?? []), created])
      }
    }

    const presenceFields = normalizePresence(exhibitor)
    // The hashed payload is the snapshot: one object, so the stored hash is
    // always the hash of the stored snapshot.
    const snapshot: ListingSnapshot = { company: companyFields, presence: presenceFields }
    const hash = contentHash(snapshot)
    const unchanged = existing.hashByRecord.get(exhibitor.providerRecordId) === hash

    const existingPresenceId = presenceByCompany.get(companyId)
    const presenceId = existingPresenceId ?? randomUUID()

    // What this listing is, relative to what ABC held before this read.
    let kind: ListingChangeKind
    let fields: ReturnType<typeof snapshotDiff> = []
    const previous = existing.snapshotByRecord?.get(exhibitor.providerRecordId)
    if (!existingPresenceId) {
      kind = 'new'
    } else if (existing.presenceStatus?.get(existingPresenceId) === 'withdrawn' && !reappeared.has(existingPresenceId)) {
      reappeared.add(existingPresenceId)
      kind = 'reappeared'
      if (previous && !unchanged) fields = snapshotDiff(previous, snapshot)
    } else if (unchanged) {
      kind = 'unchanged'
    } else {
      kind = 'changed'
      if (previous) fields = snapshotDiff(previous, snapshot)
    }
    recordChange(changes, { providerRecordId: exhibitor.providerRecordId, kind, fields }, kind !== 'changed' || Boolean(previous))
    const presence: PresenceRecord = {
      id: presenceId,
      ...presenceFields,
      eventId,
      companyId,
      lastSeenAt: fetchedAt,
    }

    if (!existingPresenceId) {
      counts.presencesCreated++
      presenceByCompany.set(companyId, presenceId)
      insertedPresences.set(presenceId, presence)
    } else if (unchanged) {
      counts.presencesUnchanged++
      // Only if nothing else in this run already decided to rewrite it.
      if (!insertedPresences.has(presenceId) && !updatedPresences.has(presenceId)) touched.add(presenceId)
    } else {
      counts.presencesUpdated++
      touched.delete(presenceId)
      if (insertedPresences.has(presenceId)) insertedPresences.set(presenceId, presence)
      else updatedPresences.set(presenceId, presence)
    }

    // A set beside the list: `includes` on the list made this loop quadratic,
    // which at 5,000 listings is 12.5 million comparisons for a bookkeeping step.
    if (!seenPresenceSet.has(presenceId)) {
      seenPresenceSet.add(presenceId)
      seenPresenceIds.push(presenceId)
    }

    // A matched company still gains whatever this listing knows that it does not.
    if (!unchanged && resolution.company) {
      const base = currentCompany(companyId) ?? resolution.company
      const merged = mergeCompany(base, companyFields)
      if (insertedCompanies.has(companyId)) insertedCompanies.set(companyId, merged)
      else updatedCompanies.set(companyId, merged)
      index.byId.set(companyId, merged)
    }

    sources.push({
      provider: provider.id,
      providerRecordId: listingSourceKey(event.key, exhibitor.providerRecordId),
      payloadVersion: provider.payloadVersion,
      // The page a person can open; failing that, where ABC read the record.
      sourceUrl: sourceText(exhibitor.listingUrl) ?? sourceText(exhibitor.retrievedFrom),
      entityType: 'presence',
      entityId: presenceId,
      contentHash: hash,
      fetchedAt,
      sourceUpdatedAt: sourceText(exhibitor.sourceUpdatedAt),
      snapshot,
    })
  }

  // What committing this plan would withdraw, known before anything is written.
  let listedBefore = 0
  let projectedWithdrawals = 0
  for (const presenceId of existing.presenceByCompany.values()) {
    if ((existing.presenceStatus?.get(presenceId) ?? 'listed') !== 'listed') continue
    listedBefore++
    if (!seenPresenceSet.has(presenceId)) projectedWithdrawals++
  }
  changes.withdrawn = projectedWithdrawals

  return {
    companiesToInsert: [...insertedCompanies.values()],
    companiesToUpdate: [...updatedCompanies.values()],
    presencesToInsert: [...insertedPresences.values()],
    presencesToUpdate: [...updatedPresences.values()],
    presencesToTouch: [...touched],
    sources,
    seenPresenceIds,
    counts,
    changes,
    projectedWithdrawals,
    listedBefore,
  }
}

// ── The run ──────────────────────────────────────────────────────

/**
 * Everything a run decided, before it wrote anything.
 *
 * The seam the Event Data Engine's quality gates sit in. `prepareIngest` reads
 * the graph and plans in memory; nothing is written until `commitIngest` is
 * called with the result — so a run whose gates fail can be dropped here and
 * leaves the graph exactly as it was.
 */
export type PreparedIngest = {
  provider: { id: string; payloadVersion: string }
  providerEvent: ProviderEvent
  event: EventUpsert
  /** Null when the edition is new: it is created only if this run is committed. */
  eventId: string | null
  /** True when the caller already wrote the event row (the ungated path). */
  eventWritten: boolean
  fetchedAt: string
  exhibitors: ProviderExhibitor[]
  plan: IngestPlan
}

/** Where a plan made for a not-yet-created edition is re-pointed on commit. */
const PENDING_EVENT = 'pending-event'

/**
 * Read the graph for these listings and plan the import. Writes nothing.
 *
 * `options.eventId` is for the ungated path, which has already upserted the
 * event; the gated path passes nothing and the edition is looked up without a
 * write.
 */
export async function prepareIngest(
  provider: EventDataProvider,
  ref: ProviderEventRef,
  store: IngestStore,
  now: () => string = () => new Date().toISOString(),
  options: { eventId?: string; eventWritten?: boolean; providerEvent?: ProviderEvent; fetchedAt?: string } = {}
): Promise<PreparedIngest> {
  const providerEvent = options.providerEvent ?? (await provider.fetchEvent(ref))
  if (!providerEvent) {
    throw new Error(`ingest: provider ${provider.id} has no event ${ref.providerEventId}`)
  }

  const fetchedAt = options.fetchedAt ?? now()
  const normalizedEvent = normalizeEvent(providerEvent)
  const eventId = options.eventId ?? (await store.findEventByKey(normalizedEvent.eventKey))?.id ?? null

  // ── Phase 1: collect, then read the graph in batches ──

  const exhibitors: ProviderExhibitor[] = []
  for await (const exhibitor of provider.fetchExhibitors(ref)) exhibitors.push(exhibitor)

  const domains = new Set<string>()
  const names = new Set<string>()
  const recordIds: string[] = []
  for (const exhibitor of exhibitors) {
    const company = normalizeCompany(exhibitor)
    if (company.websiteDomain) domains.add(company.websiteDomain)
    if (company.nameNormalized) names.add(company.nameNormalized)
    recordIds.push(exhibitor.providerRecordId)
  }

  /*
    Source records are keyed by edition (see `listingSourceKey`). The provider's
    bare ids are asked for too, in the same statement, so records written before
    the key was scoped are still found — but a bare-id row is believed only when
    it points at a presence of *this* edition, which is exactly the confusion
    the scoped key exists to end.
  */
  const scopedKey = (id: string) => listingSourceKey(normalizedEvent.eventKey, id)
  const sourceKeys = eventId ? [...recordIds.map(scopedKey), ...recordIds] : []

  const [byDomainRows, byNameRows, presenceRows, sourceRows] = await Promise.all([
    store.findCompaniesByDomains([...domains]),
    store.findCompaniesByNames([...names]),
    eventId ? store.findPresencesForEvent(eventId) : Promise.resolve([]),
    sourceKeys.length > 0
      ? store.findPresenceSources(provider.id, sourceKeys, provider.payloadVersion)
      : Promise.resolve([] as PresenceSourceRow[]),
  ])

  const presenceByCompany = new Map<string, string>()
  const presenceToCompany = new Map<string, string>()
  const presenceStatus = new Map<string, PresenceStatus>()
  for (const row of presenceRows) {
    presenceByCompany.set(row.companyId, row.id)
    presenceToCompany.set(row.id, row.companyId)
    presenceStatus.set(row.id, row.status ?? 'listed')
  }

  // Scoped rows win; a bare-id row only fills in for a listing with none, and
  // only when it names a presence at this edition.
  const prefix = listingSourceKey(normalizedEvent.eventKey, '')
  const byRecord = new Map<string, PresenceSourceRow>()
  for (const row of sourceRows) {
    if (row.providerRecordId.startsWith(prefix)) byRecord.set(row.providerRecordId.slice(prefix.length), row)
  }
  for (const row of sourceRows) {
    if (row.providerRecordId.startsWith(prefix)) continue
    if (byRecord.has(row.providerRecordId)) continue
    if (!presenceToCompany.has(row.entityId)) continue
    byRecord.set(row.providerRecordId, row)
  }

  // Companies reachable only through a previous import's source record.
  const knownIds = new Set([...byDomainRows, ...byNameRows].map((row) => row.id))
  const extraIds = [
    ...new Set(
      [...byRecord.values()].map((row) => presenceToCompany.get(row.entityId)).filter((id): id is string => Boolean(id))
    ),
  ].filter((id) => !knownIds.has(id))
  const byIdRows = extraIds.length > 0 ? await store.findCompaniesByIds(extraIds) : []

  const byId = new Map<string, CompanyRecord>()
  for (const row of [...byDomainRows, ...byNameRows, ...byIdRows]) byId.set(row.id, row)

  const index: IdentityIndex = {
    byDomain: new Map(byDomainRows.filter((row) => row.websiteDomain).map((row) => [row.websiteDomain as string, row])),
    byName: new Map(),
    bySourceRecord: new Map(),
  }
  for (const row of byNameRows) {
    index.byName.set(row.nameNormalized, [...(index.byName.get(row.nameNormalized) ?? []), row])
  }
  const hashByRecord = new Map<string, string>()
  const snapshotByRecord = new Map<string, ListingSnapshot>()
  for (const [recordId, row] of byRecord) {
    hashByRecord.set(recordId, row.contentHash)
    if (row.snapshot) snapshotByRecord.set(recordId, row.snapshot)
    const companyId = presenceToCompany.get(row.entityId)
    const company = companyId ? byId.get(companyId) : undefined
    if (company) index.bySourceRecord.set(recordId, company)
  }

  // ── Phase 2: decide, in memory ──

  const plan = planIngest(
    exhibitors,
    { id: eventId ?? PENDING_EVENT, key: normalizedEvent.eventKey },
    { id: provider.id, payloadVersion: provider.payloadVersion },
    { index, presenceByCompany, hashByRecord, snapshotByRecord, presenceStatus },
    fetchedAt
  )

  return {
    provider: { id: provider.id, payloadVersion: provider.payloadVersion },
    providerEvent,
    event: normalizedEvent,
    eventId,
    eventWritten: Boolean(options.eventWritten),
    fetchedAt,
    exhibitors,
    plan,
  }
}

/**
 * Write what `prepareIngest` decided.
 *
 * Runs with the service role, from a server job — never from a request an owner
 * makes, because this writes shared reference data that is not theirs.
 */
export async function commitIngest(
  prepared: PreparedIngest,
  store: IngestStore,
  options: { runId?: string | null } = {}
): Promise<IngestReport> {
  const { plan, fetchedAt, provider, providerEvent } = prepared
  const runId = options.runId ?? null

  // ── Phase 3: write, in batches ──

  // The event upsert counts as a write statement whoever made it.
  let writeStatements = 1
  let eventId: string
  if (prepared.eventWritten && prepared.eventId) {
    eventId = prepared.eventId
  } else {
    eventId = (await store.upsertEvent(prepared.event)).id
  }

  // A plan made before the edition existed names a placeholder; re-point it.
  const atEvent = (rows: PresenceRecord[]): PresenceRecord[] =>
    rows.map((row) => (row.eventId === eventId ? row : { ...row, eventId }))

  /*
    Companies before presences, because a presence names a company. Within each
    group the order does not matter, which is what lets them be sets.
  */
  if (plan.companiesToInsert.length > 0) {
    await store.insertCompanies(plan.companiesToInsert)
    writeStatements++
  }
  if (plan.companiesToUpdate.length > 0) {
    await store.updateCompanies(plan.companiesToUpdate)
    writeStatements++
  }
  if (plan.presencesToInsert.length > 0) {
    await store.insertPresences(atEvent(plan.presencesToInsert))
    writeStatements++
  }
  if (plan.presencesToUpdate.length > 0) {
    await store.updatePresences(atEvent(plan.presencesToUpdate))
    writeStatements++
  }
  if (plan.presencesToTouch.length > 0) {
    await store.touchPresences(plan.presencesToTouch, fetchedAt)
    writeStatements++
  }

  await store.recordSources([
    {
      provider: provider.id,
      providerRecordId: providerEvent.providerRecordId,
      payloadVersion: provider.payloadVersion,
      sourceUrl: sourceText(providerEvent.sourceUrl),
      entityType: 'event',
      entityId: eventId,
      contentHash: contentHash(prepared.event),
      fetchedAt,
      sourceUpdatedAt: sourceText(providerEvent.sourceUpdatedAt),
      snapshot: null,
      runId,
    },
    ...plan.sources.map((source) => ({ ...source, runId })),
  ])
  writeStatements++

  const presencesWithdrawn = await store.markMissingPresencesWithdrawn(eventId, fetchedAt)
  writeStatements++

  return {
    provider: provider.id,
    eventId,
    eventKey: prepared.event.eventKey,
    ...plan.counts,
    companiesUpdated: plan.companiesToUpdate.length,
    presencesWithdrawn,
    writeStatements,
    changes: { ...plan.changes, withdrawn: presencesWithdrawn },
  }
}

/**
 * Import one event's exhibitors, ungated.
 *
 * The path the demo fair and the tests of ingestion itself take: the event is
 * upserted first, exactly as it always was, then the listings are planned and
 * written — the same statements as before the split. A source that should be
 * judged before it is published goes through `runEventSource` in
 * source-run.ts, which calls the same two halves with its quality gates
 * between them.
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
  const event = await store.upsertEvent(normalizeEvent(providerEvent))
  const prepared = await prepareIngest(provider, ref, store, now, {
    eventId: event.id,
    eventWritten: true,
    providerEvent,
    fetchedAt,
  })
  return commitIngest(prepared, store)
}
