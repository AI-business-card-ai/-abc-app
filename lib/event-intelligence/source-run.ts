import { randomUUID } from 'node:crypto'
import type { ChangeSummary } from '@/lib/event-intelligence/change-detection'
import { eventEditionKey } from '@/lib/event-intelligence/event-identity'
import {
  commitIngest,
  prepareIngest,
  type IngestReport,
  type IngestStore,
} from '@/lib/event-intelligence/ingest'
import type {
  EventDataProvider,
  ProviderEvent,
  ProviderEventRef,
  ProviderExhibitor,
} from '@/lib/event-intelligence/provider'
import {
  baselineOf,
  evaluateQualityGates,
  listingMetrics,
  type GateId,
  type GateResult,
  type SourceMetrics,
} from '@/lib/event-intelligence/source-health'
import {
  errorCode,
  type EventSourceAdapter,
  type RejectReason,
  type SourceKind,
  type SourceListing,
} from '@/lib/event-intelligence/sources/adapter'

/**
 * One read of one event source, from first request to published — or not.
 *
 *   probe       healthCheck: configured, lawful, permitted by robots.txt
 *   discover    the edition, as the source describes it
 *   read        every listing; a read that cannot finish fails whole
 *   detail      detail pages, few at a time, failures counted
 *   normalise   raw → ProviderExhibitor, rejections counted by reason
 *   measure     coverage, rejects, duplicates, detail failures
 *   plan        prepareIngest — identity, changes, projected withdrawals; no writes
 *   gate        the quality gates, against the last published run
 *   publish     commitIngest, only when the gates allow it
 *   record      one intel_source_runs row, whatever happened
 *
 * The same ingestion as every other path: a run ends in the exact
 * `ProviderExhibitor` model, handed to the same `prepareIngest` and
 * `commitIngest` the CSV import uses. There is no second ingestion universe
 * and no second refresh system — change detection, idempotency and withdrawal
 * are the ones ingest.ts already had.
 *
 * Fails safe. An unavailable source, a read that breaks halfway, or a read
 * whose data looks wrong all end with the graph exactly as it was.
 */

export type SourceRunStatus = 'published' | 'blocked' | 'failed'
export type RunHealth = 'healthy' | 'degraded' | 'unhealthy' | 'unavailable'

export type SourceRun = {
  id: string
  provider: string
  sourceKind: SourceKind
  payloadVersion: string
  eventRef: string
  eventKey: string | null
  eventId: string | null
  status: SourceRunStatus
  health: RunHealth
  startedAt: string
  finishedAt: string
  durationMs: number
  metrics: SourceMetrics
  gates: GateResult[]
  /** Codes only. */
  errors: string[]
  overrides: GateId[]
  ingest: IngestReport | null
  changes: ChangeSummary | null
}

export interface SourceRunStore {
  /** The last published run of this provider for this edition: the baseline. */
  latestPublishedRun(provider: string, eventKey: string): Promise<SourceRun | null>
  recordRun(run: SourceRun): Promise<void>
}

export type RunOptions = {
  ingestStore: IngestStore
  runStore: SourceRunStore
  /** ISO timestamps. */
  now?: () => string
  /** Milliseconds, for the duration. */
  clock?: () => number
  /**
   * Gates an operator has explicitly decided to publish despite — a fair that
   * really did shrink. Recorded on the run. Never set by a request an owner
   * makes.
   */
  publishDespite?: GateId[]
  /** How many detail pages are read at once. The fetcher still spaces them per host. */
  detailConcurrency?: number
  /** A read with more listings than this fails rather than being truncated. */
  maxListings?: number
}

export const DEFAULT_MAX_LISTINGS = 20_000

function emptyMetrics(): SourceMetrics {
  return {
    ...listingMetrics({
      discovered: 0,
      accepted: [],
      rejected: {},
      duplicateRecords: 0,
      detailAttempted: 0,
      detailFailed: 0,
      locationUnparsed: 0,
      contactDetailsRemoved: 0,
    }),
    sourceErrors: [],
    durationMs: 0,
  }
}

async function mapLimited<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = next++
      if (index >= items.length) return
      out[index] = await task(items[index])
    }
  })
  await Promise.all(workers)
  return out
}

