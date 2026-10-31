'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconChevronRight, IconSearch, IconUsers, IconX } from '@tabler/icons-react'
import { DueLabel, PILL_CLASS, StageChip, pillState } from '@/components/opportunities/parts'
import Avatar from '@/components/ui/abc/Avatar'
import Button from '@/components/ui/abc/Button'
import { EmptyState } from '@/components/ui/abc/Bits'
import { relativeDay } from '@/lib/format-date'
import {
  PEOPLE_FILTERS,
  formatMoney,
  matchesPeopleFilter,
  matchesPeopleQuery,
  type PeopleFilter,
  type PeopleRow,
} from '@/lib/opportunities/model'

const PAGE = 60

/**
 * The People tab: the owner's contacts, read for the relationship.
 *
 * Not a second contact list. These are the same records Contacts shows, and a
 * row opens the same Contact Detail screen; this view only puts the CRM
 * questions first — where you met, what you sent, whether there is a deal and
 * what is next.
 */
export default function PeopleView({ rows, failed }: { rows: PeopleRow[]; failed: boolean }) {
  const router = useRouter()
  const [filter, setFilter] = useState<PeopleFilter>('all')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const counts = useMemo(
    () => Object.fromEntries(PEOPLE_FILTERS.map((f) => [f.id, rows.filter((r) => matchesPeopleFilter(r, f.id)).length])) as Record<PeopleFilter, number>,
    [rows]
  )
  const visible = useMemo(
    () => rows.filter((r) => matchesPeopleFilter(r, filter) && matchesPeopleQuery(r, query)),
    [rows, filter, query]
  )

  if (failed) {
    return (
      <div className="abc-surface">
        <EmptyState
          icon={IconUsers}
          title="We couldn't load your people."
          description="Something went wrong on our side. Your data is safe."
          action={<Button onClick={() => router.refresh()}>Try again</Button>}
        />
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="abc-surface">
        <EmptyState
          icon={IconUsers}
          title="No people yet."
          description="Everyone you scan appears here, with where you met and what is next."
          action={<Button href="/scan">Scan a card</Button>}
        />
      </div>
    )
  }

  return (
    <div>
      <div className="relative">
        <IconSearch size={18} stroke={1.8} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-abc-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setLimit(PAGE)
          }}
          placeholder="Search people, companies, events…"
          aria-label="Search people"
          className="h-12 min-h-[44px] w-full rounded-inner border border-abc-border bg-abc-card pl-11 pr-10 text-[16px] text-abc-text outline-none transition-colors duration-200 ease-abc placeholder:text-abc-muted focus:border-abc-gold-accent sm:text-[15px]"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-abc-muted transition-colors hover:text-abc-text abc-focus-ring"
          >
            <IconX size={16} stroke={1.9} />
          </button>
        ) : null}
      </div>

      <div className="abc-scroll-x -mx-1 mt-3 px-1">
        <div className="flex gap-2">
          {PEOPLE_FILTERS.map((item) => {
            const pill = pillState(filter === item.id)
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={filter === item.id}
                onClick={() => {
                  setFilter(item.id)
                  setLimit(PAGE)
                }}
                className={`${PILL_CLASS} ${pill.className} inline-flex items-center gap-1.5`}
                style={pill.style}
              >
                {item.label}
                <span className={`tabular-nums ${filter === item.id ? 'opacity-70' : 'text-abc-muted'}`}>{counts[item.id]}</span>
              </button>
            )
          })}
        </div>
      </div>

      <p className="mt-4 text-[12.5px] text-abc-muted" aria-live="polite">
        {visible.length === rows.length ? `${rows.length} ${rows.length === 1 ? 'person' : 'people'}` : `${visible.length} of ${rows.length}`}
      </p>

      {visible.length === 0 ? (
        <div className="abc-surface mt-3">
          <EmptyState icon={IconSearch} title="Nobody matches that." description="Try a different search or filter." />
        </div>
      ) : (
        <ul className="abc-surface mt-3 divide-y divide-abc-border overflow-hidden">
          {visible.slice(0, limit).map((row) => (
            <PersonRow key={row.person.id} row={row} />
          ))}
        </ul>
      )}

      {visible.length > limit ? (
        <div className="mt-4 flex justify-center">
          <Button variant="surface" onClick={() => setLimit((n) => n + PAGE)}>
            Show more
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function PersonRow({ row }: { row: PeopleRow }) {
  const { person, opportunity, next } = row
  const meta = [person.role, person.company].filter(Boolean).join(' · ')
  const met = person.metAt ? [person.event ? `Met at ${person.event}` : 'Met', relativeDay(person.metAt)].join(' · ') : null
  const value = opportunity ? formatMoney(opportunity.value, opportunity.currency) : ''

  return (
    <li className="flex items-stretch">
      <Link
        href={`/contacts/${person.id}`}
        className="flex min-w-0 flex-1 gap-3.5 px-4 py-3.5 transition-colors duration-200 ease-abc hover:bg-abc-raised/60 abc-focus-ring sm:px-5"
      >
        <Avatar src={person.photoUrl} name={person.name} size={42} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-abc-text">{person.name}</span>
          {meta ? <span className="mt-0.5 block truncate text-[12.5px] text-abc-secondary">{meta}</span> : null}
          {met ? <span className="mt-1 block truncate text-[12px] text-abc-muted">{met}</span> : null}
          {next ? (
            <span className="mt-1 flex min-w-0 items-center gap-2 text-[12.5px]">
              <span className="min-w-0 truncate text-abc-text">Next: {next.text}</span>
              <DueLabel dueAt={next.dueAt} />
            </span>
          ) : person.lastFollowUp ? (
            <span className="mt-1 block truncate text-[12px] text-abc-muted">
              Last follow-up · {relativeDay(person.lastFollowUp.at)}
            </span>
          ) : null}
        </span>
        {/* Only where nothing sits beside it — next to a stage chip it read as a stray mark. */}
        {opportunity ? null : (
          <IconChevronRight size={17} stroke={1.8} className="mt-3 shrink-0 text-abc-muted sm:hidden" aria-hidden="true" />
        )}
      </Link>
      {opportunity ? (
        <Link
          href={`/crm/opportunities/${opportunity.id}`}
          className="flex shrink-0 flex-col items-end justify-center gap-1 py-3.5 pl-1 pr-4 abc-focus-ring sm:pr-5"
          aria-label={`Open opportunity with ${person.name}`}
        >
          <StageChip stage={opportunity.stage} />
          {value ? (
            <span className="text-[12px] font-semibold tabular-nums" style={{ color: 'var(--abc-gold-accent)' }}>
              {value}
            </span>
          ) : null}
        </Link>
      ) : null}
    </li>
  )
}
