'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  IconCalendarCheck,
  IconChartBar,
  IconChevronRight,
  IconTrendingUp,
  IconUsersGroup,
} from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'
import GoldTrace from '@/components/dashboard/GoldTrace'
import { eventDateLabel, eventPhase, type PlannedEvent } from '@/lib/events/planned'

type Metric = { icon: TablerIcon; label: string; value: number; href: string }

/**
 * EVENT & EXPO INTELLIGENCE — the wide panel under the working cards.
 *
 * One area for everything that happens around an event. What it does today is
 * planning: the events you chose to prepare for. What it is being built to do —
 * Expo Mission, before you arrive — sits inside it as `children`, labelled coming
 * soon by that component and not by this one.
 *
 * Every figure here is counted, never estimated:
 *   Planned events        events you planned; a scan never adds one
 *   Open opportunities    deals you opened in ABC CRM, not won or lost
 *   Total connections     your contacts
 * When the opportunity count cannot be read the tile is left out rather than
 * shown as zero. Nothing here forecasts, scores or predicts — that would be
 * the intelligence that is not built yet.
 */
export default function EventsCard({
  events,
  eventsTotal,
  opportunities,
  contactsTotal,
  children,
}: {
  events: PlannedEvent[]
  eventsTotal: number
  opportunities: number | null
  contactsTotal: number
  children?: ReactNode
}) {
  const next = events[0]

  const metrics: Metric[] = [
    { icon: IconUsersGroup, label: 'Planned events', value: eventsTotal, href: '/events' },
    ...(opportunities === null
      ? []
      : [{ icon: IconChartBar, label: 'Open opportunities', value: opportunities, href: '/crm' }]),
    { icon: IconTrendingUp, label: 'Total connections', value: contactsTotal, href: '/contacts' },
  ]

  return (
    <section className="abc-dash-card abc-lift" aria-labelledby="home-eei-title">
      <GoldTrace phase={0.5} />
      <div className="abc-dash-clip">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hero/home-globe.svg" alt="" className="abc-eei-globe" aria-hidden="true" />
      </div>

      <div className="relative grid gap-5 p-5 sm:p-6 lg:px-7 lg:py-[22px] min-[1360px]:grid-cols-[minmax(0,1fr)_minmax(0,0.62fr)] min-[1360px]:items-center min-[1360px]:gap-7 min-[1536px]:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)] min-[1536px]:gap-8">
        <div className="min-w-0">
          <div className="flex items-start gap-4">
            <IconCalendarCheck
              size={42}
              stroke={1.4}
              className="mt-0.5 shrink-0"
              style={{ color: 'var(--abc-gold)' }}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <h2 id="home-eei-title" className="text-[20px] font-bold leading-tight tracking-tight text-[#161412] sm:text-[22px]">
                Event &amp; Expo Intelligence
              </h2>
              <p className="abc-dash-sub mt-1">
                Plan the events you are going to, and follow through on who you meet.
              </p>
            </div>
            <Link href="/events" className="abc-outline-pill abc-card-link abc-focus-ring hidden shrink-0 sm:inline-flex">
              Explore events
              <IconChevronRight size={16} stroke={2} />
            </Link>
          </div>

          <ul className="mt-5 grid grid-cols-1 gap-3 min-[480px]:grid-cols-3 lg:mt-[18px]">
            {metrics.map((metric) => (
              <li key={metric.label}>
                <Link
                  href={metric.href}
                  className="abc-eei-glass abc-lift flex min-h-[62px] items-center gap-2.5 rounded-[14px] px-3 py-2.5 hover:border-[rgba(201,150,40,0.38)] abc-focus-ring"
                >
                  <metric.icon size={24} stroke={1.5} className="shrink-0" style={{ color: 'var(--abc-gold)' }} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] leading-tight text-[#6a645b]">{metric.label}</span>
                    <span className="mt-0.5 block text-[18px] font-bold leading-tight tabular-nums text-[#161412]">
                      {metric.value}
                    </span>
                  </span>
                  <IconChevronRight size={16} stroke={1.75} className="shrink-0 text-[#4a453e]" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>

          {/* The next event by name, where the panel stacks; wide screens show the tiles alone, as the reference does. */}
          {next ? (
            <Link
              href={`/events/planned/${next.id}`}
              className="mt-2 flex min-h-[44px] items-center gap-1 rounded-[10px] text-[12.5px] text-[#6a645b] abc-focus-ring lg:hidden"
            >
              {/* Dates follow the visitor's locale, which the server cannot know. */}
              <span className="min-w-0 truncate" suppressHydrationWarning>
                {eventPhase(next) === 'past' ? 'Latest' : 'Next'}: <span className="font-semibold text-[#8f6812]">{next.name}</span>
                {eventDateLabel(next) ? ` · ${eventDateLabel(next)}` : ''}
              </span>
              <IconChevronRight size={14} stroke={2} className="shrink-0" aria-hidden="true" />
            </Link>
          ) : (
            <p className="mt-3 text-[12.5px] leading-[1.5] text-[#6a645b] lg:hidden">
              No planned events yet. Plan your next fair and arrive prepared.
            </p>
          )}

          <Link href="/events" className="abc-dash-link abc-card-link abc-focus-ring mt-1 inline-flex sm:hidden">
            Explore events
            <IconChevronRight size={16} stroke={2} />
          </Link>
        </div>

        {children ? <div className="min-w-0">{children}</div> : null}
      </div>
    </section>
  )
}
