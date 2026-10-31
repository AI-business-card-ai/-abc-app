'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconArchive, IconChevronDown, IconHistory, IconLayoutKanban, IconUsers } from '@tabler/icons-react'
import OpportunityCard from '@/components/opportunities/OpportunityCard'
import { InlineError, Notice, PILL_CLASS, pillState } from '@/components/opportunities/parts'
import Button from '@/components/ui/abc/Button'
import { EmptyState } from '@/components/ui/abc/Bits'
import {
  BOARD_STAGES,
  STAGE_LABEL,
  STAGE_TONE,
  formatMoney,
  isOpenStage,
  openValueByCurrency,
  type BoardEntry,
  type OpportunityStage,
} from '@/lib/opportunities/model'

/**
 * The Pipeline tab.
 *
 * Four columns on a wide screen. On a phone, four columns would be four
 * slivers, so the stages become a selector and the chosen stage's deals stack
 * full width. LOST is not a column: closed deals sit behind one quiet toggle
 * under the board, where they can be reopened.
 */
export default function PipelineBoard({
  initialEntries,
  failed,
  hasPeople,
  legacy,
}: {
  initialEntries: BoardEntry[]
  failed: boolean
  hasPeople: boolean
  /** People the previous board marked deliberately, offered for import — never imported on their own. */
  legacy: { count: number; names: string[] }
}) {
  const router = useRouter()
  const [entries, setEntries] = useState(initialEntries)
  const [moving, setMoving] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showLost, setShowLost] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importDismissed, setImportDismissed] = useState(false)

  // A refresh (after an import) hands down new rows; the board follows them.
  useEffect(() => setEntries(initialEntries), [initialEntries])

  const byStage = useMemo(() => {
    const map: Record<OpportunityStage, BoardEntry[]> = { new: [], in_progress: [], proposal: [], won: [], lost: [] }
    for (const entry of entries) map[entry.opportunity.stage].push(entry)
    return map
  }, [entries])

  const firstBusy = BOARD_STAGES.find((s) => byStage[s].length > 0) ?? 'new'
  const [active, setActive] = useState<OpportunityStage>(firstBusy)

  const open = entries.filter((e) => isOpenStage(e.opportunity.stage))
  const values = openValueByCurrency(entries.map((e) => e.opportunity))
  const withoutStep = open.filter((e) => !e.opportunity.nextAction && !e.person.followUp).length

  const flash = useCallback((message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 2600)
  }, [])

  const move = useCallback(
    async (id: string, stage: OpportunityStage) => {
      const before = entries
      const entry = entries.find((e) => e.opportunity.id === id)
      if (!entry || entry.opportunity.stage === stage) return

      setError(null)
      setMoving(id)
      setEntries((prev) =>
        prev.map((e) => (e.opportunity.id === id ? { ...e, opportunity: { ...e.opportunity, stage } } : e))
      )

      try {
        const res = await fetch(`/api/crm/opportunities/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage }),
        })
        if (!res.ok) throw new Error('failed')
        flash(`${entry.person.name} moved to ${STAGE_LABEL[stage]}`)
      } catch {
        setEntries(before)
        setError('Could not move that opportunity. Try again.')
      } finally {
        setMoving(null)
      }
    },
    [entries, flash]
  )

  async function bringOver() {
    setImporting(true)
    setError(null)
    try {
      const res = await fetch('/api/crm/opportunities/import', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error('failed')
      flash(data.imported === 1 ? '1 deal brought over' : `${data.imported ?? 0} deals brought over`)
      setImportDismissed(true)
      router.refresh()
    } catch {
      setError('Could not bring those deals over. Try again.')
    } finally {
      setImporting(false)
    }
  }

  if (failed) {
    return (
      <div className="abc-surface">
        <EmptyState
          icon={IconLayoutKanban}
          title="We couldn't load your pipeline."
          description="Something went wrong on our side. Your contacts and meetings are safe."
          action={<Button onClick={() => router.refresh()}>Try again</Button>}
        />
      </div>
    )
  }

  const lost = byStage.lost

  return (
    <div>
      {/* What is in play, from the deals themselves */}
      {entries.length > 0 ? (
        <p className="text-[13px] text-abc-secondary" aria-live="polite">
          <span className="font-semibold text-abc-text">{open.length}</span> open
          {values.length > 0 ? (
            <>
              {' · '}
              <span className="font-semibold tabular-nums" style={{ color: 'var(--abc-gold-accent)' }}>
                {values.map((v) => formatMoney(v.total, v.currency)).join(' + ')}
              </span>{' '}
              in play
            </>
          ) : null}
          {withoutStep > 0 ? ` · ${withoutStep} without a next step` : null}
        </p>
      ) : null}

      {error ? <div className="mt-3"><InlineError>{error}</InlineError></div> : null}

      {legacy.count > 0 && !importDismissed ? (
        <section className="abc-surface mt-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
          <IconHistory size={22} stroke={1.6} className="shrink-0" style={{ color: 'var(--abc-gold-accent)' }} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-abc-text">
              {legacy.count === 1 ? '1 deal' : `${legacy.count} deals`} on your previous pipeline board
            </p>
            <p className="mt-0.5 text-[13px] leading-[1.5] text-abc-secondary">
              {legacy.names.join(', ')}
              {legacy.count > legacy.names.length ? ` and ${legacy.count - legacy.names.length} more` : ''}. Bring them over
              as opportunities? Nothing else changes.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" onClick={() => setImportDismissed(true)} disabled={importing}>
              Not now
            </Button>
            <Button onClick={() => void bringOver()} disabled={importing}>
              {importing ? 'Bringing over…' : 'Bring them over'}
            </Button>
          </div>
        </section>
      ) : null}

      {entries.length === 0 ? (
        <div className="abc-surface mt-4">
          <EmptyState
            icon={IconLayoutKanban}
            title="No opportunities yet."
            description={
              hasPeople
                ? 'Open someone you met and tap Create opportunity. Only the people you choose become deals.'
                : 'Scan a card first. Opportunities start from the people you meet.'
            }
            action={
              hasPeople ? (
                <Button href="/crm/people" variant="surface">
                  <IconUsers size={17} stroke={1.8} />
                  Choose from your people
                </Button>
              ) : (
                <Button href="/scan">Scan a card</Button>
              )
            }
          />
        </div>
      ) : (
        <>
          {/* Phone and tablet: a stage selector, then that stage's deals */}
          <div className="mt-4 lg:hidden">
            <div className="abc-scroll-x -mx-1 px-1">
              <div className="flex gap-2" role="tablist" aria-label="Pipeline stages">
                {BOARD_STAGES.map((stage) => {
                  const selected = active === stage
                  const pill = pillState(selected)
                  return (
                    <button
                      key={stage}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setActive(stage)}
                      className={`${PILL_CLASS} ${pill.className} inline-flex items-center gap-1.5`}
                      style={pill.style}
                    >
                      {STAGE_LABEL[stage]}
                      <span className={`tabular-nums ${selected ? 'opacity-70' : 'text-abc-muted'}`}>{byStage[stage].length}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2" role="tabpanel" aria-label={STAGE_LABEL[active]}>
              {byStage[active].length === 0 ? (
                <p className="md:col-span-2 rounded-inner border border-dashed border-abc-border px-4 py-8 text-center text-[13px] text-abc-muted">
                  Nothing in {STAGE_LABEL[active]}.
                </p>
              ) : (
                byStage[active].map((entry) => (
                  <OpportunityCard key={entry.opportunity.id} entry={entry} onMove={move} moving={moving === entry.opportunity.id} />
                ))
              )}
            </div>
          </div>

          {/* Desktop: the four columns */}
          <div className="mt-5 hidden grid-cols-4 gap-4 lg:grid">
            {BOARD_STAGES.map((stage) => {
              const items = byStage[stage]
              const tone = STAGE_TONE[stage]
              return (
                <section key={stage} aria-label={STAGE_LABEL[stage]} className="flex min-w-0 flex-col">
                  <header className="mb-2.5 flex items-center gap-2 px-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: tone.dot }} aria-hidden="true" />
                    <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-abc-secondary">
                      {STAGE_LABEL[stage]}
                    </h2>
                    <span className="ml-auto rounded-full bg-abc-raised px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-abc-secondary">
                      {items.length}
                    </span>
                  </header>
                  <div
                    className="flex min-h-[140px] flex-1 flex-col gap-3 rounded-card border border-abc-border p-2.5"
                    style={{ background: 'rgba(244, 236, 222, 0.55)' }}
                  >
                    {items.length === 0 ? (
                      <p className="px-2 py-8 text-center text-[12.5px] text-abc-muted">No deals</p>
                    ) : (
                      items.map((entry) => (
                        <OpportunityCard key={entry.opportunity.id} entry={entry} onMove={move} moving={moving === entry.opportunity.id} />
                      ))
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        </>
      )}

      {lost.length > 0 ? (
        <section className="mt-6">
          <button
            type="button"
            onClick={() => setShowLost((v) => !v)}
            aria-expanded={showLost}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-inner px-1 text-[13px] font-medium text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
          >
            <IconArchive size={16} stroke={1.8} aria-hidden="true" />
            Lost · {lost.length}
            <IconChevronDown size={15} stroke={2} className={`transition-transform ${showLost ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {showLost ? (
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {lost.map((entry) => (
                <OpportunityCard key={entry.opportunity.id} entry={entry} onMove={move} moving={moving === entry.opportunity.id} />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {notice ? <Notice>{notice}</Notice> : null}
    </div>
  )
}
