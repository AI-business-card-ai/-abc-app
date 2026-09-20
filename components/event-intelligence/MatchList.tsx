'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  IconBookmark,
  IconBookmarkFilled,
  IconChevronRight,
  IconMapPin,
  IconSearch,
  IconX,
} from '@tabler/icons-react'
import { MATCH_TYPE_LABEL, type MatchRow } from '@/lib/event-intelligence/view'
import {
  EMPTY_MATCH_QUERY,
  MATCH_PAGE_SIZE,
  SORT_LABEL,
  applyMatchQuery,
  hallOptions,
  isDefaultQuery,
  typeCounts,
  type MatchQuery,
  type MatchSort,
} from '@/lib/event-intelligence/match-query'
import type { MatchType } from '@/lib/event-intelligence/types'

/**
 * The ranked list, and the controls that make it usable at a real fair.
 *
 * Twenty matches need a list. Eight hundred need a way to say "the bearings
 * people in hall 3", which is what the search, the filters and the sorts are
 * for. They are kept to dimensions the listing actually holds — type, hall,
 * whether there is a stand to walk to, whether it is already saved — so nothing
 * on this bar promises knowledge ABC does not have.
 *
 * One line of reasoning per row and no more: the question is "who should I walk
 * to", and five paragraphs per company is a screen nobody reads standing up.
 *
 * Rendering is capped at a page at a time. Filtering three thousand rows is
 * cheap; laying out three thousand cards is not.
 */

/*
  Three directions, three weights of the one palette ABC has. The app is gold
  and neutrals by design, so the types are told apart by strength rather than by
  a new hue: gold for customers, full-strength text for suppliers, secondary
  text for partners. The words are still the primary signal.
*/
const TYPE_TINT: Record<MatchRow['matchType'], string> = {
  customer: 'var(--abc-gold)',
  supplier: 'var(--text-primary)',
  partner: 'var(--text-secondary)',
}

const TYPE_CHIPS: { value: 'all' | MatchType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'customer', label: 'Customers' },
  { value: 'supplier', label: 'Suppliers' },
  { value: 'partner', label: 'Partners' },
]

