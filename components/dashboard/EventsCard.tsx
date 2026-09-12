'use client'

import Link from 'next/link'
import { IconCalendarEvent, IconChevronRight } from '@tabler/icons-react'
import type { EventSummary } from '@/lib/events/workspace'

/**
 * The way into the event workspaces from the phone.
 *
 * The bottom navigation is full at four items, and a fifth would push the
 * primary actions together for something used after a fair rather than during
 * one — so the dashboard carries it, where the rest of the after-the-event work
 * already lives.
 *
 * People and follow-ups only. The dashboard reads encounters in one query and
 * no CRM mappings, so a CRM figure here would be a guess; the workspace itself
 * shows that, where it is counted from the mappings.
 */
export default function EventsCard({ events }: { events: EventSummary[] }) {
  return (
    <section className="abc-surface abc-surface-interactive flex h-full flex-col p-5">
      <header className="flex items-start justify-between">
        <IconCalendarEvent size={30} stroke={1.5} style={{ color: 'var(--abc-gold-accent)' }} />
        <Link
          href="/events"
          aria-label="Open events"
          className="flex h-8 w-8 items-center justify-center rounded-full text-abc-muted transition-colors hover:text-abc-text abc-focus-ring"
        >
          <IconChevronRight size={20} stroke={1.75} />
        </Link>
      </header>

      <h2 className="mt-3 text-[15px] font-semibold text-abc-text">Events</h2>

      {events.length === 0 ? (
        <p className="mt-1.5 text-[13px] leading-[1.55] text-abc-secondary">
          No event meetings yet. Add the event when you scan a card and everyone you met there
          collects here.
        </p>
      ) : (
        <ul className="mt-2.5 flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.key}>
              <Link
                href={`/events/${event.key}`}
                className="flex min-h-[44px] items-center gap-3 rounded-inner px-1 transition-colors duration-200 ease-abc hover:bg-abc-raised abc-focus-ring"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-abc-text">
                    {event.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-abc-muted">
                    {event.people} {event.people === 1 ? 'person' : 'people'}
                    {event.followUpsDue > 0 ? ` · ${event.followUpsDue} to follow up` : ''}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto pt-3">
        <Link
          href="/events"
          className="text-[13px] font-semibold text-abc-gold-accent transition-colors hover:text-abc-text abc-focus-ring rounded"
        >
          {events.length === 0 ? 'About events' : 'All events'}
        </Link>
      </div>
    </section>
  )
}
