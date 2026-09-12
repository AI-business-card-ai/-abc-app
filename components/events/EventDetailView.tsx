'use client'

import { useState } from 'react'
import Link from 'next/link'
import { IconArrowLeft, IconUsers } from '@tabler/icons-react'
import { EmptyState, SectionLabel } from '@/components/ui/abc/Bits'
import {
  matchesFilter,
  type EventEncounter,
  type EventFilter,
  type EventWorkspace,
} from '@/lib/events/workspace'

/**
 * One event: who was met there, and what is still open.
 *
 * Built for the walk back from the hall — a column of meetings, each saying who,
 * what was discussed, what was promised, and whether it reached the CRM. The
 * person's name links to the one canonical contact screen; there is no
 * event-local editor, because the contact is global and a second place to edit
 * it would be a second version of the truth.
 *
 * Filtering happens here, over rows already loaded, so a tap costs nothing and
 * no query can be built from anything the browser says.
 */

const FILTERS: { key: EventFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'needs_follow_up', label: 'Needs follow-up' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'in_crm', label: 'In CRM' },
  { key: 'not_in_crm', label: 'Not in CRM' },
]

const PROVIDER_LABELS: Record<string, string> = {
  hubspot: 'HubSpot',
  pipedrive: 'Pipedrive',
  salesforce: 'Salesforce',
}

function formatDay(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[20px] font-bold leading-none text-abc-text">{value}</p>
      <p className="mt-1 truncate text-[12px] text-abc-muted">{label}</p>
    </div>
  )
}

export default function EventDetailView({ workspace }: { workspace: EventWorkspace }) {
  const [filter, setFilter] = useState<EventFilter>('all')
  const { summary, encounters } = workspace
  const visible = encounters.filter((row) => matchesFilter(row, filter))

  return (
    <div className="mx-auto w-full max-w-[900px] abc-page-top px-4 pb-10 sm:px-6 lg:px-8">
      <Link
        href="/events"
        className="inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-medium text-abc-secondary transition-colors duration-200 ease-abc hover:text-abc-text abc-focus-ring rounded-inner"
      >
        <IconArrowLeft size={16} stroke={1.9} aria-hidden="true" />
        Events
      </Link>

      <header className="mt-1">
        <SectionLabel>Event</SectionLabel>
        <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight text-abc-text lg:text-[34px]">
          {summary.name}
        </h1>
        {formatDay(summary.lastMetAt) ? (
          <p className="mt-1.5 text-[13.5px] text-abc-secondary">
            {summary.firstMetAt && formatDay(summary.firstMetAt) !== formatDay(summary.lastMetAt)
              ? `${formatDay(summary.firstMetAt)} – ${formatDay(summary.lastMetAt)}`
              : formatDay(summary.lastMetAt)}
          </p>
        ) : null}
      </header>

      {/*
        People and meetings are separate numbers on purpose: meeting the same
        person twice at one fair is two meetings and one person, and collapsing
        them would misreport both.
      */}
      <section className="abc-surface mt-5 grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 sm:p-5">
        <Stat value={summary.people} label={summary.people === 1 ? 'Person met' : 'People met'} />
        <Stat value={summary.encounters} label={summary.encounters === 1 ? 'Meeting' : 'Meetings'} />
        <Stat value={summary.followUpsDue} label="Follow-ups due" />
        <Stat value={summary.crmSynced} label="In CRM" />
      </section>

      <div className="abc-scroll-x mt-5 -mx-4 scroll-px-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2">
          {FILTERS.map((option) => {
            const active = option.key === filter
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setFilter(option.key)}
                aria-pressed={active}
                className={`flex-none whitespace-nowrap rounded-full border px-3.5 py-2 text-[12.5px] font-medium transition-colors duration-200 ease-abc abc-focus-ring ${
                  active
                    ? 'border-transparent text-[#1a1205]'
                    : 'border-abc-border bg-abc-raised text-abc-secondary hover:border-abc-border-strong hover:text-abc-text'
                }`}
                style={active ? { background: 'var(--abc-gold)' } : undefined}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="abc-surface mt-4">
          <EmptyState
            icon={IconUsers}
            title="Nothing here."
            description="No meeting at this event matches that filter."
          />
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {visible.map((row) => (
            <EncounterRow key={row.encounterId} row={row} />
          ))}
        </ul>
      )}
    </div>
  )
}

function EncounterRow({ row }: { row: EventEncounter }) {
  const { person } = row
  const name = person.name || 'Unnamed contact'
  const secondary = [person.role, person.company].filter(Boolean).join(' · ')
  const day = formatDay(row.metAt)
  const followUpDay = formatDay(row.followUpAt)

  return (
    <li className="abc-surface p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* The one canonical contact screen — never an event-local copy. */}
          <Link
            href={`/contacts/${person.id}`}
            className="block truncate text-[15.5px] font-semibold text-abc-text transition-colors duration-200 ease-abc hover:text-abc-gold-accent abc-focus-ring rounded"
          >
            {name}
          </Link>
          {secondary ? (
            <p className="mt-0.5 truncate text-[13px] text-abc-secondary">{secondary}</p>
          ) : null}
          {day ? <p className="mt-0.5 text-[12px] text-abc-muted">Met {day}</p> : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {row.followUp === 'due' ? (
            <Badge tone="due">Needs follow-up</Badge>
          ) : row.followUp === 'scheduled' ? (
            <Badge tone="scheduled">{followUpDay ? `Due ${followUpDay}` : 'Scheduled'}</Badge>
          ) : null}
          {row.crm === 'synced' ? (
            <Badge tone="crm">
              {row.crmProviders.length === 1
                ? `In ${PROVIDER_LABELS[row.crmProviders[0]] ?? row.crmProviders[0]}`
                : 'In CRM'}
            </Badge>
          ) : null}
        </div>
      </div>

      {row.discussed ? (
        <p className="mt-2.5 text-[13px] leading-[1.55] text-abc-secondary">{row.discussed}</p>
      ) : null}

      {row.nextAction ? (
        <p className="mt-2 rounded-inner border border-abc-border bg-abc-raised px-3 py-2 text-[12.5px] leading-[1.5] text-abc-text">
          <span className="text-abc-muted">Next: </span>
          {row.nextAction}
        </p>
      ) : null}
    </li>
  )
}

function Badge({ tone, children }: { tone: 'due' | 'scheduled' | 'crm'; children: React.ReactNode }) {
  const styles: Record<typeof tone, React.CSSProperties> = {
    due: { background: 'rgba(239, 68, 68, 0.12)', color: '#fca5a5' },
    scheduled: { background: 'rgba(234, 179, 8, 0.12)', color: '#e5c07b' },
    crm: { background: 'var(--abc-gold-soft)', color: 'var(--abc-gold-accent)' },
  }
  return (
    <span
      className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={styles[tone]}
    >
      {children}
    </span>
  )
}
