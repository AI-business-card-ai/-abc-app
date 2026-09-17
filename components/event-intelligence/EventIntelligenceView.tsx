import Link from 'next/link'
import { IconArrowLeft, IconMapPin, IconTargetArrow } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import { EmptyState, SectionLabel } from '@/components/ui/abc/Bits'
import type {
  IntelCompany,
  IntelEvent,
  IntelPresence,
  MeetingTarget,
  StoredMatch,
} from '@/lib/event-intelligence/types'

/**
 * One fair's Event Intelligence.
 *
 * The screen has an order of business, and it is the order of the product: say
 * what you are looking for, then look at what ABC found. Until the first is
 * answered the second is not shown as an empty table with filters over it —
 * there is nothing to filter, and a table of nothing is a worse answer than a
 * sentence explaining what is missing.
 */

export type EventIntelligenceViewProps = {
  event: IntelEvent
  exhibitorCount: number
  hasProfile: boolean
  hasObjective: boolean
  matches: StoredMatch[]
  targets: MeetingTarget[]
  presences: IntelPresence[]
  companies: IntelCompany[]
}

export function eventDates(event: IntelEvent): string | null {
  const format = (value: string | null) => {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  }
  const from = format(event.startsOn)
  const to = format(event.endsOn)
  if (!from && !to) return null
  if (!to || from === to) return from
  return `${from} – ${to}`
}

export default function EventIntelligenceView({
  event,
  exhibitorCount,
  hasProfile,
  hasObjective,
  matches,
}: EventIntelligenceViewProps) {
  const dates = eventDates(event)
  const place = [event.venue, event.city, event.country].filter(Boolean).join(', ')

  return (
    <div className="mx-auto w-full max-w-[900px] abc-page-top px-4 pb-16 sm:px-6 lg:px-8">
      <Link
        href="/events/intelligence"
        className="inline-flex items-center gap-1.5 text-[13px] text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
      >
        <IconArrowLeft size={16} stroke={1.8} aria-hidden="true" />
        Event Intelligence
      </Link>

      <header className="mt-4">
        <SectionLabel>Before the fair</SectionLabel>
        <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight text-abc-text lg:text-[34px]">
          {event.name}
        </h1>

        {dates || place ? (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-abc-secondary">
            {dates ? <span>{dates}</span> : null}
            {dates && place ? <span aria-hidden="true">·</span> : null}
            {place ? (
              <span className="inline-flex items-center gap-1">
                <IconMapPin size={14} stroke={1.7} aria-hidden="true" />
                {place}
              </span>
            ) : null}
          </p>
        ) : null}

        <p className="mt-1 text-[12.5px] text-abc-muted">
          {exhibitorCount} {exhibitorCount === 1 ? 'exhibitor' : 'exhibitors'} in ABC&rsquo;s listing
          {event.organizer ? ` · ${event.organizer}` : ''}
        </p>
      </header>

      {!hasProfile || !hasObjective ? (
        <div className="abc-surface mt-6">
          <EmptyState
            icon={IconTargetArrow}
            title={hasProfile ? 'Tell ABC what you want from this fair.' : 'Tell ABC what your company does.'}
            description={
              hasProfile
                ? 'Your company profile is saved. One more step and ABC can rank this exhibitor list against it.'
                : 'Four questions — what you do, what you sell, what you need, and who you want to meet.'
            }
            action={<Button href={`/events/intelligence/${event.eventKey}/setup`}>Set this up</Button>}
          />
        </div>
      ) : matches.length === 0 ? (
        <div className="abc-surface mt-6">
          <EmptyState
            icon={IconTargetArrow}
            title="Nothing has been matched yet."
            description="ABC has your profile and your goals for this fair, but has not compared them against the exhibitor list."
            action={
              <Button href={`/events/intelligence/${event.eventKey}/setup`} variant="surface">
                Review what you told ABC
              </Button>
            }
          />
        </div>
      ) : null}

      <p className="mt-8 text-[12px] leading-[1.6] text-abc-muted">
        Exhibitor details come from the event listing ABC imported. Where a hall or stand is missing,
        the listing did not give one.
      </p>
    </div>
  )
}
