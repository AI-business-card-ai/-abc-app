/**
 * The vocabulary of Event & Expo Intelligence.
 *
 * Three groups, kept apart here exactly as they are kept apart in the database,
 * because the separation is the design and a shared type would quietly undo it:
 *
 *   1. Public event / business graph — what a listing says. Facts.
 *   2. Private intent — what the owner says about their own company.
 *   3. Intelligence — what ABC concludes from (1) and (2). Inference.
 *
 * Nothing in group 3 is ever rendered as though it belonged to group 1.
 */

// ── 1. Public event / business graph ─────────────────────────────

export type IntelEvent = {
  id: string
  /**
   * The same slug `eventKeyFromName` derives for the existing Event Workspace,
   * so a fair has one address whether ABC knows it from meetings or a listing.
   */
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

export type IntelCompany = {
  id: string
  displayName: string
  nameNormalized: string
  websiteDomain: string | null
  country: string | null
  descriptionPublic: string | null
  categories: string[]
  /** Set when a name-only lookalike was found. Never acted on automatically. */
  mergeCandidateOf: string | null
}

export type PresenceStatus = 'listed' | 'withdrawn'

/** One company, at one event. Hall and stand live here and nowhere else. */
export type IntelPresence = {
  id: string
  eventId: string
  companyId: string
  exhibitorDisplayName: string | null
  /** `null` means the source did not say. It is never guessed or filled in. */
  hall: string | null
  stand: string | null
  eventCategories: string[]
  eventDescription: string | null
  productsServices: string[]
  listingUrl: string | null
  status: PresenceStatus
  firstSeenAt: string
  lastSeenAt: string
}

/** Where a fact came from. Every public row above is traceable to one of these. */
export type IntelSourceRecord = {
  id: string
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

// ── 2. Private intent ────────────────────────────────────────────

export type CompanyIntentProfile = {
  id: string
  userId: string
  companyName: string | null
  whatWeDo: string | null
  whatWeSell: string[]
  whatWeBuy: string[]
  whoWeWantToMeet: string | null
  targetIndustries: string[]
  targetCompanyTypes: string[]
  capabilities: string[]
  technologies: string[]
  materials: string[]
  certifications: string[]
  geographies: string[]
}

export type EventObjective = {
  id: string
  userId: string
  eventId: string
  profileId: string
  goals: string | null
  sellFocus: string[]
  buyFocus: string[]
  partnerFocus: string[]
  priorityIndustries: string[]
  priorityGeographies: string[]
  notes: string | null
}

// ── 3. Intelligence ──────────────────────────────────────────────

/**
 * The commercial direction of a suggestion, which is the whole point of it.
 *
 * A company you could sell to and a company that could supply you are not the
 * same opportunity and do not lead to the same conversation, so they are never
 * flattened into a single "match".
 */
export type MatchType = 'customer' | 'supplier' | 'partner'

/**
 * A fact from the listing, with the field it came from.
 *
 * Evidence is quoted, not paraphrased: `value` is what the source says. This is
 * what the UI shows under "From the listing".
 */
export type MatchEvidence = {
  /** Which part of the listing: 'categories', 'products', 'description', … */
  field: string
  /** The exact source value. */
  value: string
  /** The owner's term that it lined up with, when the signal was an overlap. */
  matchedTerm?: string
}

/**
 * A step of ABC's reasoning, and the evidence indices it rests on.
 *
 * `evidenceIndex` points into the match's `evidence` array. A reason that cites
 * nothing is dropped by the engine rather than shown — an assertion with no
 * source behind it is exactly the thing this feature must not produce.
 */
export type MatchReason = {
  /** The scoring signal this came from. */
  signal: MatchSignal
  /** Plain-language statement of what lines up. ABC's words, not the source's. */
  statement: string
  /** Points into `MatchResult.evidence`. Never empty. */
  evidenceIndex: number[]
  /** Contribution to the score, before normalisation. */
  weight: number
}

export type MatchSignal =
  | 'industry_overlap'
  | 'product_relevance'
  | 'capability_need'
  | 'company_type'
  | 'technology_overlap'
  | 'material_overlap'
  | 'geography'
  | 'event_category'

/** Something the reader should know about the data, not about the company. */
export type MatchWarning =
  | 'no_hall'
  | 'no_stand'
  | 'sparse_listing'
  | 'withdrawn'
  | 'weak_signal'

export type MatchResult = {
  presenceId: string
  matchType: MatchType
  /** 0–100 relevance to the stated objective. See `scoring.ts` for semantics. */
  score: number
  reasons: MatchReason[]
  evidence: MatchEvidence[]
  warnings: MatchWarning[]
}

export type StoredMatch = MatchResult & {
  id: string
  userId: string
  objectiveId: string
  engineVersion: string
  matchedAt: string
}

// ── Meeting targets ──────────────────────────────────────────────

/**
 * What the owner has decided about a match.
 *
 * `met` is absent on purpose. It is not a value anything can write: a target is
 * met when, and only when, it points at an encounter the owner actually
 * recorded — see `TargetStatus` below and the migration's notes on
 * TARGET != ENCOUNTER.
 */
export type StoredTargetStatus = 'saved' | 'planned' | 'skipped'

/** What the product shows, which adds the one state the database derives. */
export type TargetStatus = StoredTargetStatus | 'met'

export type MeetingTarget = {
  id: string
  userId: string
  matchId: string
  eventId: string
  presenceId: string
  /** As stored. Never 'met'. */
  status: StoredTargetStatus
  /** 1 = must meet, 2 = worth meeting, 3 = if there is time. */
  priority: 1 | 2 | 3
  privateNote: string | null
  scheduledFor: string | null
  /** An encounter this owner recorded, or null. The only source of 'met'. */
  metEncounterId: string | null
}

/**
 * The status to show: met when an encounter is linked, otherwise what is stored.
 *
 * One function, used everywhere, so "met" cannot come to mean two things in two
 * screens — and so the rule that only a real meeting produces it stays visible
 * in the code rather than living in a comment.
 */
export function displayTargetStatus(
  target: Pick<MeetingTarget, 'status' | 'metEncounterId'>
): TargetStatus {
  return target.metEncounterId ? 'met' : target.status
}

// ── The seams ────────────────────────────────────────────────────

/**
 * Everything the engine is allowed to see about one candidate.
 *
 * Note what is missing: no owner id, no contacts, no notes, no encounters. The
 * engine compares a stated intent against a public listing and nothing else.
 */
export type MatchCandidate = {
  presence: IntelPresence
  company: IntelCompany
}

export type MatchInput = {
  profile: CompanyIntentProfile
  objective: EventObjective
  candidate: MatchCandidate
}

export interface EventMatchEngine {
  readonly version: string
  /**
   * Every direction this candidate plausibly fits, strongest first, and an
   * empty array when none do. A non-match produces no row at all rather than a
   * zero-scored one: a list padded with companies ABC has nothing to say about
   * is the exhibitor directory this feature exists to replace.
   */
  score(input: MatchInput): MatchResult[]
}

/**
 * The later, optional AI layer. Declared, deliberately unimplemented.
 *
 * V1 ships without it and must keep working without it. When an adapter does
 * arrive it takes facts and intent that have *already* been normalised, and it
 * may only phrase things — it never decides whether something is a match, and
 * it never invents a fact, because it is handed the evidence rather than the
 * listing.
 */
export interface MatchInsightGenerator {
  readonly id: string
  generate(input: {
    profile: CompanyIntentProfile
    candidate: MatchCandidate
    match: MatchResult
  }): Promise<{
    conversationOpener: string | null
    discoveryQuestions: string[]
    nextStep: string | null
  }>
}
