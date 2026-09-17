import { terms, termsOfAll } from '@/lib/event-intelligence/normalize'
import type {
  CompanyIntentProfile,
  EventMatchEngine,
  EventObjective,
  IntelCompany,
  IntelPresence,
  MatchEvidence,
  MatchInput,
  MatchReason,
  MatchResult,
  MatchSignal,
  MatchType,
  MatchWarning,
} from '@/lib/event-intelligence/types'

/**
 * ABC Match — the deterministic engine.
 *
 * Same inputs, same output, every time: no clock, no randomness, no network and
 * no model. That is not a placeholder for something cleverer later. It is what
 * makes a score worth showing at all — a number nobody can reproduce is a
 * number nobody can argue with, and a suggestion nobody can argue with is a
 * suggestion nobody should act on.
 *
 * ## What the number means
 *
 * **ABC Match is relevance to what the owner said they want, on a 0–100 scale.**
 * It is not a probability of anything. It does not predict a deal, a reply or a
 * meeting. A 92 means several of the things this owner asked for line up with
 * several of the things this listing states; it means nothing whatsoever about
 * whether the company will buy.
 *
 * The UI says "ABC Match" and never "win probability" for exactly this reason.
 *
 * ## How it is computed
 *
 * Each direction has its own signals and weights, summed to at most 100:
 *
 * | Signal | Customer | Supplier | Partner | Compares |
 * | --- | --- | --- | --- | --- |
 * | `industry_overlap`   | 30 | — | 20 | owner's target industries vs the listing's categories |
 * | `product_relevance`  | 25 | — | — | who the owner wants to meet vs what the listing describes |
 * | `company_type`       | 20 | — | — | owner's target company types vs the listing |
 * | `capability_need`    | 15 | 55 | 40 | customer: what the owner makes vs what the listing describes · supplier: what the owner buys vs what the listing sells · partner: what the owner wants to explore vs the whole listing |
 * | `material_overlap`   | — | 15 | — | owner's materials vs the listing's products |
 * | `technology_overlap` | — | 10 | 20 | owner's technologies vs the listing |
 * | `event_category`     | — | 10 | 10 | the organiser's own filing of this exhibitor |
 * | `geography`          | 10 | 10 | 10 | the company's country vs the owner's stated countries |
 *
 * `capability_need` carries a different comparison in each direction, which is
 * why one signal name appears in all three columns. Splitting it into three
 * names would read better in this table and worse everywhere else: the reason
 * shown to the owner is the same shape — "their listing names X, which lines up
 * with what you said" — whichever side of the trade it came from.
 *
 * A signal's contribution is `weight × strength`. Strength is how many distinct
 * owner terms the listing matched, over how many the owner offered, capped at
 * three. The cap is deliberate: one shared word out of twenty is a coincidence,
 * three is a pattern, and beyond that more overlap of one kind should not
 * out-rank a different kind of evidence entirely. Dividing by what the owner
 * offered rather than by a flat three is what lets a specific, short answer
 * score as well as a long one.
 *
 * Supplier is dominated by one signal on purpose. "They sell the thing I said I
 * need" is a far stronger statement than any number of category coincidences,
 * and spreading that across five weights would let a company that sells nothing
 * the owner buys reach the same score by being vaguely adjacent five times.
 *
 * ## What it will not do
 *
 * A reason that cites no evidence is dropped before scoring rather than shown,
 * so the screen cannot carry a claim with nothing behind it. If every reason
 * for a direction is dropped, there is no match in that direction — and a
 * candidate with no direction produces no row at all, because a list padded
 * with companies ABC has nothing to say about is the exhibitor directory this
 * feature exists to replace.
 */

export const ENGINE_VERSION = 'deterministic-v1'

/** Below this, ABC has not found enough to justify sending somebody across a hall. */
export const MIN_SCORE = 25

/** At or below this, the match is shown but flagged as thin. */
export const WEAK_SCORE = 45

/** One shared word is a coincidence; three is a pattern. */
const STRENGTH_CAP = 3

type Weights = Partial<Record<MatchSignal, number>>

const WEIGHTS: Record<MatchType, Weights> = {
  customer: {
    industry_overlap: 30,
    product_relevance: 25,
    company_type: 20,
    capability_need: 15,
    geography: 10,
  },
  supplier: {
    capability_need: 55,
    material_overlap: 15,
    technology_overlap: 10,
    event_category: 10,
    geography: 10,
  },
  partner: {
    industry_overlap: 20,
    technology_overlap: 20,
    event_category: 10,
    geography: 10,
    // What the owner said they want to explore, against the whole listing.
    capability_need: 40,
  },
}

