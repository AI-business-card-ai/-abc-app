import type {
  IntelCompany,
  IntelPresence,
  MatchEvidence,
  MatchType,
  MatchWarning,
  MeetingTarget,
  StoredMatch,
  TargetStatus,
} from '@/lib/event-intelligence/types'
import { displayTargetStatus } from '@/lib/event-intelligence/types'

/**
 * Turning stored matches into what a screen shows.
 *
 * Pure, so the rules that matter most here can be tested without a browser: a
 * hall the source never gave is never printed as though it had been, and ABC's
 * reasoning is never merged into the list of facts.
 */

export const MATCH_TYPE_LABEL: Record<MatchType, string> = {
  customer: 'Potential customer',
  supplier: 'Potential supplier',
  partner: 'Potential partner',
}

export const PRIORITY_LABEL: Record<1 | 2 | 3, string> = {
  1: 'Must meet',
  2: 'Worth meeting',
  3: 'If there is time',
}

export const STATUS_LABEL: Record<TargetStatus, string> = {
  saved: 'Saved',
  planned: 'Planned',
  met: 'Met',
  skipped: 'Skipped',
}

/**
 * Where to find them, said honestly.
 *
 * A directory that gave a hall and no stand has told us half of an address, and
 * the half it withheld is said out loud rather than left as a blank somebody
 * might read as "no stand needed". Nothing here is ever inferred from the other
 * field: halls do not imply stands.
 */
export function locationLabel(presence: Pick<IntelPresence, 'hall' | 'stand'>): string {
  if (presence.hall && presence.stand) return `Hall ${presence.hall} · Stand ${presence.stand}`
  if (presence.hall) return `Hall ${presence.hall} · Stand not listed`
  if (presence.stand) return `Stand ${presence.stand} · Hall not listed`
  return 'Location not listed'
}

export function hasLocation(presence: Pick<IntelPresence, 'hall' | 'stand'>): boolean {
  return Boolean(presence.hall || presence.stand)
}

export type MatchRow = {
  matchId: string
  presenceId: string
  companyName: string
  matchType: MatchType
  score: number
  /** ABC's strongest reason, one line. The full reasoning lives in the detail. */
  headline: string | null
  location: string
  hasLocation: boolean
  hall: string | null
  stand: string | null
  /** What the listing filed them under, for filtering and search. */
  categories: string[]
  /**
   * Name, categories and products, folded once.
   *
   * Precomputed because search runs on every keystroke over every row: doing
   * the lowercasing per keystroke turns a 500-row list into 500 string
   * allocations per character typed.
   */
  searchText: string
  withdrawn: boolean
  weak: boolean
  warnings: MatchWarning[]
  saved: boolean
  targetId: string | null
  priority: 1 | 2 | 3 | null
  status: TargetStatus | null
}

export function buildMatchRows(
  matches: StoredMatch[],
  presences: Map<string, IntelPresence>,
  companies: Map<string, IntelCompany>,
  targets: MeetingTarget[]
): MatchRow[] {
  const targetByMatch = new Map(targets.map((target) => [target.matchId, target]))

  const rows: MatchRow[] = []
  for (const match of matches) {
    const presence = presences.get(match.presenceId)
    if (!presence) continue
    const company = companies.get(presence.companyId)
    const target = targetByMatch.get(match.id) ?? null

    const companyName = presence.exhibitorDisplayName ?? company?.displayName ?? 'Unnamed exhibitor'
    const categories = [...new Set([...(company?.categories ?? []), ...presence.eventCategories])]

    rows.push({
      matchId: match.id,
      presenceId: match.presenceId,
      companyName,
      matchType: match.matchType,
      score: match.score,
      headline: match.reasons[0]?.statement ?? null,
      location: locationLabel(presence),
      hasLocation: hasLocation(presence),
      hall: presence.hall,
      stand: presence.stand,
      categories,
      searchText: [companyName, ...categories, ...presence.productsServices].join(' ').toLowerCase(),
      withdrawn: presence.status === 'withdrawn',
      weak: match.warnings.includes('weak_signal'),
      warnings: match.warnings,
      saved: Boolean(target),
      targetId: target?.id ?? null,
      priority: target?.priority ?? null,
      status: target ? displayTargetStatus(target) : null,
    })
  }

  // Strongest first; ties broken by name so the order never wobbles.
  rows.sort((a, b) => b.score - a.score || a.companyName.localeCompare(b.companyName))
  return rows
}

