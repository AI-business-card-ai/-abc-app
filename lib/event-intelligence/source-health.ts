import type { ProviderExhibitor } from '@/lib/event-intelligence/provider'
import type { RejectReason } from '@/lib/event-intelligence/sources/adapter'

/**
 * Source health: what one read of an event source found, and whether it is
 * fit to publish.
 *
 * A read completing is not success. Data quality is. A directory that listed
 * ~5,000 exhibitors yesterday and returns 43 today has not had a quiet day —
 * its pagination broke, or its layout changed, or a filter got stuck — and
 * publishing that read would withdraw 4,957 exhibitors, and every saved target
 * among them, on the strength of a bug.
 *
 * So every run is measured, and the measurements are judged against fixed
 * thresholds and against the last published run of the same source for the
 * same edition. A run that fails a blocking gate is not published: nothing is
 * written except the record that it was refused and why.
 *
 * Internal operational intelligence. None of this appears on the Expo Mission.
 *
 * Pure. Numbers in, a verdict out.
 */

export type Coverage = {
  hall: number
  stand: number
  website: number
  description: number
  categories: number
  country: number
}

/** What was read, before anything was written. */
export type ListingMetrics = {
  recordsDiscovered: number
  recordsParsed: number
  recordsRejected: number
  rejectedByReason: Partial<Record<RejectReason, number>>
  /** The same source id twice in one read — a pagination fault, not two exhibitors. */
  duplicateRecords: number
  detailAttempted: number
  detailFailed: number
  locationUnparsed: number
  contactDetailsRemoved: number
  /** Share of parsed listings that state each field. 0..1. */
  coverage: Coverage
  missingWebsitePct: number
  missingHallPct: number
  missingStandPct: number
}

/** What the plan would do, from prepareIngest — still nothing written. */
export type PlanMetrics = {
  listedBefore: number
  projectedWithdrawals: number
  /** Listings that resolved to a company already listed earlier in this read. */
  duplicateCompanies: number
}

/** What the commit did, once published. */
export type WriteMetrics = {
  companiesCreated: number
  companiesUpdated: number
  presencesCreated: number
  presencesUpdated: number
  presencesUnchanged: number
  presencesWithdrawn: number
  writeStatements: number
}

export type SourceMetrics = ListingMetrics &
  Partial<PlanMetrics> &
  Partial<WriteMetrics> & {
    sourceErrors: string[]
    durationMs: number
  }

const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0)
const pct = (value: number) => Math.round(value * 1000) / 10

/** Coverage over the listings a read accepted. */
export function coverageOf(exhibitors: ProviderExhibitor[]): Coverage {
  const n = exhibitors.length
  const has = (pick: (e: ProviderExhibitor) => unknown) =>
    share(
      exhibitors.filter((e) => {
        const value = pick(e)
        return Array.isArray(value) ? value.length > 0 : typeof value === 'string' ? value.trim() !== '' : Boolean(value)
      }).length,
      n
    )
  return {
    hall: has((e) => e.hall),
    stand: has((e) => e.stand),
    website: has((e) => e.website),
    description: has((e) => e.companyDescription || e.eventDescription),
    categories: has((e) => [...(e.companyCategories ?? []), ...(e.eventCategories ?? [])]),
    country: has((e) => e.country),
  }
}

export function listingMetrics(input: {
  discovered: number
  accepted: ProviderExhibitor[]
  rejected: Partial<Record<RejectReason, number>>
  duplicateRecords: number
  detailAttempted: number
  detailFailed: number
  locationUnparsed: number
  contactDetailsRemoved: number
}): ListingMetrics {
  const coverage = coverageOf(input.accepted)
  const rejected = Object.values(input.rejected).reduce((sum, n) => sum + (n ?? 0), 0)
  return {
    recordsDiscovered: input.discovered,
    recordsParsed: input.accepted.length,
    recordsRejected: rejected,
    rejectedByReason: input.rejected,
    duplicateRecords: input.duplicateRecords,
    detailAttempted: input.detailAttempted,
    detailFailed: input.detailFailed,
    locationUnparsed: input.locationUnparsed,
    contactDetailsRemoved: input.contactDetailsRemoved,
    coverage,
    missingWebsitePct: pct(1 - coverage.website),
    missingHallPct: pct(1 - coverage.hall),
    missingStandPct: pct(1 - coverage.stand),
  }
}

