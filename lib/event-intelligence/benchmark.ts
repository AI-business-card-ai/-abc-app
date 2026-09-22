import type { ParseResult } from '@/lib/event-intelligence/intent'
import type { MatchType } from '@/lib/event-intelligence/types'

/**
 * Mission Benchmark V1: is ABC recommending the right companies?
 *
 * Everything in this file is arithmetic over two lists — what ABC recommended,
 * and what the owner thought of it. No database, no clock, no model. The
 * measurement instrument is deliberately duller than the thing it measures.
 *
 * ## What a judgment is, and is not
 *
 * OWNER FEEDBACK is its own kind of claim, and it sits beside the three the
 * feature already keeps apart:
 *
 *   OWNER FACT      what the owner typed about their business.
 *   SOURCE FACT     what the listing says about the other company.
 *   ABC ANALYSIS    what ABC inferred by comparing them.
 *   OWNER FEEDBACK  what the owner thought of the result.
 *
 * Feedback changes none of the first three. Nothing here is read by
 * `scoring.ts` or by the Product Brain, and a judgment never edits a company, a
 * presence, a source record or a score. One click is an opinion about one
 * output, not training data, and this version does not learn from it. When
 * learning arrives it will be a deliberate, reviewable process with a version
 * of its own — not a side effect of a button.
 *
 * ## What it refuses to say
 *
 * TARGET ≠ ENCOUNTER holds here as everywhere: "great target" is a judgment
 * about a suggestion. It does not mean met, contacted, replied or won, and no
 * function in this file can produce a number that claims otherwise.
 *
 * The rates below are descriptive. `positiveRate` is the share of *reviewed*
 * recommendations the owner called great or relevant, over whatever sample they
 * happened to review — not an accuracy, not a precision, and not a measurement
 * of a population. Twelve reviews are twelve opinions.
 */

// ── The judgment ─────────────────────────────────────────────────

export type Judgment = 'great' | 'relevant' | 'not_relevant'

export const JUDGMENTS: Judgment[] = ['great', 'relevant', 'not_relevant']

export const JUDGMENT_LABEL: Record<Judgment, string> = {
  great: 'Great target',
  relevant: 'Relevant',
  not_relevant: 'Not relevant',
}

/**
 * Great and relevant both count as ABC having been useful; they are kept apart
 * so that "worth the walk" and "fair enough" are not averaged into one number
 * that means neither.
 */
export function isPositive(judgment: Judgment): boolean {
  return judgment === 'great' || judgment === 'relevant'
}

// ── Why not ──────────────────────────────────────────────────────

export type NotRelevantReason =
  | 'wrong_industry'
  | 'wrong_company_role'
  | 'we_do_not_sell_to_them'
  | 'wrong_market'
  | 'already_known'
  | 'not_enough_evidence'
  | 'other'

export const NOT_RELEVANT_REASONS: NotRelevantReason[] = [
  'wrong_industry',
  'wrong_company_role',
  'we_do_not_sell_to_them',
  'wrong_market',
  'already_known',
  'not_enough_evidence',
  'other',
]

export const NOT_RELEVANT_REASON_LABEL: Record<NotRelevantReason, string> = {
  wrong_industry: 'Wrong industry',
  wrong_company_role: 'Wrong kind of company',
  we_do_not_sell_to_them: 'We don’t sell to them',
  wrong_market: 'Wrong market',
  already_known: 'Already known to us',
  not_enough_evidence: 'Not enough to go on',
  other: 'Something else',
}

/**
 * Each reason points at a different repair, which is the only reason to ask.
 *
 * Wrong industry and wrong market are matching inputs. Wrong kind of company is
 * the direction — customer, supplier or partner — being read backwards. Already
 * known is not a mistake at all, and counting it as one would push ABC towards
 * suggesting strangers over the right companies.
 */
export const NOT_RELEVANT_REASON_HINT: Record<NotRelevantReason, string> = {
  wrong_industry: 'They work in a different field entirely.',
  wrong_company_role: 'Right field, wrong role — ABC read the direction wrong.',
  we_do_not_sell_to_them: 'A real company, not a buyer of what you sell.',
  wrong_market: 'Wrong region, segment or size.',
  already_known: 'A good company you already deal with.',
  not_enough_evidence: 'Their listing said too little to judge.',
  other: '',
}

// ── What ABC missed ──────────────────────────────────────────────

export type MissedReason =
  | 'strong_customer'
  | 'strong_supplier'
  | 'strong_partner'
  | 'strategic'
  | 'known_opportunity'
  | 'other'

export const MISSED_REASONS: MissedReason[] = [
  'strong_customer',
  'strong_supplier',
  'strong_partner',
  'strategic',
  'known_opportunity',
  'other',
]

export const MISSED_REASON_LABEL: Record<MissedReason, string> = {
  strong_customer: 'Strong customer',
  strong_supplier: 'Strong supplier',
  strong_partner: 'Strong partner',
  strategic: 'Strategically important',
  known_opportunity: 'An opportunity we already knew about',
  other: 'Something else',
}

// ── The stored rows ──────────────────────────────────────────────

