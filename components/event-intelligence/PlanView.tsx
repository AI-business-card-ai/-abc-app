import Link from 'next/link'
import { IconArrowLeft, IconMapPin, IconTargetArrow } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import { EmptyState, SectionLabel } from '@/components/ui/abc/Bits'
import { STATUS_LABEL } from '@/lib/event-intelligence/view'
import { planSummary, type PlanGroup } from '@/lib/event-intelligence/plan'
import type { IntelEvent } from '@/lib/event-intelligence/types'

/**
 * What to do at the fair.
 *
 * A single column of cards, not a table. A desktop table forced onto a phone is
 * exactly the wrong shape for the one moment this screen matters — standing in
 * a hall, one hand free — so the layout is the same on every width and simply
 * has more room on a large one.
 *
 * Server-rendered: nothing here changes without a page load, and the actions
 * that do change something live on the match detail.
 */
export default function PlanView({ event, plan }: { event: IntelEvent; plan: PlanGroup[] }) {
  const summary = planSummary(plan)

  return (
    <div className="mx-auto w-full max-w-[900px] abc-page-top px-4 pb-16 sm:px-6 lg:px-8">
      <Link
        href={`/events/intelligence/${event.eventKey}`}
        className="inline-flex items-center gap-1.5 text-[13px] text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
      >
        <IconArrowLeft size={16} stroke={1.8} aria-hidden="true" />
        {event.name}
      </Link>

      <header className="mt-4">
        <SectionLabel>At the fair</SectionLabel>
        <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight text-abc-text lg:text-[34px]">
          Your plan
        </h1>
        {summary.total > 0 ? (
          <p className="mt-1.5 text-[13px] text-abc-secondary">
            {summary.total} saved · {summary.remaining} still to meet
            {summary.met > 0 ? ` · ${summary.met} met` : ''}
          </p>
        ) : null}
      </header>

      {plan.length === 0 ? (
        <div className="abc-surface mt-6">
          <EmptyState
            icon={IconTargetArrow}
            title="Nothing saved yet."
            description="Save the companies worth your time from the match list and they will appear here, grouped by how important you said they are."
            action={<Button href={`/events/intelligence/${event.eventKey}`}>See your matches</Button>}
          />
        </div>
      ) : (
        <>
          {plan.map((group) => (
            <section key={group.priority} className="mt-6">
              <SectionLabel>
                {group.label} · {group.entries.length}
              </SectionLabel>

              <ul className="mt-3 flex flex-col gap-3">
                {group.entries.map((entry) => (
                  <li key={entry.targetId}>
                    <Link
                      href={`/events/intelligence/${event.eventKey}/m/${entry.matchId}`}
                      className="abc-surface flex flex-col gap-1.5 p-4 transition-colors duration-200 ease-abc hover:border-abc-border-strong abc-focus-ring sm:p-5"
                    >
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {entry.matchTypeLabel ? (
                          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-abc-secondary">
                            {entry.matchTypeLabel}
                          </span>
                        ) : null}
                        {entry.score !== null ? (
                          <span className="text-[11px] font-semibold text-abc-muted">
                            ABC Match {entry.score}
                          </span>
                        ) : null}
                        <span
                          className="text-[11px] font-semibold"
                          style={{
                            color: entry.status === 'met' ? 'var(--accent-turquoise)' : 'var(--text-muted)',
                          }}
                        >
                          {STATUS_LABEL[entry.status]}
                        </span>
                        {entry.withdrawn ? (
                          <span className="text-[11px]" style={{ color: 'var(--abc-overdue)' }}>
                            no longer listed
                          </span>
                        ) : null}
                      </span>

                      <span className="block truncate text-[16px] font-semibold text-abc-text">
                        {entry.companyName}
                      </span>

                      <span
                        className="flex items-center gap-1 text-[12.5px]"
                        style={{ color: entry.hasLocation ? 'var(--text-secondary)' : 'var(--text-muted)' }}
                      >
                        <IconMapPin size={13} stroke={1.7} aria-hidden="true" />
                        {entry.location}
                      </span>

                      {entry.privateNote ? (
                        <span className="mt-0.5 block text-[13px] leading-[1.55] text-abc-secondary">
                          {entry.privateNote}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <p className="mt-8 text-[12px] leading-[1.6] text-abc-muted">
            Grouped by the priority you set, then by hall so nearby stands sit together. This is not
            a route or a schedule — ABC does not know how long anything will take.
            {summary.withoutLocation > 0
              ? ` ${summary.withoutLocation} of these have no stand in the listing; ask at the entrance.`
              : ''}
          </p>
        </>
      )}
    </div>
  )
}
