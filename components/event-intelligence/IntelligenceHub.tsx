import Link from 'next/link'
import { IconBuildingStore, IconChevronRight, IconSparkles } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import { EmptyState, SectionLabel } from '@/components/ui/abc/Bits'
import ImportDemoData from '@/components/event-intelligence/ImportDemoData'
import type { IntelEventSummary } from '@/lib/event-intelligence/data'

/**
 * Which fairs ABC holds exhibitor data for, and how far this owner has got.
 *
 * Server-rendered, so the list itself ships no JavaScript; the one interactive
 * thing on the page is the import control, which is its own client island.
 */

function dateRange(event: IntelEventSummary['event']): string | null {
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

function place(event: IntelEventSummary['event']): string | null {
  return [event.venue, event.city].filter(Boolean).join(', ') || null
}

export default function IntelligenceHub({
  events,
  hasProfile,
}: {
  events: IntelEventSummary[]
  hasProfile: boolean
}) {
  return (
    <div className="mx-auto w-full max-w-[900px] abc-page-top px-4 pb-10 sm:px-6 lg:px-8">
      <header>
        <SectionLabel>Events</SectionLabel>
        <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-tight text-abc-text lg:text-[36px]">
          Event Intelligence
        </h1>
        <p className="mt-1.5 max-w-[56ch] text-[14px] text-abc-secondary lg:text-[16px]">
          Tell ABC what your company does and what you want from a fair, and it will say which
          exhibitors are worth your time — and where to find them.
        </p>
      </header>

      {events.length === 0 ? (
        <div className="abc-surface mt-6">
          <EmptyState
            icon={IconBuildingStore}
            title="No event data loaded yet."
            description="Event Intelligence needs an exhibitor list to reason about. Import a CSV or JSON list from an organiser, or load the synthetic demo fair to try it end to end."
            action={
              <div className="flex flex-col items-center gap-3">
                <Button href="/events/intelligence/import">Import an exhibitor list</Button>
                <ImportDemoData subtle />
              </div>
            }
          />
        </div>
      ) : (
        <>
          <ul className="mt-6 flex flex-col gap-3">
            {events.map(({ event, exhibitors, hasObjective, matches, targets }) => (
              <li key={event.id}>
                <Link
                  href={`/events/intelligence/${event.eventKey}/mission`}
                  className="abc-surface flex items-center gap-3 p-4 transition-colors duration-200 ease-abc hover:border-abc-border-strong abc-focus-ring sm:p-5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold text-abc-text">
                      {event.name}
                    </span>

                    {dateRange(event) || place(event) ? (
                      <span className="mt-0.5 block truncate text-[12.5px] text-abc-muted">
                        {[dateRange(event), place(event)].filter(Boolean).join(' · ')}
                      </span>
                    ) : null}

                    <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                      <span className="text-abc-secondary">
                        {exhibitors} {exhibitors === 1 ? 'exhibitor' : 'exhibitors'}
                      </span>
                      {matches > 0 ? (
                        <span className="text-abc-secondary">
                          {matches} {matches === 1 ? 'match' : 'matches'}
                        </span>
                      ) : null}
                      {targets > 0 ? (
                        <span className="text-abc-secondary">{targets} saved</span>
                      ) : null}
                      {!hasObjective ? (
                        <span className="inline-flex items-center gap-1 text-abc-muted">
                          <IconSparkles size={13} stroke={1.8} aria-hidden="true" />
                          Not set up yet
                        </span>
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

          {!hasProfile ? (
            <p className="mt-4 text-[12.5px] leading-[1.6] text-abc-muted">
              You have not told ABC what your company does yet. Open an event above to set that up —
              it takes four questions.
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button href="/events/intelligence/import" variant="surface">
              Import an exhibitor list
            </Button>
            <ImportDemoData subtle />
          </div>
        </>
      )}

      <p className="mt-8 text-[12px] leading-[1.6] text-abc-muted">
        The demo fair and every company in it are invented, for testing this feature. Nothing here
        describes a real business.
      </p>
    </div>
  )
}