// ── Quality gates ────────────────────────────────────────────────

export type GateId =
  | 'records_present'
  | 'record_count_collapse'
  | 'withdrawal_spike'
  | 'reject_rate'
  | 'empty_name_rate'
  | 'duplicate_rate'
  | 'hall_coverage_collapse'
  | 'stand_coverage_collapse'
  | 'website_coverage_collapse'
  | 'detail_failure_rate'
  | 'layout_change_suspected'

export type GateSeverity = 'block' | 'warn'

export type GateResult = {
  id: GateId
  severity: GateSeverity
  passed: boolean
  /** Set when an operator published despite this gate. */
  overridden?: boolean
  observed: number
  threshold: number
  baseline: number | null
  /** Why, for the person reading a run record. */
  message: string
}

export type SourceHealth = 'healthy' | 'degraded' | 'unhealthy'

/**
 * The thresholds, in one place.
 *
 * Chosen to catch breakage, not ordinary churn: a real fair adds and drops a
 * few percent of its exhibitors between two reads, fills in halls and stands
 * over the weeks before it opens, and never loses half its list overnight.
 */
export const QUALITY_THRESHOLDS = {
  /** Parsed records below this share of the last published run: collapse. */
  countCollapseRatio: 0.5,
  /** A run may not withdraw more than this share of what is listed… */
  withdrawalMaxShare: 0.3,
  /** …though this many always may: a 10-stand fair losing 3 is churn, not a fault. */
  withdrawalFloor: 3,
  /** Rejected over discovered. */
  rejectMaxShare: 0.2,
  /** Listings with no company name, over discovered… */
  emptyNameMaxShare: 0.05,
  /**
   * …though this many always may be: on a small source one blank row is a
   * large percentage and means nothing. The row is rejected either way; the
   * gate exists to notice a parser that has stopped finding names.
   */
  emptyNameFloor: 2,
  /** Duplicate source ids or already-listed companies, over parsed. */
  duplicateMaxShare: 0.1,
  /** …and against the baseline, a spike is this many times its previous rate. */
  duplicateSpikeFactor: 2,
  /** Coverage falling by more than this many points against the baseline. */
  coverageDropPoints: 0.3,
  /** Failed detail pages over attempted. */
  detailFailureMaxShare: 0.2,
  /** Two or more coverage collapses at once reads as a changed layout. */
  layoutCollapseCount: 2,
} as const

export type Baseline = Pick<ListingMetrics, 'recordsParsed' | 'coverage'> & {
  duplicateRate: number
}

export function baselineOf(metrics: SourceMetrics): Baseline {
  const duplicates = (metrics.duplicateRecords ?? 0) + (metrics.duplicateCompanies ?? 0)
  return {
    recordsParsed: metrics.recordsParsed,
    coverage: metrics.coverage,
    duplicateRate: share(duplicates, metrics.recordsParsed),
  }
}