export async function runEventSource<Raw>(
  adapter: EventSourceAdapter<Raw>,
  ref: ProviderEventRef,
  options: RunOptions
): Promise<SourceRun> {
  const now = options.now ?? (() => new Date().toISOString())
  const clock = options.clock ?? (() => Date.now())
  const started = clock()
  const startedAt = now()
  const overrides = options.publishDespite ?? []
  const maxListings = options.maxListings ?? DEFAULT_MAX_LISTINGS

  const run: SourceRun = {
    id: randomUUID(),
    provider: adapter.id,
    sourceKind: adapter.kind,
    payloadVersion: adapter.payloadVersion,
    eventRef: ref.providerEventId,
    eventKey: null,
    eventId: null,
    status: 'failed',
    health: 'unavailable',
    startedAt,
    finishedAt: startedAt,
    durationMs: 0,
    metrics: emptyMetrics(),
    gates: [],
    errors: [],
    overrides: [],
    ingest: null,
    changes: null,
  }

  const finish = async (): Promise<SourceRun> => {
    run.finishedAt = now()
    run.durationMs = Math.max(0, Math.round(clock() - started))
    run.metrics.durationMs = run.durationMs
    run.metrics.sourceErrors = run.errors
    await options.runStore.recordRun(run)
    return run
  }

  // ── probe ──
  let probe
  try {
    probe = await adapter.healthCheck(ref)
  } catch {
    probe = { available: false as const, reason: 'unreachable' as const }
  }
  if (!probe.available) {
    run.errors.push(probe.reason)
    return finish()
  }

  // ── discover ──
  let event: ProviderEvent | null
  try {
    event = await adapter.discoverEvent(ref)
  } catch (err) {
    run.errors.push(errorCode(err, 'discover_failed'))
    return finish()
  }
  if (!event) {
    run.errors.push('event_not_found')
    return finish()
  }
  run.eventKey = eventEditionKey(event.name, typeof event.editionYear === 'number' ? event.editionYear : null)

  // ── read ──
  const listings: SourceListing<Raw>[] = []
  try {
    for await (const listing of adapter.fetchListings(ref)) {
      listings.push(listing)
      if (listings.length > maxListings) {
        run.errors.push('listing_limit_reached')
        return finish()
      }
    }
  } catch (err) {
    // A read that broke halfway is not a smaller fair.
    run.errors.push(errorCode(err, 'listing_fetch_failed'))
    run.metrics.recordsDiscovered = listings.length
    return finish()
  }

  // ── detail ──
  let detailAttempted = 0
  let detailFailed = 0
  let detailed = listings
  if (adapter.fetchListingDetail) {
    const fetchDetail = adapter.fetchListingDetail.bind(adapter)
    detailed = await mapLimited(listings, options.detailConcurrency ?? 2, async (listing) => {
      if (!listing.detailUrl) return listing
      detailAttempted++
      try {
        const withDetail = await fetchDetail(listing)
        if (withDetail) return withDetail
      } catch {
        // counted below
      }
      detailFailed++
      return listing
    })
  }

  // ── normalise ──
  const accepted: ProviderExhibitor[] = []
  const rejected: Partial<Record<RejectReason, number>> = {}
  const seenIds = new Set<string>()
  let duplicateRecords = 0
  let locationUnparsed = 0
  let contactDetailsRemoved = 0
  for (const listing of detailed) {
    let normalized
    try {
      normalized = adapter.normalizeListing(listing)
    } catch {
      normalized = { ok: false as const, reason: 'malformed' as const }
    }
    if (!normalized.ok) {
      rejected[normalized.reason] = (rejected[normalized.reason] ?? 0) + 1
      continue
    }
    if (normalized.notes?.includes('location_unparsed')) locationUnparsed++
    if (normalized.notes?.includes('contact_details_removed')) contactDetailsRemoved++
    if (seenIds.has(normalized.exhibitor.providerRecordId)) {
      duplicateRecords++
      continue
    }
    seenIds.add(normalized.exhibitor.providerRecordId)
    accepted.push(
      listing.sourceUrl && !normalized.exhibitor.retrievedFrom
        ? { ...normalized.exhibitor, retrievedFrom: listing.sourceUrl }
        : normalized.exhibitor
    )
  }

  const listing = listingMetrics({
    discovered: listings.length,
    accepted,
    rejected,
    duplicateRecords,
    detailAttempted,
    detailFailed,
    locationUnparsed,
    contactDetailsRemoved,
  })
  run.metrics = { ...listing, sourceErrors: [], durationMs: 0 }

  // ── plan: the same ingestion every source uses, nothing written yet ──
  const provider: EventDataProvider = {
    id: adapter.id,
    displayName: adapter.displayName,
    payloadVersion: adapter.payloadVersion,
    fetchEvent: async () => event,
    fetchExhibitors: async function* () {
      yield* accepted
    },
  }

  let prepared
  try {
    prepared = await prepareIngest(provider, ref, options.ingestStore, now)
  } catch (err) {
    run.errors.push(errorCode(err, 'plan_failed'))
    return finish()
  }
  run.eventId = prepared.eventId
  const plan = {
    listedBefore: prepared.plan.listedBefore,
    projectedWithdrawals: prepared.plan.projectedWithdrawals,
    duplicateCompanies: prepared.plan.counts.exhibitorsSeen - prepared.plan.seenPresenceIds.length,
  }
  run.metrics = { ...run.metrics, ...plan }
  run.changes = prepared.plan.changes

  // ── gate ──
  let baseline = null
  try {
    const previous = await options.runStore.latestPublishedRun(adapter.id, prepared.event.eventKey)
    baseline = previous ? baselineOf(previous.metrics) : null
  } catch {
    // No baseline is a weaker judgement, not a reason to publish blind: the
    // withdrawal gate still holds against what is listed now.
    run.errors.push('baseline_unavailable')
  }
  const verdict = evaluateQualityGates(listing, plan, baseline, overrides)
  run.gates = verdict.gates
  run.health = verdict.health
  run.overrides = verdict.gates.filter((g) => g.overridden).map((g) => g.id)

  if (verdict.health === 'unhealthy') {
    run.status = 'blocked'
    return finish()
  }

  // ── publish ──
  try {
    const report = await commitIngest(prepared, options.ingestStore, { runId: run.id })
    run.ingest = report
    run.eventId = report.eventId
    run.changes = report.changes
    run.metrics = {
      ...run.metrics,
      companiesCreated: report.companiesCreated,
      companiesUpdated: report.companiesUpdated,
      presencesCreated: report.presencesCreated,
      presencesUpdated: report.presencesUpdated,
      presencesUnchanged: report.presencesUnchanged,
      presencesWithdrawn: report.presencesWithdrawn,
      writeStatements: report.writeStatements,
    }
    run.status = 'published'
  } catch (err) {
    run.errors.push(errorCode(err, 'commit_failed'))
    run.status = 'failed'
    run.health = 'unavailable'
  }
  return finish()
}