export default function MatchList({
  rows,
  eventKey,
  totalMatches,
}: {
  rows: MatchRow[]
  eventKey: string
  /** Every match ABC produced, which may exceed what this page was handed. */
  totalMatches?: number
}) {
  const router = useRouter()
  const [query, setQuery] = useState<MatchQuery>(EMPTY_MATCH_QUERY)
  const [shown, setShown] = useState(MATCH_PAGE_SIZE)
  const [busy, setBusy] = useState<string | null>(null)

  const halls = useMemo(() => hallOptions(rows), [rows])
  const counts = useMemo(() => typeCounts(rows, query), [rows, query])
  const results = useMemo(() => applyMatchQuery(rows, query), [rows, query])
  const visible = results.slice(0, shown)

  const update = (patch: Partial<MatchQuery>) => {
    setQuery((current) => ({ ...current, ...patch }))
    setShown(MATCH_PAGE_SIZE)
  }

  async function toggleSave(row: MatchRow) {
    setBusy(row.matchId)
    try {
      if (row.saved && row.targetId) {
        await fetch(`/api/event-intelligence/targets?id=${encodeURIComponent(row.targetId)}`, {
          method: 'DELETE',
        })
      } else {
        await fetch('/api/event-intelligence/targets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matchId: row.matchId }),
        })
      }
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
    <section className="mt-6">
      {/* ── Search ── */}
      <div className="relative">
        <label htmlFor="match-search" className="sr-only">
          Search companies, categories and products
        </label>
        <IconSearch
          size={16}
          stroke={1.7}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-abc-muted"
        />
        <input
          id="match-search"
          type="search"
          value={query.search}
          onChange={(event) => update({ search: event.target.value })}
          placeholder="Search a company, category or product"
          className="abc-input min-h-[44px] w-full py-2.5 pl-9 pr-10 text-[14px]"
        />
        {query.search ? (
          <button
            type="button"
            onClick={() => update({ search: '' })}
            aria-label="Clear search"
            className="touch-target absolute right-1 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center text-abc-muted transition-colors hover:text-abc-text abc-focus-ring"
          >
            <IconX size={16} stroke={1.8} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {/* ── Type ── */}
      <div
        className="abc-scroll-x -mx-4 mt-3 flex gap-2 px-4 sm:mx-0 sm:px-0"
        role="group"
        aria-label="Filter by what kind of opportunity"
      >
        {TYPE_CHIPS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => update({ type: value })}
            aria-pressed={query.type === value}
            className={chip(query.type === value)}
          >
            {label}
            <span className="text-abc-muted">{counts[value]}</span>
          </button>
        ))}
      </div>

      {/* ── Hall, stand, saved, sort ── */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {halls.length > 1 ? (
          <span className="inline-flex items-center">
            <label htmlFor="match-hall" className="sr-only">
              Filter by hall
            </label>
            <select
              id="match-hall"
              value={query.hall ?? ''}
              onChange={(event) => update({ hall: event.target.value || null })}
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

        <button
          type="button"
          onClick={() => update({ savedOnly: !query.savedOnly })}
          aria-pressed={query.savedOnly}
          className={chip(query.savedOnly)}
        >
          Saved
        </button>

        <button
          type="button"
          onClick={() => update({ withStandOnly: !query.withStandOnly })}
          aria-pressed={query.withStandOnly}
          className={chip(query.withStandOnly)}
        >
          Has a stand
        </button>

        <span className="inline-flex items-center">
          <label htmlFor="match-sort" className="sr-only">
            Sort matches
          </label>
          <select
            id="match-sort"
            value={query.sort}
            onChange={(event) => update({ sort: event.target.value as MatchSort })}
            className="abc-input min-h-[44px] px-3 py-2 text-[13px]"
          >
            {(Object.keys(SORT_LABEL) as MatchSort[]).map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABEL[sort]}
              </option>
            ))}
          </select>
        </span>
      </div>

      {/* ── What is on screen ── */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-[12.5px] text-abc-muted" role="status">
          {results.length === rows.length
            ? `${results.length} ${results.length === 1 ? 'match' : 'matches'}`
            : `${results.length} of ${rows.length} shown`}
          {totalMatches && totalMatches > rows.length
            ? ` · the ${rows.length} strongest of ${totalMatches} are loaded`
            : ''}
        </p>

        {/* Its own control rather than a word inside the sentence — a thing you
            tap needs to be tappable, and 19px of underlined text is not. */}
        {!isDefaultQuery(query) ? (
          <button
            type="button"
            onClick={() => {
              setQuery(EMPTY_MATCH_QUERY)
              setShown(MATCH_PAGE_SIZE)
            }}
            className="touch-target inline-flex min-h-[44px] items-center rounded-btn border border-abc-border px-3 py-2 text-[12.5px] font-medium text-abc-secondary transition-colors duration-200 ease-abc hover:border-abc-border-strong hover:text-abc-text abc-focus-ring"
          >
            Clear filters
          </button>
        ) : null}
      </div>
      {results.length === 0 ? (
        <p className="abc-surface mt-4 px-4 py-8 text-center text-[13.5px] text-abc-secondary">
          {query.savedOnly && isDefaultQuery({ ...query, savedOnly: false })
            ? 'You have not saved anybody yet. Save the companies worth your time and they will appear here and in your plan.'
            : 'Nothing matches those filters. Try clearing one of them.'}
        </p>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-3">
            {visible.map((row) => (
              <li key={row.matchId} className="abc-surface p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <Link
                    href={`/events/intelligence/${eventKey}/m/${row.matchId}`}
                    className="min-w-0 flex-1 abc-focus-ring"
                  >
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className="text-[11px] font-semibold uppercase tracking-[0.06em]"
                        style={{ color: TYPE_TINT[row.matchType] }}
                      >
                        {MATCH_TYPE_LABEL[row.matchType]}
                      </span>
                      <span className="text-[11px] font-semibold text-abc-muted">
                        ABC Match {row.score}
                      </span>
                      {row.weak ? <span className="text-[11px] text-abc-muted">· thin match</span> : null}
                      {row.withdrawn ? (
                        <span className="text-[11px]" style={{ color: 'var(--abc-overdue)' }}>
                          · no longer listed
                        </span>
                      ) : null}
                    </span>

                    <span className="mt-1 block truncate text-[16px] font-semibold text-abc-text">
                      {row.companyName}
                    </span>

                    <span
                      className="mt-1 flex items-center gap-1 text-[12.5px]"
                      style={{ color: row.hasLocation ? 'var(--text-secondary)' : 'var(--text-muted)' }}
                    >
                      <IconMapPin size={13} stroke={1.7} aria-hidden="true" />
                      {row.location}
                    </span>

                    {row.headline ? (
                      <span className="mt-2 block text-[13px] leading-[1.55] text-abc-secondary">
                        {row.headline}
                      </span>
                    ) : null}
                  </Link>

                  <div className="flex shrink-0 flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleSave(row)}
                      disabled={busy === row.matchId}
                      aria-pressed={row.saved}
                      aria-label={
                        row.saved
                          ? `Remove ${row.companyName} from your plan`
                          : `Save ${row.companyName} to your plan`
                      }
                      className="touch-target inline-flex h-11 w-11 items-center justify-center rounded-btn border border-abc-border transition-colors duration-200 ease-abc hover:border-abc-border-strong disabled:opacity-45 abc-focus-ring"
                    >
                      {row.saved ? (
                        <IconBookmarkFilled size={18} style={{ color: 'var(--abc-gold)' }} aria-hidden="true" />
                      ) : (
                        <IconBookmark size={18} stroke={1.7} className="text-abc-muted" aria-hidden="true" />
                      )}
                    </button>
                    <Link
                      href={`/events/intelligence/${eventKey}/m/${row.matchId}`}
                      aria-label={`Why ABC suggests ${row.companyName}`}
                      className="touch-target inline-flex h-11 w-11 items-center justify-center text-abc-muted transition-colors hover:text-abc-text abc-focus-ring"
                    >
                      <IconChevronRight size={18} stroke={1.8} aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {results.length > visible.length ? (
            <button
              type="button"
              onClick={() => setShown((current) => current + MATCH_PAGE_SIZE)}
              className="touch-target mt-4 inline-flex min-h-[44px] items-center rounded-btn border border-abc-border px-4 py-2 text-[13px] font-medium text-abc-secondary transition-colors duration-200 ease-abc hover:border-abc-border-strong hover:text-abc-text abc-focus-ring"
            >
              Show more · {results.length - visible.length} left
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}
