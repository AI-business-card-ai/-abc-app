'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconArrowLeft, IconArrowRight, IconMapPin, IconPlus, IconX } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import { SectionLabel } from '@/components/ui/abc/Bits'
import RelevanceFeedback from '@/components/event-intelligence/RelevanceFeedback'
import {
  JUDGMENT_LABEL,
  MISSED_REASONS,
  MISSED_REASON_LABEL,
  NOT_RELEVANT_REASON_LABEL,
  benchmarkHeadline,
  nextUnreviewed,
  type Benchmark,
  type MatchFeedback,
  type MissedOpportunity,
  type MissedReason,
} from '@/lib/event-intelligence/benchmark'
import { MATCH_TYPE_LABEL } from '@/lib/event-intelligence/view'
import type { IntelEvent, MatchType } from '@/lib/event-intelligence/types'

/**
 * The benchmark, and the review that fills it.
 *
 * Three things, in the order they are useful: what the numbers say, the next
 * suggestion to judge, and the companies ABC should have found and did not.
 *
 * The screen states what it is measuring and refuses to dress it up. There is
 * no accuracy, no precision, no confidence interval and no progress bar towards
 * a score — those words would describe a measurement of a population, and this
 * is a handful of opinions about one fair. Where a number would be misleading
 * the screen prints the counts instead and lets the owner read them.
 */

type QueueItem = {
  matchId: string
  name: string
  matchType: MatchType
  score: number
  headline: string | null
  location: string
  categories: string[]
}

type Props = {
  event: IntelEvent
  /** False when there is no mission yet: nothing has been recommended to judge. */
  ready: boolean
  benchmark: Benchmark
  queue: QueueItem[]
  feedback: MatchFeedback[]
  missed: (MissedOpportunity & { name: string })[]
  search: { term: string; results: { presenceId: string; name: string; location: string }[] }
}