/** A named group of source strings, so evidence can say where a fact came from. */
type SourceField = { field: string; values: string[] }

type Hit = { field: string; value: string; matchedTerms: string[] }

/**
 * Which of the owner's terms this listing actually states, and where.
 *
 * One hit per source *value*, carrying every owner term that value matched.
 * Both halves of that matter. Grouping by value is what stops a long
 * description counting as five separate pieces of evidence — it is one
 * sentence, and it is quoted once. Keeping every matched term is what stops a
 * sentence that names three of the owner's needs being scored as though it
 * named one: strength is the breadth of the overlap, and a description reading
 * "special bearings for machine tools" answers two of "special" and "bearings",
 * not the alphabetically first.
 */
function findHits(ownerTerms: string[], fields: SourceField[]): Hit[] {
  if (ownerTerms.length === 0) return []
  const wanted = new Set(ownerTerms)
  const hits: Hit[] = []

  for (const { field, values } of fields) {
    for (const value of values) {
      // Sorted, so the same run produces the same order every time.
      const matchedTerms = terms(value)
        .filter((term) => wanted.has(term))
        .sort()
      if (matchedTerms.length === 0) continue
      hits.push({ field, value, matchedTerms })
    }
  }

  return hits
}

const distinctTerms = (hits: Hit[]): number =>
  new Set(hits.flatMap((hit) => hit.matchedTerms)).size

/**
 * How much of what the owner asked for this listing actually states.
 *
 * The denominator is how many terms the owner offered, capped at three — not a
 * flat three. That distinction decides whether the engine is usable: an owner
 * who says they need one specific thing, and finds a company that sells exactly
 * that thing, has a complete match, and dividing their single hit by three
 * would score their best supplier at 18 out of 100 and hide it. Someone who
 * lists twenty capabilities needs more than one coincidence to clear the same
 * bar, and the cap is what makes that true.
 */
function strength(hits: Hit[], ownerTermCount: number): number {
  const denominator = Math.max(1, Math.min(STRENGTH_CAP, ownerTermCount))
  return Math.min(distinctTerms(hits), denominator) / denominator
}

/** Plain-language statements. ABC's words about the overlap, never the source's. */
const STATEMENTS: Record<MatchSignal, (subject: string) => string> = {
  industry_overlap: (s) => `Their listed categories include ${s}, which is on your target list.`,
  product_relevance: (s) => `What they describe exhibiting mentions ${s}, which matches the kind of company you said you want to meet.`,
  company_type: (s) => `Their listing reads as ${s}, a type of company you named.`,
  capability_need: (s) => `Their listing names ${s}, which lines up with what you said.`,
  material_overlap: (s) => `They list ${s}, a material you work with.`,
  technology_overlap: (s) => `They list ${s}, a technology you named.`,
  event_category: (s) => `The organiser filed them under ${s}.`,
  geography: (s) => `They are listed in ${s}, a country you prioritised.`,
}

type Signal = {
  signal: MatchSignal
  ownerTerms: string[]
  fields: SourceField[]
  /** Overrides the default statement subject when the signal is about a place. */
  subject?: string
}

