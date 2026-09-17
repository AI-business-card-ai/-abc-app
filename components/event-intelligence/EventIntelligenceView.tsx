import Link from 'next/link'
import { IconArrowLeft, IconMapPin, IconTargetArrow } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import { EmptyState, SectionLabel } from '@/components/ui/abc/Bits'
import MatchList from '@/components/event-intelligence/MatchList'
import RunMatching from '@/components/event-intelligence/RunMatching'
import { buildMatchRows } from '@/lib/event-intelligence/view'
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
 * what you are looking for, let ABC compare it against the listing, then decide
 * who is worth walking to. Until the first is answered the rest is not shown as
 * an empty table with filters over it — there is nothing to filter, and a table
 * of nothing is a worse answer than a sentence saying what is missing.
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
  targets,
  presences,
  companies,
}: EventIntelligenceViewProps) {
  const dates = eventDates(event)
  const place = [event.venue, event.city, event.country].filter(Boolean).join(', ')

  const rows = buildMatchRows(
    matches,
    new Map(presences.map((presence) => [presence.id, presence])),
    new Map(companies.map((company) => [company.id, company])),
    targets
  )
  const savedCount = rows.filter((row) => row.saved).length

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
      ) : rows.length === 0 ? (
        <div className="abc-surface mt-6">
          <EmptyState
            icon={IconTargetArrow}
            title="Ready to compare."
            description={`ABC has your goals and ${exhibitorCount} exhibitors. Nothing has been matched against them yet.`}
            action={<RunMatching eventKey={event.eventKey} />}
          />
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-abc-secondary">
              {rows.length} of {exhibitorCount} exhibitors are worth a look
              {savedCount > 0 ? ` · ${savedCount} saved` : ''}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {savedCount > 0 ? (
                <Button href={`/events/intelligence/${event.eventKey}/plan`} variant="surface">
                  Your plan
                </Button>
              ) : null}
              <Button href={`/events/intelligence/${event.eventKey}/setup`} variant="ghost">
                Edit what you told ABC
              </Button>
            </div>
          </div>

          <MatchList rows={rows} eventKey={event.eventKey} />

          <div className="mt-6">
            <RunMatching eventKey={event.eventKey} again />
          </div>
        </>
      )}

      <p className="mt-8 text-[12px] leading-[1.6] text-abc-muted">
        Exhibitor details come from the event listing ABC imported. Where a hall or stand is missing,
        the listing did not give one. ABC Match is how well a company fits what you said you want —
        not a prediction that they will buy.
      </p>
    </div>
  )
}