export default function BenchmarkView({ event, ready, benchmark, queue, feedback, missed, search }: Props) {
  const router = useRouter()
  const [reviewed, setReviewed] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flagging, setFlagging] = useState<string | null>(null)

  /*
    Judgments already stored, plus the ones made since this page loaded. The
    queue advances without a round trip so review stays quick; the numbers above
    it are server-rendered and catch up on refresh, which is the honest split —
    a count that moved before the write landed would be a lie about the store.
  */
  const judged = useMemo(
    () => [...feedback.map((entry) => ({ matchId: entry.matchId })), ...reviewed.map((matchId) => ({ matchId }))],
    [feedback, reviewed]
  )
  const [skipped, setSkipped] = useState<string[]>([])
  /*
    A refusal holds its place in the queue. "Great" and "relevant" are the whole
    answer, so the card moves on; "not relevant" has an optional reason attached
    to it, and advancing before the owner can tap one would mean asking a
    question and walking away mid-sentence. They move on when they are done.
  */
  const [awaitingReason, setAwaitingReason] = useState<string | null>(null)
  const current = useMemo(
    () => nextUnreviewed(queue.filter((item) => !skipped.includes(item.matchId)), judged),
    [queue, judged, skipped]
  )
  const judgedIds = useMemo(() => new Set(judged.map((entry) => entry.matchId)), [judged])
  const remaining = queue.filter((item) => !judgedIds.has(item.matchId) && !skipped.includes(item.matchId)).length

  const feedbackFor = (matchId: string) => feedback.find((entry) => entry.matchId === matchId) ?? null

  async function flag(presenceId: string, reason: MissedReason | null) {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/event-intelligence/missed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventKey: event.eventKey, presenceId, reason }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        setError(body?.error || 'That could not be recorded.')
        return
      }
      setFlagging(null)
      router.refresh()
    } catch {
      setError('ABC could not be reached. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function unflag(presenceId: string) {
    setBusy(true)
    try {
      await fetch(
        `/api/event-intelligence/missed?eventKey=${encodeURIComponent(event.eventKey)}&presenceId=${encodeURIComponent(presenceId)}`,
        { method: 'DELETE' }
      )
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const card = 'abc-surface p-4 sm:p-5'

  return (
    <div className="mx-auto w-full max-w-[860px] abc-page-top px-4 pb-16 sm:px-6 lg:px-8">
      <Link
        href={`/events/intelligence/${event.eventKey}`}
        className="-my-3 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
      >
        <IconArrowLeft size={16} stroke={1.8} aria-hidden="true" />
        {event.name}
      </Link>

      <header className="mt-4">
        <SectionLabel>Checking ABC’s work</SectionLabel>
        <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight text-abc-text lg:text-[32px]">
          Is ABC suggesting the right companies?
        </h1>
        <p className="mt-2 max-w-[62ch] text-[13.5px] leading-[1.6] text-abc-secondary">
          Your own judgment of what ABC suggested, counted. Only you can see it, it changes nothing
          about any company, and ABC does not learn from it — this version records what you thought so
          the question can be answered with numbers instead of impressions.
        </p>
      </header>

      {!ready ? (
        <section className={`${card} mt-6`}>
          <p className="text-[14px] leading-[1.6] text-abc-text">
            Nothing to check yet. Tell ABC what you want from this fair and run the matching first.
          </p>
          <Button href={`/events/intelligence/${event.eventKey}/setup`} className="mt-3">
            Set your goals
          </Button>
        </section>
      ) : (
        <>
          {/* ── What the numbers say ── */}
          <section className={`${card} mt-6`}>
            <SectionLabel>Summary</SectionLabel>
            <p className="mt-2 text-[16px] font-semibold text-abc-text">{benchmarkHeadline(benchmark)}</p>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              {[
                ['Reviewed', `${benchmark.overall.reviewed} of ${benchmark.recommendations}`],
                ['Great targets', String(benchmark.overall.great)],
                ['Relevant', String(benchmark.overall.relevant)],
                ['Not relevant', String(benchmark.overall.notRelevant)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-abc-muted">{label}</dt>
                  <dd className="mt-0.5 text-[18px] font-semibold text-abc-text">{value}</dd>
                </div>
              ))}
            </dl>

            {benchmark.overall.reviewed > 0 ? (
              <>
                <p className="mt-4 text-[13px] leading-[1.6] text-abc-secondary">
                  {benchmark.overall.positiveRate}% of what you reviewed was useful
                  {benchmark.coverage !== null ? `, from ${benchmark.coverage}% of the list` : ''}. That is a
                  count of your own answers, not a measure of how ABC would do on a fair you have not reviewed.
                </p>

                {/* Top-K: the question that actually matters */}
                <div className="mt-4">
                  <p className="text-[13px] font-semibold text-abc-text">Are the best suggestions good?</p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {benchmark.topK.map((block) => (
                      <li key={block.k} className="text-[13px] leading-[1.6] text-abc-secondary">
                        <span className="font-medium text-abc-text">Top {block.k}</span>
                        {!block.complete ? (
                          <> — only {block.ranked} suggestions exist</>
                        ) : block.reviewed === 0 ? (
                          <> — none reviewed yet</>
                        ) : (
                          <>
                            {' '}
                            — {block.positive} of {block.reviewed} reviewed were useful
                            {block.great > 0 ? ` (${block.great} great)` : ''}
                            {block.reviewed < block.ranked ? `, ${block.ranked - block.reviewed} still unreviewed` : ''}
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Direction: customer / supplier / partner read correctly? */}
                <div className="mt-4">
                  <p className="text-[13px] font-semibold text-abc-text">By direction</p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {(['customer', 'supplier', 'partner'] as MatchType[]).map((type) => {
                      const counts = benchmark.byType[type]
                      return (
                        <li key={type} className="text-[13px] leading-[1.6] text-abc-secondary">
                          <span className="font-medium text-abc-text">{MATCH_TYPE_LABEL[type]}</span>
                          {counts.reviewed === 0 ? (
                            <> — none reviewed</>
                          ) : (
                            <>
                              {' '}
                              — {counts.positive} of {counts.reviewed} useful
                            </>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>

                {benchmark.reasons.length > 0 ? (
                  <div className="mt-4">
                    <p className="text-[13px] font-semibold text-abc-text">Why you turned suggestions down</p>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {benchmark.reasons.map((entry) => (
                        <li key={entry.reason} className="text-[13px] text-abc-secondary">
                          {NOT_RELEVANT_REASON_LABEL[entry.reason]} — {entry.count}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {benchmark.mixedVersions ? (
                  <p className="mt-4 text-[12px] leading-[1.6] text-abc-muted">
                    These answers span more than one version of matching (
                    {benchmark.engineVersions.join(', ')}), so they are not one measurement. Review again
                    after a change if you want a before and after.
                  </p>
                ) : benchmark.engineVersions.length === 1 ? (
                  <p className="mt-4 text-[12px] leading-[1.6] text-abc-muted">
                    All of it judged against {benchmark.engineVersions[0]}, on {event.name}.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-4 text-[13px] leading-[1.6] text-abc-secondary">
                Review a few suggestions below and the numbers appear here. Nothing you skip counts against
                ABC — unreviewed is unreviewed, not wrong.
              </p>
            )}
          </section>

          {/* ── One at a time ── */}
          <section className={`${card} mt-4`}>
            <SectionLabel>Review</SectionLabel>
            {current ? (
              <>
                <p className="mt-1.5 text-[12px] text-abc-muted">
                  {remaining} of {queue.length} still to look at, strongest first.
                </p>

                <h2 className="mt-3 text-[18px] font-semibold leading-tight text-abc-text">{current.name}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-abc-secondary">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em]">
                    {MATCH_TYPE_LABEL[current.matchType]}
                  </span>
                  <span>ABC Match {current.score}</span>
                  {current.location ? (
                    <span className="inline-flex items-center gap-1">
                      <IconMapPin size={13} stroke={1.7} aria-hidden="true" />
                      {current.location}
                    </span>
                  ) : null}
                </p>

                {current.headline ? (
                  <p className="mt-2 text-[14px] leading-[1.55] text-abc-text">{current.headline}</p>
                ) : null}

                {current.categories.length > 0 ? (
                  <p className="mt-1.5 text-[12px] text-abc-muted">
                    Listed under {current.categories.join(', ')}.
                  </p>
                ) : null}

                <div className="mt-4">
                  <RelevanceFeedback
                    key={current.matchId}
                    matchId={current.matchId}
                    feedback={feedbackFor(current.matchId)}
                    prompt="Would this have been worth your time?"
                    onRecorded={(judgment) => {
                      if (judgment === 'not_relevant') setAwaitingReason(current.matchId)
                      else setReviewed((list) => [...list, current.matchId])
                    }}
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      setSkipped((list) => [...list, current.matchId])
                      setAwaitingReason(null)
                    }}
                    variant="surface"
                  >
                    {awaitingReason === current.matchId ? 'Next company' : 'Skip'}
                    <IconArrowRight size={16} stroke={1.8} aria-hidden="true" />
                  </Button>
                  <Button href={`/events/intelligence/${event.eventKey}/m/${current.matchId}`} variant="ghost">
                    See the full reasoning
                  </Button>
                </div>
              </>
            ) : (
              <p className="mt-2 text-[14px] leading-[1.6] text-abc-text">
                {queue.length === 0
                  ? 'ABC has not suggested anything for this fair yet.'
                  : 'Nothing left in the queue. Reload to go through what you skipped.'}
              </p>
            )}
          </section>

          {/* ── The half that grading cannot reach ── */}
          <section className={`${card} mt-4`}>
            <SectionLabel>Companies ABC missed</SectionLabel>
            <p className="mt-1.5 max-w-[62ch] text-[12.5px] leading-[1.55] text-abc-muted">
              A benchmark that only grades what ABC showed you cannot see what it failed to show. If a
              company at this fair should have been near the top, say so here.
            </p>

            <form method="get" className="mt-3 flex flex-wrap items-end gap-2">
              <label className="min-w-[200px] flex-1">
                <span className="block text-[13px] font-semibold text-abc-text">Find a company</span>
                <input
                  type="search"
                  name="q"
                  defaultValue={search.term}
                  placeholder="Part of their name"
                  className="abc-input mt-2 min-h-[44px] w-full px-3 py-2.5 text-[14px]"
                />
              </label>
              <Button type="submit" variant="surface">
                Search
              </Button>
            </form>

            {search.term.length >= 2 ? (
              search.results.length === 0 ? (
                <p className="mt-3 text-[13px] text-abc-secondary">
                  No exhibitor at {event.name} matches “{search.term}”.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {search.results.map((row) => {
                    const already = missed.some((entry) => entry.presenceId === row.presenceId)
                    return (
                      <li key={row.presenceId} className="rounded-btn border border-abc-border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block truncate text-[14px] font-medium text-abc-text">{row.name}</span>
                            <span className="block text-[12px] text-abc-muted">{row.location}</span>
                          </span>
                          {already ? (
                            <span className="text-[12.5px] text-abc-secondary">Already flagged</span>
                          ) : (
                            <Button
                              onClick={() => setFlagging(flagging === row.presenceId ? null : row.presenceId)}
                              variant="surface"
                            >
                              <IconPlus size={16} stroke={1.8} aria-hidden="true" />
                              ABC missed this
                            </Button>
                          )}
                        </div>

                        {flagging === row.presenceId ? (
                          <div className="mt-3">
                            <p className="text-[12px] text-abc-muted" id={`missed-${row.presenceId}`}>
                              Why does this one matter? Optional.
                            </p>
                            <div
                              className="mt-2 flex flex-wrap gap-2"
                              role="group"
                              aria-labelledby={`missed-${row.presenceId}`}
                            >
                              {MISSED_REASONS.map((reason) => (
                                <button
                                  key={reason}
                                  type="button"
                                  disabled={busy}
                                  onClick={() => flag(row.presenceId, reason)}
                                  className="touch-target inline-flex min-h-[44px] items-center rounded-btn border border-abc-border px-3 text-[12.5px] text-abc-secondary transition-colors duration-200 ease-abc hover:border-abc-border-strong hover:text-abc-text disabled:opacity-45 abc-focus-ring"
                                >
                                  {MISSED_REASON_LABEL[reason]}
                                </button>
                              ))}
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => flag(row.presenceId, null)}
                                className="touch-target inline-flex min-h-[44px] items-center rounded-btn border border-abc-border px-3 text-[12.5px] text-abc-secondary transition-colors duration-200 ease-abc hover:border-abc-border-strong hover:text-abc-text disabled:opacity-45 abc-focus-ring"
                              >
                                Just flag it
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )
            ) : null}

            {missed.length > 0 ? (
              <div className="mt-4">
                <p className="text-[13px] font-semibold text-abc-text">
                  Flagged as missed ({missed.length})
                </p>
                <ul className="mt-2 flex flex-col gap-2">
                  {missed.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-btn border border-abc-border px-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] text-abc-text">{entry.name}</span>
                        {entry.reason ? (
                          <span className="block text-[12px] text-abc-muted">
                            {MISSED_REASON_LABEL[entry.reason]}
                          </span>
                        ) : null}
                      </span>
                      <Button onClick={() => unflag(entry.presenceId)} disabled={busy} variant="ghost">
                        <IconX size={16} stroke={1.8} aria-hidden="true" />
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {feedback.length > 0 ? (
            <section className={`${card} mt-4`}>
              <SectionLabel>What you have said so far</SectionLabel>
              <ul className="mt-3 flex flex-col gap-1.5">
                {feedback.map((entry) => {
                  const item = queue.find((row) => row.matchId === entry.matchId)
                  return (
                    <li key={entry.id}>
                      {/* A whole row is the target, so the link is reachable with a thumb. */}
                      <Link
                        href={`/events/intelligence/${event.eventKey}/m/${entry.matchId}`}
                        className="flex min-h-[44px] flex-col justify-center rounded-btn px-2 py-1.5 transition-colors duration-200 ease-abc hover:bg-abc-raised abc-focus-ring"
                      >
                        <span className="text-[13.5px] font-medium text-abc-text">
                          {item?.name ?? 'A suggestion'} — {JUDGMENT_LABEL[entry.judgment]}
                          {entry.reason ? ` · ${NOT_RELEVANT_REASON_LABEL[entry.reason]}` : ''}
                        </span>
                        <span className="text-[12px] text-abc-muted">
                          ABC Match {entry.matchScore} · {entry.engineVersion}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}
        </>
      )}

      {error ? (
        <p className="mt-4 text-[13px] leading-[1.55]" style={{ color: 'var(--abc-overdue)' }} role="alert">
          {error}
        </p>
      ) : null}

      <p className="mt-8 max-w-[62ch] text-[12px] leading-[1.6] text-abc-muted">
        Judging a suggestion is not meeting anybody. A company becomes a meeting in ABC only when you
        record one — by scanning their card, exchanging ABC, or saving the contact.
      </p>
    </div>
  )
}
