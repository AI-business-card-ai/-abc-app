import Link from 'next/link'
import { IconCalendarEvent, IconChevronDown, IconChevronRight, IconPlus } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import { EmptyState, SectionLabel } from '@/components/ui/abc/Bits'
import { eventDateLabel, eventPhase, type PlannedEventRow } from '@/lib/events/planned'
import type { EventSummary } from '@/lib/events/workspace'

/**
 * The events this owner is planning, and has planned.
 *
 * What is happening or next comes first, because this is where preparation
 * happens. Every event here came from the owner's own "Plan an event": a scan
 * never adds one.
 *
 * Place names written on meetings are kept below, labelled as what they are.
 * Those notes are real history and stay reachable, but they are not events, and
 * nothing is created from them.
 *
 * No interactivity, so no client bundle: it is a server component that renders
 * links.
 */

function metRange(summary: EventSummary): string | null {
  const format = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const last = summary.lastMetAt ? format(summary.lastMetAt) : null
  const first = summary.firstMetAt ? format(summary.firstMetAt) : null
  if (!last && !first) return null
  if (!first || first === last) return last
  return `${first} – ${last}`
}

function PlannedRow({ event }: { event: PlannedEventRow }) {
  const details = [eventDateLabel(event), event.location].filter(Boolean).join(' · ')
  return (
    <li>
      <Link
        href={`/events/planned/${event.id}`}
        className="abc-surface abc-lift flex items-center gap-3 p-4 hover:border-abc-border-strong abc-focus-ring sm:p-5"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold text-abc-text">{event.name}</span>
          <span className="mt-0.5 block truncate text-[12.5px] text-abc-muted">{details || 'No date yet'}</span>
          {event.meetings > 0 ? (
            <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-abc-secondary">
              <span>
                {event.people} {event.people === 1 ? 'person' : 'people'}
              </span>
              <span>
                {event.meetings} {event.meetings === 1 ? 'meeting' : 'meetings'}
              </span>
            </span>
          ) : null}
        </span>
        <IconChevronRight size={18} stroke={1.8} aria-hidden="true" className="shrink-0 text-abc-muted" />
      </Link>
    </li>
  )
}

export default function EventsListView({
  available,
  planned,
  notes,
}: {
  /** False until the planned events migration has been applied. */
  available: boolean
  planned: PlannedEventRow[]
  /** Place names written on meetings. Not events. */
  notes: EventSummary[]
}) {
  const ahead = planned.filter((event) => eventPhase(event) !== 'past')
  const past = planned.filter((event) => eventPhase(event) === 'past')

  return (
    <div className="mx-auto w-full max-w-[900px] abc-page-top px-4 pb-10 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {/* The family this page belongs to — the sidebar item that opens it carries the same name. */}
          <SectionLabel>Event &amp; Expo Intelligence</SectionLabel>
          <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-tight text-abc-text lg:text-[36px]">
            Events
          </h1>
          <p className="mt-1.5 text-[14px] text-abc-secondary lg:text-[16px]">
            Plan the events you are going to, and arrive prepared.
          </p>
        </div>
        {available ? (
          <Button href="/events/new" className="w-full sm:w-auto">
            <IconPlus size={17} stroke={2} />
            Plan an event
          </Button>
        ) : null}
      </header>

      {!available ? (
        <div className="abc-surface mt-6">
          <EmptyState
            icon={IconCalendarEvent}
            title="Event planning is not available yet."
            description="Your contacts and meetings are not affected."
          />
        </div>
      ) : ahead.length === 0 && past.length === 0 ? (
        <div className="abc-surface mt-6">
          <EmptyState
            icon={IconCalendarEvent}
            title="No planned events yet."
            description="Plan your next fair: when and where it is, what you want from it, and who to see. Scanning a card never creates an event."
            action={<Button href="/events/new">Plan an event</Button>}
          />
        </div>
      ) : (
        <>
          {ahead.length > 0 ? (
            <section className="mt-6" aria-label="Upcoming events">
              <SectionLabel>Upcoming</SectionLabel>
              <ul className="mt-2 flex flex-col gap-3">
                {ahead.map((event) => (
                  <PlannedRow key={event.id} event={event} />
                ))}
              </ul>
            </section>
          ) : null}

          {past.length > 0 ? (
            <section className="mt-6" aria-label="Past events">
              <SectionLabel>Past</SectionLabel>
              <ul className="mt-2 flex flex-col gap-3">
                {past.map((event) => (
                  <PlannedRow key={event.id} event={event} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      {notes.length > 0 ? (
        <details className="group mt-8">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 rounded-inner text-[13px] font-medium text-abc-secondary hover:text-abc-text abc-focus-ring [&::-webkit-details-marker]:hidden">
            From your meeting notes · {notes.length}
            <IconChevronDown size={15} stroke={2} aria-hidden="true" className="transition-transform group-open:rotate-180" />
          </summary>
          <p className="mb-3 mt-1 text-[12.5px] leading-[1.55] text-abc-muted">
            Places you wrote on your meetings. These are notes, not planned events, and ABC has not created anything from them.
          </p>
          <ul className="flex flex-col gap-3">
            {notes.map((event) => (
              <li key={event.key}>
                <Link
                  href={`/events/${event.key}`}
                  className="abc-surface abc-lift flex items-center gap-3 p-4 hover:border-abc-border-strong abc-focus-ring sm:p-5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-abc-text">{event.name}</span>

                    {metRange(event) ? (
                      <span className="mt-0.5 block truncate text-[12.5px] text-abc-muted">Met {metRange(event)}</span>
                    ) : null}

                    <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                      <span className="text-abc-secondary">
                        {event.people} {event.people === 1 ? 'person' : 'people'}
                      </span>
                      <span className="text-abc-secondary">
                        {event.encounters} {event.encounters === 1 ? 'meeting' : 'meetings'}
                      </span>
                      {event.followUpsDue > 0 ? (
                        <span style={{ color: 'var(--abc-overdue)' }}>{event.followUpsDue} to follow up</span>
                      ) : null}
                      {event.crmSynced > 0 ? <span className="text-abc-muted">{event.crmSynced} in CRM</span> : null}
                    </span>
                  </span>

                  <IconChevronRight size={18} stroke={1.8} aria-hidden="true" className="shrink-0 text-abc-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}
