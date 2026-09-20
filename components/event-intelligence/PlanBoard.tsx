'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconMapPin, IconSearch, IconX } from '@tabler/icons-react'
import { SectionLabel } from '@/components/ui/abc/Bits'
import { STATUS_LABEL } from '@/lib/event-intelligence/view'
import {
  EMPTY_PLAN_QUERY,
  PLAN_SORT_LABEL,
  applyPlanQuery,
  isDefaultPlanQuery,
  planHalls,
  planTypeCounts,
  type PlanGroup,
  type PlanQuery,
  type PlanSort,
} from '@/lib/event-intelligence/plan'
import type { MatchType } from '@/lib/event-intelligence/types'

/**
 * The plan to walk the fair with, once it is long enough to need finding in.
 *
 * Priority stays the grouping whatever the sort: it is the owner's own
 * judgement about who matters, and a screen that hides it to sort by hall has
 * thrown away the more important fact. The sort decides the order *within* each
 * group — down one hall, or by name when somebody is looking for a company
 * rather than walking.
 *
 * Still not a route and still not a schedule. Removing a target is here because
 * plans change; nothing here marks anybody as met, because only a meeting the
 * owner actually recorded can do that.
 */
export default function PlanBoard({ groups, eventKey }: { groups: PlanGroup[]; eventKey: string }) {
  const router = useRouter()
  const [query, setQuery] = useState<PlanQuery>(EMPTY_PLAN_QUERY)
  const [busy, setBusy] = useState<string | null>(null)

  const halls = useMemo(() => planHalls(groups), [groups])
  const counts = useMemo(() => planTypeCounts(groups, query), [groups, query])
  const filtered = useMemo(() => applyPlanQuery(groups, query), [groups, query])
  const shown = filtered.reduce((total, group) => total + group.entries.length, 0)
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0)

  async function remove(targetId: string) {
    setBusy(targetId)
    try {
      await fetch(`/api/event-intelligence/targets?id=${encodeURIComponent(targetId)}`, { method: 'DELETE' })
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  const chip = (active: boolean) =>
    `inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-btn border px-3 py-2 text-[13px] font-medium transition-colors duration-200 ease-abc abc-focus-ring ${
      active
        ? 'border-abc-border-strong bg-abc-raised text-abc-text'
        : 'border-abc-border text-abc-secondary hover:text-abc-text'
    }`

  return (
    <>
      {total > 6 ? (
        <section className="mt-6">
          <div className="relative">
            <label htmlFor="plan-search" className="sr-only">
              Search your plan by company, note or category
            </label>
            <IconSearch
              size={16}
              stroke={1.7}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-abc-muted"
            />
            <input
              id="plan-search"
              type="search"
              value={query.search}
              onChange={(event) => setQuery({ ...query, search: event.target.value })}
              placeholder="Search your plan"
              className="abc-input min-h-[44px] w-full py-2.5 pl-9 pr-10 text-[14px]"
            />
            {query.search ? (
              <button
                type="button"
                onClick={() => setQuery({ ...query, search: '' })}
                aria-label="Clear search"
                className="touch-target absolute right-1 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center text-abc-muted transition-colors hover:text-abc-text abc-focus-ring"
              >
                <IconX size={16} stroke={1.8} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div
            className="abc-scroll-x -mx-4 mt-3 flex gap-2 px-4 sm:mx-0 sm:px-0"
            role="group"
            aria-label="Filter your plan by what kind of opportunity"
          >
            {([
              ['all', 'All'],
              ['customer', 'Customers'],
              ['supplier', 'Suppliers'],
              ['partner', 'Partners'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setQuery({ ...query, type: value as 'all' | MatchType })}
                aria-pressed={query.type === value}
                className={chip(query.type === value)}
              >
                {label}
                <span className="text-abc-muted">{counts[value as 'all' | MatchType]}</span>
              </button>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {halls.length > 1 ? (
              <span className="inline-flex items-center">
                <label htmlFor="plan-hall" className="sr-only">
                  Filter your plan by hall
                </label>
                <select
                  id="plan-hall"
                  value={query.hall ?? ''}
                  onChange={(event) => setQuery({ ...query, hall: event.target.value || null })}
                  className="abc-input min-h-[44px] px-3 py-2 text-[13px]"
                >
                  <option value="">Any hall</option>
                  {halls.map((hall) => (
                    <option key={hall} value={hall}>
                      Hall {hall}
                    </option>
                  ))}
                </select>
              </span>
            ) : null}

            <span className="inline-flex items-center">
              <label htmlFor="plan-sort" className="sr-only">
                Sort your plan
              </label>
              <select
                id="plan-sort"
                value={query.sort}
                onChange={(event) => setQuery({ ...query, sort: event.target.value as PlanSort })}
                className="abc-input min-h-[44px] px-3 py-2 text-[13px]"
              >
                {(Object.keys(PLAN_SORT_LABEL) as PlanSort[]).map((sort) => (
                  <option key={sort} value={sort}>
                    {PLAN_SORT_LABEL[sort]}
                  </option>
                ))}
              </select>
            </span>
          </div>

          {!isDefaultPlanQuery(query) ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="text-[12.5px] text-abc-muted" role="status">
                {shown} of {total} shown
              </p>
              <button
                type="button"
                onClick={() => setQuery(EMPTY_PLAN_QUERY)}
                className="touch-target inline-flex min-h-[44px] items-center rounded-btn border border-abc-border px-3 py-2 text-[12.5px] font-medium text-abc-secondary transition-colors duration-200 ease-abc hover:border-abc-border-strong hover:text-abc-text abc-focus-ring"
              >
                Clear filters
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {filtered.length === 0 ? (
        <p className="abc-surface mt-6 px-4 py-8 text-center text-[13.5px] text-abc-secondary">
          Nothing in your plan matches those filters.
        </p>
      ) : (
        filtered.map((group) => (
          <section key={group.priority} className="mt-6">
            <SectionLabel>
              {group.label} · {group.entries.length}
            </SectionLabel>

            <ul className="mt-3 flex flex-col gap-3">
              {group.entries.map((entry) => (
                <li key={entry.targetId} className="abc-surface p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <Link
                      href={`/events/intelligence/${eventKey}/m/${entry.matchId}`}
                      className="min-w-0 flex-1 abc-focus-ring"
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

                      <span className="mt-1 block truncate text-[16px] font-semibold text-abc-text">
                        {entry.companyName}
                      </span>

                      <span
                        className="mt-1 flex items-center gap-1 text-[12.5px]"
                        style={{ color: entry.hasLocation ? 'var(--text-secondary)' : 'var(--text-muted)' }}
                      >
                        <IconMapPin size={13} stroke={1.7} aria-hidden="true" />
                        {entry.location}
                      </span>

                      {entry.privateNote ? (
                        <span className="mt-1.5 block text-[13px] leading-[1.55] text-abc-secondary">
                          {entry.privateNote}
                        </span>
                      ) : null}
                    </Link>

                    <button
                      type="button"
                      onClick={() => remove(entry.targetId)}
                      disabled={busy === entry.targetId}
                      aria-label={`Remove ${entry.companyName} from your plan`}
                      className="touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-btn border border-abc-border text-abc-muted transition-colors duration-200 ease-abc hover:border-abc-border-strong hover:text-abc-text disabled:opacity-45 abc-focus-ring"
                    >
                      <IconX size={17} stroke={1.8} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  )
}
