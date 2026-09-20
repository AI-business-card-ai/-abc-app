import { MATCH_TYPE_LABEL, locationLabel, hasLocation } from '@/lib/event-intelligence/view'
import { hallOrder } from '@/lib/event-intelligence/match-query'
import { displayTargetStatus } from '@/lib/event-intelligence/types'
import type {
  IntelCompany,
  IntelPresence,
  MatchType,
  MeetingTarget,
  StoredMatch,
  TargetStatus,
} from '@/lib/event-intelligence/types'

/**
 * The plan, derived rather than stored.
 *
 * There is no `event_plans` table and that is deliberate. A stored ordering
 * would be a second source of truth to keep in step with every save, removal
 * and source refresh, and V1 has no route optimisation for it to hold: the plan
 * is simply the targets this owner saved, arranged so they can be read standing
 * up. Deriving it means it cannot disagree with the targets it describes.
 *
 * What it answers, and nothing more:
 *
 *   Who have I chosen to meet? Where are they? How important are they? What
 *   kind of opportunity is it? Have I met them yet?
 *
 * What it deliberately does not do: optimise a walking route, schedule
 * anything, or promise a time. Grouping by priority and then ordering by hall
 * is convenience, not a route — it puts the stands in one hall next to each
 * other on the page, which is a sorting decision anybody can check, rather than
 * a plan of the day that would be wrong the moment a meeting ran long.
 */

export type PlanEntry = {
  targetId: string
  matchId: string
  companyName: string
  matchType: MatchType | null
  matchTypeLabel: string | null
  score: number | null
  hall: string | null
  location: string
  hasLocation: boolean
  withdrawn: boolean
  status: TargetStatus
  priority: 1 | 2 | 3
  privateNote: string | null
  scheduledFor: string | null
  /** Company name and the owner's own note, folded once, for search. */
  searchText: string
}

export type PlanGroup = {
  priority: 1 | 2 | 3
  label: string
  entries: PlanEntry[]
}

export const PRIORITY_HEADING: Record<1 | 2 | 3, string> = {
  1: 'Must meet',
  2: 'Worth meeting',
  3: 'If there is time',
}

export function buildPlan(
  targets: MeetingTarget[],
  presences: Map<string, IntelPresence>,
  companies: Map<string, IntelCompany>,
  matches: Map<string, StoredMatch>
): PlanGroup[] {
  const entries: PlanEntry[] = []

  for (const target of targets) {
    const presence = presences.get(target.presenceId)
    const company = presence ? companies.get(presence.companyId) : undefined
    const match = matches.get(target.matchId)

    entries.push({
      targetId: target.id,
      matchId: target.matchId,
      companyName:
        presence?.exhibitorDisplayName ?? company?.displayName ?? 'Unnamed exhibitor',
      matchType: match?.matchType ?? null,
      matchTypeLabel: match ? MATCH_TYPE_LABEL[match.matchType] : null,
      score: match?.score ?? null,
      hall: presence?.hall ?? null,
      location: presence ? locationLabel(presence) : 'Location not listed',
      hasLocation: presence ? hasLocation(presence) : false,
      withdrawn: presence?.status === 'withdrawn',
      status: displayTargetStatus(target),
      priority: target.priority,
      privateNote: target.privateNote,
      scheduledFor: target.scheduledFor,
      searchText: [
        presence?.exhibitorDisplayName ?? company?.displayName ?? '',
        target.privateNote ?? '',
        ...(presence?.eventCategories ?? []),
      ]
        .join(' ')
        .toLowerCase(),
    })
  }

  const groups: PlanGroup[] = ([1, 2, 3] as const).map((priority) => ({
    priority,
    label: PRIORITY_HEADING[priority],
    entries: entries
      .filter((entry) => entry.priority === priority)
      .sort((a, b) => {
        // Skipped and met sink below what is still to do.
        const rank = (entry: PlanEntry) =>
          entry.status === 'skipped' ? 2 : entry.status === 'met' ? 1 : 0
        if (rank(a) !== rank(b)) return rank(a) - rank(b)

        const [aNum, aText] = hallOrder(a.hall)
        const [bNum, bText] = hallOrder(b.hall)
        if (aNum !== bNum) return aNum - bNum
        if (aText !== bText) return aText.localeCompare(bText)
        return a.companyName.localeCompare(b.companyName)
      }),
  }))

  return groups.filter((group) => group.entries.length > 0)
}