export type MatchFilter = 'all' | 'customer' | 'supplier' | 'partner' | 'saved'

export const FILTER_LABEL: Record<MatchFilter, string> = {
  all: 'All',
  customer: 'Customers',
  supplier: 'Suppliers',
  partner: 'Partners',
  saved: 'Saved',
}

export function matchesFilter(row: MatchRow, filter: MatchFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'saved':
      return row.saved
    default:
      return row.matchType === filter
  }
}

export function filterCounts(rows: MatchRow[]): Record<MatchFilter, number> {
  return {
    all: rows.length,
    customer: rows.filter((row) => row.matchType === 'customer').length,
    supplier: rows.filter((row) => row.matchType === 'supplier').length,
    partner: rows.filter((row) => row.matchType === 'partner').length,
    saved: rows.filter((row) => row.saved).length,
  }
}

/**
 * One fact from the listing, ready to print under "From the listing".
 *
 * Built only from stored source values. Nothing ABC concluded appears in this
 * list, and nothing in this list is rephrased — the whole purpose of the
 * section is that a reader can tell what the organiser said from what ABC
 * thinks about it.
 */
export type SourceFact = { label: string; values: string[] }

export function sourceFacts(presence: IntelPresence, company: IntelCompany | undefined): SourceFact[] {
  const facts: SourceFact[] = []

  const describe = [company?.descriptionPublic, presence.eventDescription].filter(
    (value, index, all): value is string => Boolean(value) && all.indexOf(value) === index
  )
  if (describe.length > 0) facts.push({ label: 'How they describe themselves', values: describe })

  const categories = [...new Set([...(company?.categories ?? []), ...presence.eventCategories])]
  if (categories.length > 0) facts.push({ label: 'Listed under', values: categories })

  if (presence.productsServices.length > 0) {
    facts.push({ label: 'Products and services', values: presence.productsServices })
  }

  if (company?.country) facts.push({ label: 'Country', values: [company.country] })
  if (company?.websiteDomain) facts.push({ label: 'Website', values: [company.websiteDomain] })

  return facts
}

/**
 * How a source is named to the person reading the screen.
 *
 * The stored provider id is ABC's bookkeeping — `fixture:…` today, and one day
 * perhaps `apify:<actor>` or `csv`. It is never printed. Which infrastructure
 * fetched a listing is not a product fact, and naming a scraping vendor on a
 * customer's screen would describe ABC as something it has chosen not to be.
 * The reader is told what kind of source it was, which is the thing they need
 * to judge it: an event's own directory, or ABC's invented demo data.
 */
export function sourceDisplayName(providerId: string): string {
  if (providerId.startsWith('fixture:')) return 'Synthetic demo data'
  return 'Event directory'
}

/** What the warnings mean, in words a reader can act on. */
export const WARNING_LABEL: Record<MatchWarning, string> = {
  no_hall: 'The listing does not give a hall.',
  no_stand: 'The listing does not give a stand number.',
  sparse_listing: 'This listing says very little, so there was not much to reason from.',
  withdrawn: 'This exhibitor is no longer in the current listing.',
  weak_signal: 'Only a little of what you asked for lines up with this listing.',
}

/**
 * Evidence grouped by the field it came from, for the source panel of a reason.
 *
 * Order is preserved rather than sorted, because it is the order the engine
 * recorded and two readers comparing screens should see the same thing.
 */
export function evidenceByField(evidence: MatchEvidence[], indices: number[]): SourceFact[] {
  const byField = new Map<string, string[]>()
  for (const index of indices) {
    const item = evidence[index]
    if (!item) continue
    const values = byField.get(item.field) ?? []
    if (!values.includes(item.value)) values.push(item.value)
    byField.set(item.field, values)
  }
  return [...byField.entries()].map(([label, values]) => ({ label, values }))
}
