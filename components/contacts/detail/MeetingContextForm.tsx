'use client'

import { useState } from 'react'
import Button from '@/components/ui/abc/Button'
import { ErrorNote, FIELD_LABEL_CLASS, INPUT_CLASS } from '@/components/contacts/detail/parts'

/**
 * The meeting form — the only one.
 *
 * Editing the latest meeting and adding a new one ask the identical four
 * questions, so they share a component rather than a resemblance. The single
 * difference is `encounterId`: with it the owner is correcting what was said,
 * without it they met the person again.
 */

const FOLLOW_UP_PRESETS: { label: string; days: number }[] = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
]

export type MeetingValues = {
  event: string
  discussed: string
  nextStep: string
  followUpAt: string | null
}

function isoInDays(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(9, 0, 0, 0)
  return date.toISOString()
}

function toDateInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export default function MeetingContextForm({
  contactId,
  encounterId,
  initial,
  submitLabel,
  onSaved,
  onCancel,
}: {
  contactId: string
  /** Present to revise that meeting; absent to record a new one. */
  encounterId?: string
  initial?: Partial<MeetingValues>
  submitLabel: string
  onSaved: (values: MeetingValues) => void
  onCancel: () => void
}) {
  const [event, setEvent] = useState(initial?.event ?? '')
  const [discussed, setDiscussed] = useState(initial?.discussed ?? '')
  const [nextStep, setNextStep] = useState(initial?.nextStep ?? '')
  const [followUpAt, setFollowUpAt] = useState<string | null>(initial?.followUpAt ?? null)
  const [customDate, setCustomDate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/card/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId,
          encounterId,
          whereMet: event,
          topic: discussed,
          nextAction: nextStep,
          followUpAt,
          recalculateScore: false,
          generateMessages: false,
        }),
      })
      if (!res.ok) throw new Error('save failed')

      onSaved({
        event: event.trim(),
        discussed: discussed.trim(),
        nextStep: nextStep.trim(),
        followUpAt,
      })
    } catch {
      setError('Could not save the meeting. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3.5">
      <label className="block">
        <span className={FIELD_LABEL_CLASS}>Where did you meet?</span>
        <input
          value={event}
          onChange={(e) => setEvent(e.target.value)}
          placeholder="Event, city or occasion"
          className={`h-11 ${INPUT_CLASS}`}
        />
      </label>

      <label className="block">
        <span className={FIELD_LABEL_CLASS}>What did you discuss?</span>
        <textarea
          value={discussed}
          onChange={(e) => setDiscussed(e.target.value)}
          rows={3}
          placeholder="What they need, what you promised"
          className={`resize-y py-2.5 leading-[1.5] ${INPUT_CLASS}`}
        />
      </label>

      <label className="block">
        <span className={FIELD_LABEL_CLASS}>What is the next step?</span>
        <input
          value={nextStep}
          onChange={(e) => setNextStep(e.target.value)}
          placeholder="Send proposal, share deck…"
          className={`h-11 ${INPUT_CLASS}`}
        />
      </label>

      <div>
        <span className={FIELD_LABEL_CLASS}>When should you follow up?</span>
        <div className="flex flex-wrap gap-2">
          {FOLLOW_UP_PRESETS.map((preset) => {
            const value = isoInDays(preset.days)
            const active = !customDate && followUpAt === value
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setCustomDate(false)
                  setFollowUpAt(followUpAt === value ? null : value)
                }}
                aria-pressed={active}
                className={`rounded-full border px-3.5 py-2 text-[12.5px] font-medium transition-colors duration-200 ease-abc abc-focus-ring ${
                  active
                    ? 'border-transparent text-[#1a1205]'
                    : 'border-abc-border bg-abc-raised text-abc-secondary hover:border-abc-border-strong hover:text-abc-text'
                }`}
                style={active ? { background: 'var(--abc-gold)' } : undefined}
              >
                {preset.label}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setCustomDate((v) => !v)}
            aria-pressed={customDate}
            className={`rounded-full border px-3.5 py-2 text-[12.5px] font-medium transition-colors duration-200 ease-abc abc-focus-ring ${
              customDate
                ? 'border-transparent text-[#1a1205]'
                : 'border-abc-border bg-abc-raised text-abc-secondary hover:border-abc-border-strong hover:text-abc-text'
            }`}
            style={customDate ? { background: 'var(--abc-gold)' } : undefined}
          >
            Custom
          </button>
        </div>

        {customDate ? (
          <input
            type="date"
            value={toDateInput(followUpAt)}
            onChange={(e) => {
              const value = e.target.value
              setFollowUpAt(value ? new Date(`${value}T09:00:00`).toISOString() : null)
            }}
            className={`mt-2.5 h-11 sm:w-auto ${INPUT_CLASS}`}
          />
        ) : null}
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button onClick={() => void save()} disabled={saving} fullWidth className="sm:w-auto">
          {saving ? 'Saving…' : submitLabel}
        </Button>
        <Button onClick={onCancel} variant="surface" disabled={saving} fullWidth className="sm:w-auto">
          Cancel
        </Button>
      </div>
    </div>
  )
}
