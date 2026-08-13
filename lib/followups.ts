/**
 * Follow-up bucketing. Shared by the dashboard (server) and the mobile
 * header badge (client) so both count the same thing.
 *
 * Source of truth is `scanned_contacts.next_action_date`, which the existing
 * CRM engine and reminder sidebar already write.
 */

export type FollowUpBuckets = {
  overdue: number
  today: number
  upcoming: number
}

export type FollowUpBucket = keyof FollowUpBuckets

export function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function bucketFor(
  nextActionDate: string | null | undefined,
  now: Date = new Date()
): FollowUpBucket | null {
  if (!nextActionDate) return null

  const due = new Date(nextActionDate)
  if (Number.isNaN(due.getTime())) return null

  const todayStart = startOfDay(now)
  const tomorrowStart = new Date(todayStart)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)

  const horizon = new Date(todayStart)
  horizon.setDate(horizon.getDate() + 8) // today + next 7 days

  if (due < todayStart) return 'overdue'
  if (due < tomorrowStart) return 'today'
  if (due < horizon) return 'upcoming'
  return null
}

export function bucketFollowUps(
  rows: { next_action_date?: string | null }[],
  now: Date = new Date()
): FollowUpBuckets {
  const counts: FollowUpBuckets = { overdue: 0, today: 0, upcoming: 0 }
  for (const row of rows) {
    const bucket = bucketFor(row.next_action_date, now)
    if (bucket) counts[bucket] += 1
  }
  return counts
}

/** Badge count for the mobile header: what actually needs attention now. */
export function attentionCount(counts: FollowUpBuckets): number {
  return counts.overdue + counts.today
}
