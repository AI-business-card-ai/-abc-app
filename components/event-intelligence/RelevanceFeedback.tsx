'use client'

import { useState } from 'react'
import { IconCheck } from '@tabler/icons-react'
import {
  JUDGMENTS,
  JUDGMENT_LABEL,
  NOT_RELEVANT_REASONS,
  NOT_RELEVANT_REASON_HINT,
  NOT_RELEVANT_REASON_LABEL,
  type Judgment,
  type MatchFeedback,
  type NotRelevantReason,
} from '@/lib/event-intelligence/benchmark'

/**
 * Was this useful?
 *
 * Three taps and an optional reason, and it is secondary on every screen it
 * appears on. The owner came to walk a fair, not to label a dataset, so the
 * control never competes with the action the screen exists for: no card, no
 * colour, no prompt before they have seen what they are judging.
 *
 * The reason row appears only after "Not relevant" and is genuinely optional —
 * the judgment is already recorded by the time it shows. Asking first would
 * turn one tap into a form, and a form is how feedback stops being given.
 *
 * Nothing here learns. The answer is recorded beside the recommendation and
 * read by a report; it does not retrain matching, and the copy does not suggest
 * it will.
 */

type Props = {
  matchId: string
  feedback: MatchFeedback | null
  /** Called after a judgment is recorded, so a review flow can move on. */
  onRecorded?: (judgment: Judgment) => void
  /** Wording above the buttons, or null where the surrounding screen says it. */
  prompt?: string | null
}

export default function RelevanceFeedback({ matchId, feedback, onRecorded, prompt = 'Was this useful?' }: Props) {
  const [judgment, setJudgment] = useState<Judgment | null>(feedback?.judgment ?? null)
  const [reason, setReason] = useState<NotRelevantReason | null>(feedback?.reason ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(next: Judgment, nextReason: NotRelevantReason | null) {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/event-intelligence/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, judgment: next, reason: nextReason }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        setError(body?.error || 'That could not be recorded.')
        return false
      }
      return true
    } catch {
      setError('ABC could not be reached. Check your connection and try again.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function judge(next: Judgment) {
    const previous = judgment
    const previousReason = reason
    // The reason belongs to the refusal it explained; a new answer drops it.
    setJudgment(next)
    setReason(null)
    if (await send(next, null)) {
      onRecorded?.(next)
    } else {
      setJudgment(previous)
      setReason(previousReason)
    }
  }

  async function explain(next: NotRelevantReason) {
    const previous = reason
    const chosen = previous === next ? null : next
    setReason(chosen)
    if (!(await send('not_relevant', chosen))) setReason(previous)
  }

  return (
    <div>
      {prompt ? (
        <p className="text-[12.5px] text-abc-secondary" id={`feedback-${matchId}`}>
          {prompt}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby={prompt ? `feedback-${matchId}` : undefined}>
        {JUDGMENTS.map((option) => {
          const on = judgment === option
          return (
            <button
              key={option}
              type="button"
              onClick={() => judge(option)}
              disabled={busy}
              aria-pressed={on}
              className={`touch-target inline-flex min-h-[44px] items-center gap-1.5 rounded-btn border px-3 text-[13px] font-medium transition-colors duration-200 ease-abc disabled:opacity-45 abc-focus-ring ${
                on
                  ? 'border-abc-border-strong bg-abc-raised text-abc-text'
                  : 'border-abc-border text-abc-secondary hover:border-abc-border-strong hover:text-abc-text'
              }`}
            >
              {/* The tick carries the same meaning as the border, for anyone who cannot see it. */}
              {on ? <IconCheck size={15} stroke={2} style={{ color: 'var(--abc-gold)' }} aria-hidden="true" /> : null}
              {JUDGMENT_LABEL[option]}
            </button>
          )
        })}
      </div>

      {judgment === 'not_relevant' ? (
        <div className="mt-3">
          <p className="text-[12px] text-abc-muted" id={`reason-${matchId}`}>
            What was wrong? Optional — it is already recorded.
          </p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby={`reason-${matchId}`}>
            {NOT_RELEVANT_REASONS.map((option) => {
              const on = reason === option
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => explain(option)}
                  disabled={busy}
                  aria-pressed={on}
                  title={NOT_RELEVANT_REASON_HINT[option] || undefined}
                  className={`touch-target inline-flex min-h-[44px] items-center rounded-btn border px-3 text-[12.5px] transition-colors duration-200 ease-abc disabled:opacity-45 abc-focus-ring ${
                    on
                      ? 'border-abc-border-strong bg-abc-raised text-abc-text'
                      : 'border-abc-border text-abc-secondary hover:border-abc-border-strong hover:text-abc-text'
                  }`}
                >
                  {NOT_RELEVANT_REASON_LABEL[option]}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {judgment ? (
        <p className="mt-2 text-[12px] text-abc-muted" role="status">
          Recorded: {JUDGMENT_LABEL[judgment]}
          {reason ? ` · ${NOT_RELEVANT_REASON_LABEL[reason]}` : ''}. Only you can see this, and it changes
          nothing about the company.
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 text-[12.5px]" style={{ color: 'var(--abc-overdue)' }} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
