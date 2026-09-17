'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconBookmark, IconBookmarkFilled, IconChevronRight, IconMapPin } from '@tabler/icons-react'
import {
  FILTER_LABEL,
  MATCH_TYPE_LABEL,
  filterCounts,
  matchesFilter,
  type MatchFilter,
  type MatchRow,
} from '@/lib/event-intelligence/view'

/**
 * The ranked list.
 *
 * One line of reasoning per row and no more. The question this screen answers
 * is "who should I walk to", and five paragraphs per company is a screen nobody
 * reads standing up; everything else is one tap away in the detail.
 *
 * Filters scroll horizontally rather than wrapping into a second row, matching
 * the event workspace, and every row is a full-height touch target.
 */

const TYPE_TINT: Record<MatchRow['matchType'], string> = {
  customer: 'var(--abc-chip-text)',
  supplier: 'var(--accent-turquoise)',
  partner: 'var(--text-secondary)',
}

export default function MatchList({
  rows,
  eventKey,
}: {
  rows: MatchRow[]
  eventKey: string
}) {
  const router = useRouter()
  const [filter, setFilter] = useState<MatchFilter>('all')
  const [busy, setBusy] = useState<string | null>(null)

  const counts = useMemo(() => filterCounts(rows), [rows])
  const visible = useMemo(() => rows.filter((row) => matchesFilter(row, filter)), [rows, filter])

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

  const filters: MatchFilter[] = ['all', 'customer', 'supplier', 'partner', 'saved']

  return (
    <section className="mt-6">
      <div className="abc-scroll-x -mx-4 flex gap-2 px-4 sm:mx-0 sm:px-0">
        {filters.map((option) => {
          const active = filter === option
          return (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              aria-pressed={active}
              className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-btn border px-3 py-2 text-[13px] font-medium transition-colors duration-200 ease-abc abc-focus-ring ${
                active
                  ? 'border-abc-border-strong bg-abc-raised text-abc-text'
                  : 'border-abc-border text-abc-secondary hover:text-abc-text'
              }`}
            >
              {FILTER_LABEL[option]}
              <span className="text-abc-muted">{counts[option]}</span>
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <p className="abc-surface mt-4 px-4 py-8 text-center text-[13.5px] text-abc-secondary">
          {filter === 'saved'
            ? 'You have not saved anybody yet. Save the companies worth your time and they will appear here and in your plan.'
            : `No ${FILTER_LABEL[filter].toLowerCase()} came out of what you told ABC.`}
        </p>
      ) : (
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
                    {row.weak ? (
                      <span className="text-[11px] text-abc-muted">· thin match</span>
                    ) : null}
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
                    aria-label={row.saved ? `Remove ${row.companyName} from your plan` : `Save ${row.companyName} to your plan`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-btn border border-abc-border transition-colors duration-200 ease-abc hover:border-abc-border-strong disabled:opacity-45 abc-focus-ring"
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
                    className="inline-flex h-8 w-11 items-center justify-center text-abc-muted transition-colors hover:text-abc-text abc-focus-ring"
                  >
                    <IconChevronRight size={18} stroke={1.8} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