function scoreDirection(
  matchType: MatchType,
  signals: Signal[],
  evidencePool: MatchEvidence[]
): { score: number; reasons: MatchReason[] } {
  const weights = WEIGHTS[matchType]
  const reasons: MatchReason[] = []
  let total = 0

  for (const { signal, ownerTerms, fields, subject } of signals) {
    const weight = weights[signal]
    if (!weight) continue

    const hits = findHits(ownerTerms, fields)
    if (hits.length === 0) continue

    const contribution = weight * strength(hits, ownerTerms.length)
    if (contribution <= 0) continue

    const evidenceIndex: number[] = []
    for (const hit of hits) {
      const existing = evidencePool.findIndex((e) => e.field === hit.field && e.value === hit.value)
      if (existing >= 0) {
        if (!evidenceIndex.includes(existing)) evidenceIndex.push(existing)
        continue
      }
      evidencePool.push({ field: hit.field, value: hit.value, matchedTerm: hit.matchedTerms[0] })
      evidenceIndex.push(evidencePool.length - 1)
    }

    /*
      The guarantee, enforced rather than promised: a reason with no evidence
      behind it never reaches the screen. If this list is empty the signal is
      dropped, score and all.
    */
    if (evidenceIndex.length === 0) continue

    const named = [...new Set(hits.flatMap((hit) => hit.matchedTerms))].sort().slice(0, 3).join(', ')
    reasons.push({
      signal,
      statement: STATEMENTS[signal](subject ?? named),
      evidenceIndex,
      weight: Math.round(contribution),
    })
    total += contribution
  }

  /*
    Geography is a qualifier, never a headline. It carries real weight — an
    owner who named a country meant it — but where a company is registered is a
    coincidence of address, and letting it sort first made the boldest line on
    the card the least interesting thing about the company. It goes last
    whatever it scored; everything else sorts by contribution.
  */
  const rank = (reason: MatchReason) => (reason.signal === 'geography' ? 1 : 0)
  reasons.sort((a, b) => rank(a) - rank(b) || b.weight - a.weight || a.signal.localeCompare(b.signal))

  return { score: Math.max(0, Math.min(100, Math.round(total))), reasons }
}

function warningsFor(input: MatchInput, score: number): MatchWarning[] {
  const { presence, company } = input.candidate
  const warnings: MatchWarning[] = []

  if (presence.status === 'withdrawn') warnings.push('withdrawn')
  if (!presence.hall) warnings.push('no_hall')
  if (!presence.stand) warnings.push('no_stand')

  // How much the listing actually says. Four or fewer facts is a stub, and the
  // reader should know the reasoning had little to work from.
  const facts =
    company.categories.length +
    presence.eventCategories.length +
    presence.productsServices.length +
    (company.descriptionPublic ? 1 : 0) +
    (presence.eventDescription ? 1 : 0)
  if (facts <= 1) warnings.push('sparse_listing')

  if (score <= WEAK_SCORE) warnings.push('weak_signal')
  return warnings
}

/**
 * The owner's side of the comparison, assembled once per candidate.
 *
 * The event objective does not replace the company profile; it adds to it. An
 * owner who filled in a focus for this fair gets it weighed alongside what they
 * said in general, and an owner who skipped that screen is not penalised for it.
 */
function ownerTerms(input: MatchInput) {
  const { profile, objective } = input
  return {
    sells: termsOfAll([...profile.whatWeSell, ...objective.sellFocus, profile.whatWeDo]),
    buys: termsOfAll([...profile.whatWeBuy, ...objective.buyFocus]),
    /*
      Partnership is the one direction the owner has to ask for by name.

      It was tempting to fold in `targetCompanyTypes` here, and that was wrong:
      "machine builders" is who this owner wants to *sell* to, and treating it
      as partnership interest turned every prospective customer into a partner
      as well, which is two cards for one company saying two different things
      about it. A partner is somebody the owner said they wanted to explore
      something with, and nothing else infers it.
    */
    partners: termsOfAll(objective.partnerFocus),
    industries: termsOfAll([...profile.targetIndustries, ...objective.priorityIndustries]),
    companyTypes: termsOfAll(profile.targetCompanyTypes),
    wantsToMeet: termsOfAll([profile.whoWeWantToMeet, objective.goals]),
    capabilities: termsOfAll([...profile.capabilities, ...profile.whatWeSell]),
    materials: termsOfAll(profile.materials),
    technologies: termsOfAll(profile.technologies),
    geographies: [...profile.geographies, ...objective.priorityGeographies],
  }
}

/** The listing's side, grouped so evidence can name the field it came from. */
function candidateFields(input: MatchInput) {
  const { company, presence } = input.candidate
  return {
    categories: [
      { field: 'categories', values: company.categories },
      { field: 'event categories', values: presence.eventCategories },
    ] as SourceField[],
    eventCategories: [{ field: 'event categories', values: presence.eventCategories }] as SourceField[],
    described: [
      { field: 'description', values: [company.descriptionPublic, presence.eventDescription].filter((v): v is string => Boolean(v)) },
      { field: 'products', values: presence.productsServices },
    ] as SourceField[],
    products: [{ field: 'products', values: presence.productsServices }] as SourceField[],
    everything: [
      { field: 'categories', values: company.categories },
      { field: 'event categories', values: presence.eventCategories },
      { field: 'description', values: [company.descriptionPublic, presence.eventDescription].filter((v): v is string => Boolean(v)) },
      { field: 'products', values: presence.productsServices },
    ] as SourceField[],
  }
}