export function evaluateQualityGates(
  listing: ListingMetrics,
  plan: PlanMetrics,
  baseline: Baseline | null,
  overrides: readonly GateId[] = []
): { health: SourceHealth; gates: GateResult[] } {
  const T = QUALITY_THRESHOLDS
  const gates: GateResult[] = []
  const add = (gate: Omit<GateResult, 'overridden'>) => gates.push(gate)

  add({
    id: 'records_present',
    severity: 'block',
    passed: listing.recordsParsed > 0,
    observed: listing.recordsParsed,
    threshold: 1,
    baseline: baseline?.recordsParsed ?? null,
    message: 'The source returned no usable listings.',
  })

  if (baseline && baseline.recordsParsed > 0) {
    const ratio = listing.recordsParsed / baseline.recordsParsed
    add({
      id: 'record_count_collapse',
      severity: 'block',
      passed: ratio >= T.countCollapseRatio,
      observed: listing.recordsParsed,
      threshold: Math.ceil(baseline.recordsParsed * T.countCollapseRatio),
      baseline: baseline.recordsParsed,
      message: `The source returned ${listing.recordsParsed} listings where the last published read had ${baseline.recordsParsed}.`,
    })
  }

  // Works with no baseline at all: what is listed now is the reference.
  const allowedWithdrawals = Math.max(T.withdrawalFloor, Math.floor(plan.listedBefore * T.withdrawalMaxShare))
  add({
    id: 'withdrawal_spike',
    severity: 'block',
    passed: plan.projectedWithdrawals <= allowedWithdrawals,
    observed: plan.projectedWithdrawals,
    threshold: allowedWithdrawals,
    baseline: plan.listedBefore,
    message: `Publishing would withdraw ${plan.projectedWithdrawals} of ${plan.listedBefore} listed exhibitors.`,
  })

  const rejectShare = share(listing.recordsRejected, listing.recordsDiscovered)
  add({
    id: 'reject_rate',
    severity: 'block',
    passed: rejectShare <= T.rejectMaxShare,
    observed: pct(rejectShare),
    threshold: pct(T.rejectMaxShare),
    baseline: null,
    message: `${listing.recordsRejected} of ${listing.recordsDiscovered} listings could not be read as an exhibitor.`,
  })

  const nameless = listing.rejectedByReason.no_company_name ?? 0
  const namelessShare = share(nameless, listing.recordsDiscovered)
  add({
    id: 'empty_name_rate',
    severity: 'block',
    passed: nameless <= T.emptyNameFloor || namelessShare <= T.emptyNameMaxShare,
    observed: pct(namelessShare),
    threshold: pct(T.emptyNameMaxShare),
    baseline: null,
    message: `${nameless} listings had no company name.`,
  })

  const duplicateRate = share(listing.duplicateRecords + plan.duplicateCompanies, listing.recordsParsed)
  const spiked = baseline ? duplicateRate > Math.max(T.duplicateMaxShare, baseline.duplicateRate * T.duplicateSpikeFactor) : false
  add({
    id: 'duplicate_rate',
    // Against a baseline a spike blocks; without one a high rate is worth knowing and no more —
    // some fairs genuinely list one company under two names.
    severity: baseline ? 'block' : 'warn',
    passed: baseline ? !spiked : duplicateRate <= T.duplicateMaxShare,
    observed: pct(duplicateRate),
    threshold: pct(baseline ? Math.max(T.duplicateMaxShare, baseline.duplicateRate * T.duplicateSpikeFactor) : T.duplicateMaxShare),
    baseline: baseline ? pct(baseline.duplicateRate) : null,
    message: `${listing.duplicateRecords + plan.duplicateCompanies} listings repeated a record or a company already read.`,
  })

  let collapses = 0
  for (const [id, field] of [
    ['hall_coverage_collapse', 'hall'],
    ['stand_coverage_collapse', 'stand'],
    ['website_coverage_collapse', 'website'],
  ] as const) {
    if (!baseline) continue
    const before = baseline.coverage[field]
    const now = listing.coverage[field]
    const collapsed = before - now > T.coverageDropPoints
    if (collapsed) collapses++
    add({
      id,
      severity: 'block',
      passed: !collapsed,
      observed: pct(now),
      threshold: pct(Math.max(0, before - T.coverageDropPoints)),
      baseline: pct(before),
      message: `${field[0].toUpperCase()}${field.slice(1)} coverage fell from ${pct(before)}% to ${pct(now)}%.`,
    })
  }

  if (listing.detailAttempted > 0) {
    const failed = share(listing.detailFailed, listing.detailAttempted)
    add({
      id: 'detail_failure_rate',
      severity: 'block',
      passed: failed <= T.detailFailureMaxShare,
      observed: pct(failed),
      threshold: pct(T.detailFailureMaxShare),
      baseline: null,
      // Detail pages carry fields the directory does not; a read missing them would
      // overwrite a known stand with "not given".
      message: `${listing.detailFailed} of ${listing.detailAttempted} detail pages could not be read.`,
    })
  }

  if (baseline) {
    add({
      id: 'layout_change_suspected',
      severity: 'block',
      passed: collapses < T.layoutCollapseCount && !(collapses > 0 && rejectShare > T.rejectMaxShare),
      observed: collapses,
      threshold: T.layoutCollapseCount,
      baseline: null,
      message: 'Several fields disappeared at once; the source layout has probably changed.',
    })
  }

  // An override is an explicit, recorded decision to publish despite a named gate.
  const overridden = new Set(overrides)
  for (const gate of gates) {
    if (!gate.passed && overridden.has(gate.id)) gate.overridden = true
  }

  const blocking = gates.some((g) => !g.passed && g.severity === 'block' && !g.overridden)
  const warning = gates.some((g) => !g.passed && (g.severity === 'warn' || g.overridden))
  return { health: blocking ? 'unhealthy' : warning ? 'degraded' : 'healthy', gates }
}