export type MatchFeedback = {
  id: string
  userId: string
  matchId: string
  objectiveId: string
  eventId: string
  judgment: Judgment
  reason: NotRelevantReason | null
  note: string | null
  /**
   * What ABC had concluded when the owner judged it.
   *
   * Copied onto the row rather than read back through the match, because a
   * match is current: re-running matching rewrites its score and its engine
   * version in place. Without this the before/after comparison a tuning run is
   * supposed to produce would quietly compare a judgment to the tuning that
   * came after it.
   */
  matchType: MatchType
  matchScore: number
  engineVersion: string
  brainVersion: string | null
  createdAt: string
  updatedAt: string
}

export type MissedOpportunity = {
  id: string
  userId: string
  objectiveId: string
  eventId: string
  presenceId: string
  reason: MissedReason | null
  note: string | null
  createdAt: string
}

// ── What arrives from a screen ───────────────────────────────────

const MAX_NOTE = 500

export type FeedbackWrite = {
  matchId: string
  judgment: Judgment
  reason: NotRelevantReason | null
  note: string | null
}

export function parseFeedback(input: Record<string, unknown>): ParseResult<FeedbackWrite> {
  const matchId = typeof input.matchId === 'string' ? input.matchId.trim() : ''
  if (!matchId) return { ok: false, error: 'Which recommendation?' }

  const judgment = typeof input.judgment === 'string' ? input.judgment : ''
  if (!JUDGMENTS.includes(judgment as Judgment)) {
    return { ok: false, error: 'That is not one of the three answers.' }
  }

  /*
    A reason only ever explains a refusal. Attaching one to "great" would make a
    row the database refuses anyway, so it is turned down here with a sentence
    rather than a constraint violation — and dropping it silently would be
    worse, because the owner would believe it had been recorded.
  */
  const rawReason = typeof input.reason === 'string' && input.reason ? input.reason : null
  if (rawReason !== null && !NOT_RELEVANT_REASONS.includes(rawReason as NotRelevantReason)) {
    return { ok: false, error: 'That is not one of the reasons.' }
  }
  if (rawReason !== null && judgment !== 'not_relevant') {
    return { ok: false, error: 'A reason belongs with “Not relevant”.' }
  }

  const note = typeof input.note === 'string' ? input.note.trim() : ''
  if (note.length > MAX_NOTE) {
    return { ok: false, error: `That note is too long. Keep it under ${MAX_NOTE} characters.` }
  }

  return {
    ok: true,
    value: {
      matchId,
      judgment: judgment as Judgment,
      reason: rawReason as NotRelevantReason | null,
      note: note || null,
    },
  }
}

export type MissedWrite = {
  presenceId: string
  reason: MissedReason | null
  note: string | null
}

export function parseMissed(input: Record<string, unknown>): ParseResult<MissedWrite> {
  const presenceId = typeof input.presenceId === 'string' ? input.presenceId.trim() : ''
  if (!presenceId) return { ok: false, error: 'Which company?' }

  const rawReason = typeof input.reason === 'string' && input.reason ? input.reason : null
  if (rawReason !== null && !MISSED_REASONS.includes(rawReason as MissedReason)) {
    return { ok: false, error: 'That is not one of the reasons.' }
  }

  const note = typeof input.note === 'string' ? input.note.trim() : ''
  if (note.length > MAX_NOTE) {
    return { ok: false, error: `That note is too long. Keep it under ${MAX_NOTE} characters.` }
  }

  return { ok: true, value: { presenceId, reason: rawReason as MissedReason | null, note: note || null } }
}

// ── The report ───────────────────────────────────────────────────

/**
 * One recommendation, in the order ABC put it in.
 *
 * The caller supplies the ranking rather than this file computing one, because
 * the ranking being measured has to be the ranking the owner was shown —
 * score first, then id, the same order `loadMatches` returns and the list
 * renders. A benchmark that re-sorted would be grading a list nobody saw.
 */
export type RankedRecommendation = {
  matchId: string
  matchType: MatchType
  score: number
}

export type JudgmentCounts = {
  reviewed: number
  great: number
  relevant: number
  notRelevant: number
  positive: number
  /** positive ÷ reviewed, or null when nothing has been reviewed. Never assumed. */
  positiveRate: number | null
}

export type TopKBlock = JudgmentCounts & {
  k: number
  /**
   * How many recommendations the ranking actually has in this slice. Fewer than
   * `k` means the fair is smaller than the question, and the block says so
   * instead of padding the denominator.
   */
  ranked: number
  /** Whether there were `k` recommendations to look at at all. */
  complete: boolean
}

export type Benchmark = {
  recommendations: number
  overall: JudgmentCounts
  /** Reviewed ÷ recommended: how much of the list the numbers rest on. */
  coverage: number | null
  byType: Record<MatchType, JudgmentCounts>
  /** Why the owner turned recommendations down, commonest first. */
  reasons: { reason: NotRelevantReason; count: number }[]
  topReason: NotRelevantReason | null
  topK: TopKBlock[]
  missed: number
  missedReasons: { reason: MissedReason | null; count: number }[]
  /**
   * The engine versions the reviewed recommendations were produced by. More
   * than one means the sample spans a change to matching, and the numbers
   * should not be read as one measurement.
   */
  engineVersions: string[]
  mixedVersions: boolean
}