export const deterministicMatchEngine: EventMatchEngine = {
  version: ENGINE_VERSION,

  score(input: MatchInput): MatchResult[] {
    const owner = ownerTerms(input)
    const source = candidateFields(input)
    const { company, presence } = input.candidate

    const country = company.country
    const geographyField: SourceField[] = country ? [{ field: 'country', values: [country] }] : []
    const geographyTerms = owner.geographies.length > 0 ? termsOfAll(owner.geographies) : []

    const directions: { matchType: MatchType; signals: Signal[] }[] = [
      {
        matchType: 'customer',
        signals: [
          { signal: 'industry_overlap', ownerTerms: owner.industries, fields: source.categories },
          { signal: 'product_relevance', ownerTerms: owner.wantsToMeet, fields: source.described },
          { signal: 'company_type', ownerTerms: owner.companyTypes, fields: source.everything },
          { signal: 'capability_need', ownerTerms: owner.capabilities, fields: source.described },
          { signal: 'geography', ownerTerms: geographyTerms, fields: geographyField, subject: country ?? '' },
        ],
      },
      {
        matchType: 'supplier',
        signals: [
          { signal: 'capability_need', ownerTerms: owner.buys, fields: source.described },
          { signal: 'material_overlap', ownerTerms: owner.materials, fields: source.products },
          { signal: 'technology_overlap', ownerTerms: owner.technologies, fields: source.everything },
          { signal: 'event_category', ownerTerms: owner.buys, fields: source.eventCategories },
          { signal: 'geography', ownerTerms: geographyTerms, fields: geographyField, subject: country ?? '' },
        ],
      },
      {
        matchType: 'partner',
        signals: [
          { signal: 'capability_need', ownerTerms: owner.partners, fields: source.everything },
          { signal: 'technology_overlap', ownerTerms: owner.technologies, fields: source.everything },
          { signal: 'industry_overlap', ownerTerms: owner.industries, fields: source.categories },
          { signal: 'event_category', ownerTerms: owner.partners, fields: source.eventCategories },
          { signal: 'geography', ownerTerms: geographyTerms, fields: geographyField, subject: country ?? '' },
        ],
      },
    ]

    const results: MatchResult[] = []

    for (const { matchType, signals } of directions) {
      const evidence: MatchEvidence[] = []
      const { score, reasons } = scoreDirection(matchType, signals, evidence)

      // Geography alone is not a reason to meet somebody. A direction carried
      // entirely by "they are in Germany" is a coincidence of address.
      const substantive = reasons.some((reason) => reason.signal !== 'geography')
      if (!substantive || reasons.length === 0 || score < MIN_SCORE) continue

      results.push({
        presenceId: presence.id,
        matchType,
        score,
        reasons,
        evidence,
        warnings: warningsFor(input, score),
      })
    }

    // Strongest first, and ties broken by name so two runs agree on the order.
    results.sort((a, b) => b.score - a.score || a.matchType.localeCompare(b.matchType))
    return results
  },
}

/**
 * Score a whole fair.
 *
 * Withdrawn presences are skipped: an exhibitor who has pulled out is not worth
 * walking to, and suggesting them would be ABC asserting something the source
 * has already retracted. A presence whose company row is missing is skipped
 * too, rather than scored against a half-known company.
 *
 * The order is fully determined — score, then match type, then presence id — so
 * two runs over the same data produce the same list in the same sequence, which
 * is what makes "reproducible" a testable claim rather than an aspiration.
 */
export function matchEvent(
  profile: CompanyIntentProfile,
  objective: EventObjective,
  presences: IntelPresence[],
  companies: Map<string, IntelCompany>,
  engine: EventMatchEngine = deterministicMatchEngine
): MatchResult[] {
  const results: MatchResult[] = []

  for (const presence of presences) {
    if (presence.status !== 'listed') continue
    const company = companies.get(presence.companyId)
    if (!company) continue
    results.push(...engine.score({ profile, objective, candidate: { presence, company } }))
  }

  results.sort(
    (a, b) =>
      b.score - a.score ||
      a.matchType.localeCompare(b.matchType) ||
      a.presenceId.localeCompare(b.presenceId)
  )
  return results
}
