import { MATCH_TYPE_LABEL, locationLabel, hasLocation } from '@/lib/event-intelligence/view'
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

/**
 * Halls sort naturally: 2 before 10, and a named hall after a numbered one.
 *
 * A plain string sort put Hall 10 before Hall 2, which reads as a mistake to
 * anybody holding the phone in front of Hall 2.
 */
function hallOrder(hall: string | null): [number, string] {
  if (!hall) return [Number.MAX_SAFE_INTEGER, '']
  const numeric = /^\d+$/.test(hall.trim()) ? Number(hall.trim()) : null
  return numeric === null ? [Number.MAX_SAFE_INTEGER - 1, hall.toLowerCase()] : [numeric, '']
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
