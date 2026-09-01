/**
 * Reading a contact's history without scrolling past it.
 *
 * `crm_activities` is an append-only record and should stay that way: every
 * push, every save, every generated message is a row, and some of them matter
 * for audit long after they stop being interesting to look at. The problem was
 * never the rows, it was the page — a contact who had been saved to a phone a
 * dozen times opened onto a dozen identical lines, and the meeting notes, the
 * follow-up and the CRM actions were somewhere below all of it.
 *
 * So this condenses for the eye only. It groups *consecutive* identical entries
 * into one line carrying a count, keeps every original row reachable through
 * `sources`, and never reorders, merges across a gap, drops, or edits anything.
 * Give it the rows back and you can still reconstruct the list it was given.
 */

export type ActivityRow = {
  id: string
  activity_type: string
  activity_detail: string | null
  created_at: string
}

export type ActivityGroup = {
  /** The first row of the run, whose id keys the rendered line. */
  id: string
  activity_type: string
  activity_detail: string | null
  /** The most recent timestamp in the run — what a reader wants to see. */
  created_at: string
  /** How many stored rows this line stands for. 1 means it stands for itself. */
  count: number
  /** Every row folded into this line, newest first, in their original order. */
  sources: ActivityRow[]
}

/**
 * How many lines the contact page shows before asking.
 *
 * Three is enough to answer "what happened with this person recently" and
 * short enough that the sections below it stay on the screen.
 */
export const DEFAULT_ACTIVITY_PREVIEW = 3

/**
 * Fold runs of the same event into single lines.
 *
 * Consecutive only, and deliberately so. Collapsing every matching row wherever
 * it appeared would claim a sequence that did not happen — three saves today
 * and one last month is not "saved 4 times" in any useful sense, and the order
 * of what happened between them is the thing a history is for.
 */
export function condenseActivity(items: readonly ActivityRow[]): ActivityGroup[] {
  const groups: ActivityGroup[] = []

  for (const item of items) {
    const last = groups[groups.length - 1]
    const sameEvent =
      last && last.activity_type === item.activity_type && last.activity_detail === item.activity_detail

    if (sameEvent) {
      last.count += 1
      last.sources.push(item)
      continue
    }

    groups.push({
      id: item.id,
      activity_type: item.activity_type,
      activity_detail: item.activity_detail,
      created_at: item.created_at,
      count: 1,
      sources: [item],
    })
  }

  return groups
}

/** "Saved to phone" once, "Saved to phone · 3 times" when it is a run. */
export function repeatLabel(count: number): string | null {
  return count > 1 ? `${count} times` : null
}

/**
 * How many stored rows sit behind a preview, so the button can say so.
 * Counts rows rather than lines: the honest number is the one the full view
 * will show.
 */
export function hiddenActivityCount(
  groups: readonly ActivityGroup[],
  shown: number = DEFAULT_ACTIVITY_PREVIEW
): number {
  return groups.slice(shown).reduce((total, group) => total + group.count, 0)
}