export type PlanSummary = {
  total: number
  met: number
  remaining: number
  withoutLocation: number
}

export function planSummary(groups: PlanGroup[]): PlanSummary {
  const all = groups.flatMap((group) => group.entries)
  return {
    total: all.length,
    met: all.filter((entry) => entry.status === 'met').length,
    remaining: all.filter((entry) => entry.status !== 'met' && entry.status !== 'skipped').length,
    withoutLocation: all.filter((entry) => !entry.hasLocation).length,
  }
}

// ── Finding one target in a plan of two hundred ──────────────────

export type PlanSort = 'priority' | 'hall' | 'name' | 'relevance'

export const PLAN_SORT_LABEL: Record<PlanSort, string> = {
  priority: 'Priority',
  hall: 'Hall and stand',
  name: 'Company name',
  relevance: 'Most relevant',
}

export type PlanQuery = {
  search: string
  type: 'all' | MatchType
  hall: string | null
  sort: PlanSort
}

export const EMPTY_PLAN_QUERY: PlanQuery = { search: '', type: 'all', hall: null, sort: 'priority' }

export function isDefaultPlanQuery(query: PlanQuery): boolean {
  return query.search.trim() === '' && query.type === 'all' && query.hall === null
}

export function planEntries(groups: PlanGroup[]): PlanEntry[] {
  return groups.flatMap((group) => group.entries)
}

export function planHalls(groups: PlanGroup[]): string[] {
  const halls = [...new Set(planEntries(groups).map((e) => e.hall).filter((h): h is string => Boolean(h)))]
  return halls.sort((a, b) => {
    const [aNum, aText] = hallOrder(a)
    const [bNum, bText] = hallOrder(b)
    return aNum - bNum || aText.localeCompare(bText)
  })
}

export function matchesPlanQuery(entry: PlanEntry, query: PlanQuery): boolean {
  if (query.type !== 'all' && entry.matchType !== query.type) return false
  if (query.hall !== null && entry.hall !== query.hall) return false
  const terms = query.search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return terms.every((term) => entry.searchText.includes(term))
}

/**
 * The plan, filtered and re-sorted, still grouped by priority.
 *
 * Priority stays the grouping whatever the sort, because it is the owner's own
 * judgement about who matters and the screen should not hide it. The sort
 * decides the order *within* each group — down one hall, or by name when
 * somebody is looking for a company rather than walking.
 */
export function applyPlanQuery(groups: PlanGroup[], query: PlanQuery): PlanGroup[] {
  const order = (a: PlanEntry, b: PlanEntry): number => {
    // Met and skipped sink below what is still to do, in every sort.
    const rank = (entry: PlanEntry) => (entry.status === 'skipped' ? 2 : entry.status === 'met' ? 1 : 0)
    if (rank(a) !== rank(b)) return rank(a) - rank(b)

    if (query.sort === 'name') return a.companyName.localeCompare(b.companyName)
    if (query.sort === 'relevance') {
      return (b.score ?? -1) - (a.score ?? -1) || a.companyName.localeCompare(b.companyName)
    }

    const [aNum, aText] = hallOrder(a.hall)
    const [bNum, bText] = hallOrder(b.hall)
    if (aNum !== bNum) return aNum - bNum
    if (aText !== bText) return aText.localeCompare(bText)
    return a.companyName.localeCompare(b.companyName)
  }

  return groups
    .map((group) => ({
      ...group,
      entries: group.entries.filter((entry) => matchesPlanQuery(entry, query)).sort(order),
    }))
    .filter((group) => group.entries.length > 0)
}

export function planTypeCounts(groups: PlanGroup[], query: PlanQuery): Record<'all' | MatchType, number> {
  const scoped = planEntries(groups).filter((entry) => matchesPlanQuery(entry, { ...query, type: 'all' }))
  return {
    all: scoped.length,
    customer: scoped.filter((e) => e.matchType === 'customer').length,
    supplier: scoped.filter((e) => e.matchType === 'supplier').length,
    partner: scoped.filter((e) => e.matchType === 'partner').length,
  }
}
