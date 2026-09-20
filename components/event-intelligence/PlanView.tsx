import Link from 'next/link'
import { IconArrowLeft, IconTargetArrow } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import { EmptyState, SectionLabel } from '@/components/ui/abc/Bits'
import PlanBoard from '@/components/event-intelligence/PlanBoard'
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
 * Server-rendered shell around one client island: the header and the closing
 * note never change, and the searching, filtering and removing that do live in
 * PlanBoard.
 */
export default function PlanView({ event, plan }: { event: IntelEvent; plan: PlanGroup[] }) {
  const summary = planSummary(plan)

  return (
    <div className="mx-auto w-full max-w-[900px] abc-page-top px-4 pb-16 sm:px-6 lg:px-8">
      <Link
        href={`/events/intelligence/${event.eventKey}`}
        className="-my-3 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
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
          <PlanBoard groups={plan} eventKey={event.eventKey} />

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
