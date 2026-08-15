import { startOfDay } from '@/lib/followups'

/** "Today" / "Yesterday" / "2d ago" / "12 Nov" — as used on contact rows. */
export function relativeDay(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const days = Math.round(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000
  )

  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`

  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** "Fri, 30 May" — the reminder date format from the approved screens. */
export function dueDateLabel(value: string | null | undefined): string {
  if (!value) return 'No date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No date'
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/**
 * How a follow-up reads in the inbox.
 *
 * `primary` is what the eye lands on ("Today", "Overdue by 2 days"); `detail`
 * is the calendar date, kept secondary so the TODAY section doesn't repeat
 * itself.
 */
export function followUpLabel(
  value: string | null | undefined,
  now: Date = new Date()
): { primary: string; detail: string | null } {
  if (!value) return { primary: 'No date', detail: null }

  const due = new Date(value)
  if (Number.isNaN(due.getTime())) return { primary: 'No date', detail: null }

  const detail = due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const days = Math.round(
    (startOfDay(due).getTime() - startOfDay(now).getTime()) / 86_400_000
  )

  if (days === 0) return { primary: 'Today', detail }
  if (days === 1) return { primary: 'Tomorrow', detail }
  if (days === -1) return { primary: 'Overdue since yesterday', detail }
  if (days < -1) return { primary: `Overdue by ${Math.abs(days)} days`, detail }
  if (days <= 7) return { primary: `In ${days} days`, detail }

  return { primary: dueDateLabel(value), detail: null }
}

/** "10:30 AM" — activity timestamps. */
export function timeLabel(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