export const TOP_K = [5, 10, 25]

function emptyCounts(): JudgmentCounts {
  return { reviewed: 0, great: 0, relevant: 0, notRelevant: 0, positive: 0, positiveRate: null }
}

function tally(counts: JudgmentCounts, judgment: Judgment): void {
  counts.reviewed += 1
  if (judgment === 'great') counts.great += 1
  if (judgment === 'relevant') counts.relevant += 1
  if (judgment === 'not_relevant') counts.notRelevant += 1
  if (isPositive(judgment)) counts.positive += 1
}

/** Rounded to whole percent; kept as a number so a screen decides the wording. */
function rate(counts: JudgmentCounts): JudgmentCounts {
  counts.positiveRate = counts.reviewed > 0 ? Math.round((counts.positive / counts.reviewed) * 100) : null
  return counts
}

/**
 * The benchmark for one mission.
 *
 * The single rule that matters: **an unreviewed recommendation is not a
 * negative one.** It has not been judged, so it is absent from every numerator
 * and every denominator, and `coverage` is what says how much was looked at.
 * Counting silence as failure would make ABC look worse the more it suggested,
 * and would make the number improve by recommending less.
 */
export function buildBenchmark(
  ranked: RankedRecommendation[],
  feedback: MatchFeedback[],
  missed: MissedOpportunity[] = []
): Benchmark {
  const byMatch = new Map(feedback.map((entry) => [entry.matchId, entry]))

  const overall = emptyCounts()
  const byType: Record<MatchType, JudgmentCounts> = {
    customer: emptyCounts(),
    supplier: emptyCounts(),
    partner: emptyCounts(),
  }
  const reasonCounts = new Map<NotRelevantReason, number>()
  const versions = new Set<string>()

  for (const item of ranked) {
    const judged = byMatch.get(item.matchId)
    if (!judged) continue
    tally(overall, judged.judgment)
    tally(byType[item.matchType], judged.judgment)
    versions.add(judged.engineVersion)
    if (judged.reason) reasonCounts.set(judged.reason, (reasonCounts.get(judged.reason) ?? 0) + 1)
  }

  const topK = TOP_K.map((k) => {
    const slice = ranked.slice(0, k)
    const counts = emptyCounts()
    for (const item of slice) {
      const judged = byMatch.get(item.matchId)
      if (judged) tally(counts, judged.judgment)
    }
    return { k, ranked: slice.length, complete: ranked.length >= k, ...rate(counts) }
  })

  const reasons = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    // Commonest first; ties by the declared order, so the report never wobbles.
    .sort((a, b) => b.count - a.count || NOT_RELEVANT_REASONS.indexOf(a.reason) - NOT_RELEVANT_REASONS.indexOf(b.reason))

  const missedCounts = new Map<MissedReason | null, number>()
  for (const entry of missed) missedCounts.set(entry.reason, (missedCounts.get(entry.reason) ?? 0) + 1)

  return {
    recommendations: ranked.length,
    overall: rate(overall),
    coverage: ranked.length > 0 ? Math.round((overall.reviewed / ranked.length) * 100) : null,
    byType: {
      customer: rate(byType.customer),
      supplier: rate(byType.supplier),
      partner: rate(byType.partner),
    },
    reasons,
    topReason: reasons[0]?.reason ?? null,
    topK,
    missed: missed.length,
    missedReasons: [...missedCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    engineVersions: [...versions].sort(),
    mixedVersions: versions.size > 1,
  }
}

/**
 * The next recommendation to look at: the highest-ranked one not yet judged.
 *
 * Review runs down ABC's own ranking rather than around it, because the
 * question the benchmark exists to answer is about the top of the list. A
 * reviewer who wandered would produce a number about a sample nobody chose.
 */
export function nextUnreviewed<T extends { matchId: string }>(
  ranked: T[],
  feedback: Pick<MatchFeedback, 'matchId'>[]
): T | null {
  const judged = new Set(feedback.map((entry) => entry.matchId))
  return ranked.find((item) => !judged.has(item.matchId)) ?? null
}

/** How the summary reads in one line, without overclaiming. */
export function benchmarkHeadline(benchmark: Benchmark): string {
  const { reviewed, positive } = benchmark.overall
  if (reviewed === 0) return 'Nothing reviewed yet.'
  return `${positive} of ${reviewed} reviewed ${reviewed === 1 ? 'suggestion was' : 'suggestions were'} useful.`
}

/**
 * The brain version inside a stamped engine version, when one contributed.
 *
 * `matchInputsVersion` writes `deterministic-v1+brain-v1` when confirmed brain
 * facts widened the owner's profile, and plain `deterministic-v1` when they did
 * not. Splitting it out on the feedback row means a later comparison can ask
 * "did the brain help?" without parsing strings at report time.
 */
export function brainVersionOf(engineVersion: string): string | null {
  const [, brain] = engineVersion.split('+')
  return brain ? brain : null
}
