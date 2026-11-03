import Link from 'next/link'
import { IconArrowLeft, IconPencil, IconScan } from '@tabler/icons-react'
import { EncounterRow, Stat } from '@/components/events/EventDetailView'
import Button from '@/components/ui/abc/Button'
import { EmptyState, SectionLabel } from '@/components/ui/abc/Bits'
import { eventDateLabel, type PlannedEvent } from '@/lib/events/planned'
import type { EventWorkspace } from '@/lib/events/workspace'

const PREPARATION: { key: keyof PlannedEvent; label: string }[] = [
  { key: 'objectives', label: 'Business objectives' },
  { key: 'companiesToVisit', label: 'Companies to visit' },
  { key: 'targetContacts', label: 'People to meet' },
  { key: 'meetingsToArrange', label: 'Meetings to arrange' },
  { key: 'followUpPlan', label: 'Follow-up preparation' },
]

/**
 * One planned event: what to prepare, who was met, and what is still open.
 *
 * Meetings here are the ones the owner linked to this event, and they stay the
 * ordinary meetings on the ordinary contacts: a person's name opens the one contact
 * screen, follow-ups are the ones in the follow-up inbox, and CRM state is read
 * from the same mappings as everywhere else.
 */
export default function PlannedEventDetailView({
  event,
  workspace,
}: {
  event: PlannedEvent
  workspace: EventWorkspace
}) {
  const { summary, encounters } = workspace
  const day = eventDateLabel(event)
  const preparation = PREPARATION.filter(({ key }) => Boolean(event[key]))

  return (
    <div className="mx-auto w-full max-w-[900px] abc-page-top px-4 pb-10 sm:px-6 lg:px-8">
      <Link
        href="/events"
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-inner text-[13px] font-medium text-abc-secondary transition-colors duration-200 ease-abc hover:text-abc-text abc-focus-ring"
      >
        <IconArrowLeft size={16} stroke={1.9} aria-hidden="true" />
        Events
      </Link>

      <header className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel>Planned event</SectionLabel>
          <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight text-abc-text lg:text-[34px]">
            {event.name}
          </h1>
          {day || event.location ? (
            <p className="mt-1.5 text-[13.5px] text-abc-secondary">
              {[day, event.location].filter(Boolean).join(' · ')}
            </p>
          ) : null}
        </div>
        <Button href={`/events/planned/${event.id}/edit`} variant="surface" size="md">
          <IconPencil size={16} stroke={1.8} />
          Edit
        </Button>
      </header>

      <section className="abc-surface mt-5 p-4 sm:p-5">
        <SectionLabel>Before the event</SectionLabel>
        {preparation.length === 0 ? (
          <p className="mt-2 text-[13.5px] leading-[1.55] text-abc-secondary">
            Nothing prepared yet. Add your objectives, the companies to visit and the meetings to arrange.
          </p>
        ) : (
          <dl className="mt-3 flex flex-col gap-3.5">
            {preparation.map(({ key, label }) => (
              <div key={key}>
                <dt className="text-[12px] text-abc-muted">{label}</dt>
                <dd className="mt-0.5 whitespace-pre-line text-[14px] leading-[1.55] text-abc-text">{event[key]}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="mt-6">
        <SectionLabel>During the event</SectionLabel>

        {/* Two numbers on purpose: one contact met twice is one person and two meetings. */}
        <div className="abc-surface mt-2 grid grid-cols-2 gap-4 p-4 sm:p-5">
          <Stat value={summary.people} label={summary.people === 1 ? 'Person met' : 'People met'} />
          <Stat value={summary.encounters} label={summary.encounters === 1 ? 'Meeting' : 'Meetings'} />
        </div>

        {encounters.length === 0 ? (
          <div className="abc-surface mt-3">
            <EmptyState
              icon={IconScan}
              title="No meetings linked yet."
              description="When you scan a card here, choose this event under Associate with planned event. A scan is only linked if you choose it."
              action={<Button href="/scan">Scan a card</Button>}
            />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {encounters.map((row) => (
              <EncounterRow key={row.encounterId} row={row} />
            ))}
          </ul>
        )}
      </section>

      <section className="abc-surface mt-6 p-4 sm:p-5">
        <SectionLabel>After the event</SectionLabel>
        <div className="mt-3 grid grid-cols-3 gap-4">
          <Stat value={summary.followUpsDue} label="Follow-ups due" />
          <Stat value={summary.followUpsScheduled} label="Scheduled" />
          <Stat value={summary.crmSynced} label="In CRM" />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5">
          <Link href="/follow-ups" className="abc-dash-link abc-focus-ring inline-flex">
            Open follow-ups
          </Link>
          <Link href="/crm" className="abc-dash-link abc-focus-ring inline-flex">
            Open CRM
          </Link>
        </div>
      </section>
    </div>
  )
}
