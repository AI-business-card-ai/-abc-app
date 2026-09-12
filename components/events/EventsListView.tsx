import Link from 'next/link'
import { IconCalendarEvent, IconChevronRight } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import { EmptyState, SectionLabel } from '@/components/ui/abc/Bits'
import type { EventSummary } from '@/lib/events/workspace'

/**
 * The events this owner has met people at.
 *
 * A list of places rather than of people: the question it answers is "which
 * fair", and the numbers on each row are the ones somebody asks on the train
 * home — how many did I meet, how many still need something from me, how many
 * are already in the CRM. Every one is counted from real encounters; there is
 * nothing here that an empty account would show a plausible figure for.
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

export default function EventsListView({ events }: { events: EventSummary[] }) {
  return (
    <div className="mx-auto w-full max-w-[900px] abc-page-top px-4 pb-10 sm:px-6 lg:px-8">
      <header>
        <SectionLabel>Events</SectionLabel>
        <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-tight text-abc-text lg:text-[36px]">
          Events
        </h1>
        <p className="mt-1.5 text-[14px] text-abc-secondary lg:text-[16px]">
          Every fair you have met somebody at, and what is still open.
        </p>
      </header>

      {events.length === 0 ? (
        <div className="abc-surface mt-6">
          <EmptyState
            icon={IconCalendarEvent}
            title="No event meetings yet."
            description="Add the event when you scan a card and it will appear here, with everyone you met."
            action={<Button href="/scan">Scan a card</Button>}
          />
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {events.map((event) => (
            <li key={event.key}>
              <Link
                href={`/events/${event.key}`}
                className="abc-surface flex items-center gap-3 p-4 transition-colors duration-200 ease-abc hover:border-abc-border-strong abc-focus-ring sm:p-5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold text-abc-text">
                    {event.name}
                  </span>

                  {metRange(event) ? (
                    <span className="mt-0.5 block truncate text-[12.5px] text-abc-muted">
                      {metRange(event)}
                    </span>
                  ) : null}

                  <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                    <span className="text-abc-secondary">
                      {event.people} {event.people === 1 ? 'person' : 'people'}
                    </span>
                    <span className="text-abc-secondary">
                      {event.encounters} {event.encounters === 1 ? 'meeting' : 'meetings'}
                    </span>
                    {event.followUpsDue > 0 ? (
                      <span style={{ color: 'var(--abc-overdue)' }}>
                        {event.followUpsDue} to follow up
                      </span>
                    ) : null}
                    {event.crmSynced > 0 ? (
                      <span className="text-abc-muted">{event.crmSynced} in CRM</span>
                    ) : null}
                  </span>
                </span>

                <IconChevronRight
                  size={18}
                  stroke={1.8}
                  aria-hidden="true"
                  className="shrink-0 text-abc-muted"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
