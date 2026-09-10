'use client'

import { SectionLabel } from '@/components/ui/abc/Bits'
import type { BatchSharedContext } from '@/lib/scan/batch'

/**
 * The meeting, typed once for everyone in the batch.
 *
 * Deliberately the same four questions the single-scan review asks, in the same
 * order and the same words, plus a location — because at a fair the hall is a
 * different fact from the event, and both are worth having. Anything else here
 * would be a second vocabulary for meetings that the contact screen, follow-ups
 * and CRM export would each have to learn.
 */

const INPUT =
  'h-11 w-full rounded-inner border border-abc-border bg-abc-raised px-3 text-[16px] text-abc-text outline-none sm:text-[15px] transition-colors duration-200 ease-abc placeholder:text-abc-muted focus:border-abc-gold-accent'

const FOLLOW_UP_PRESETS: { label: string; days: number }[] = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
]

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

export default function BatchSharedContextForm({
  value,
  onChange,
  count,
  disabled = false,
}: {
  value: BatchSharedContext
  onChange: (next: BatchSharedContext) => void
  /** How many cards this will be applied to — the reason the form is worth filling in. */
  count: number
  disabled?: boolean
}) {
  const set = <K extends keyof BatchSharedContext>(key: K, next: BatchSharedContext[K]) =>
    onChange({ ...value, [key]: next })

  const activePreset = FOLLOW_UP_PRESETS.find(
    (preset) => value.followUpAt && toDateInput(value.followUpAt) === toDateInput(isoInDays(preset.days))
  )

  return (
    <section className="abc-surface p-4 sm:p-5">
      <SectionLabel>Shared meeting context</SectionLabel>
      <p className="mt-1.5 text-[13px] leading-[1.55] text-abc-secondary">
        {count === 1
          ? 'Applied to the card you keep.'
          : `Applied to all ${count} contacts you keep. You can add details to any one of them afterwards.`}
      </p>

      <div className="mt-4 flex flex-col gap-3.5">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-abc-muted">Event</span>
            <input
              value={value.event}
              onChange={(e) => set('event', e.target.value)}
              disabled={disabled}
              placeholder="Trade fair, conference, meeting"
              className={INPUT}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] text-abc-muted">Where</span>
            <input
              value={value.location}
              onChange={(e) => set('location', e.target.value)}
              disabled={disabled}
              placeholder="Venue, hall or city"
              className={INPUT}
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-[12px] text-abc-muted">What did you discuss?</span>
          <textarea
            value={value.discussed}
            onChange={(e) => set('discussed', e.target.value)}
            disabled={disabled}
            rows={3}
            placeholder="What the stand was about, what you promised"
            className="w-full resize-y rounded-inner border border-abc-border bg-abc-raised px-3 py-2.5 text-[16px] leading-[1.5] text-abc-text outline-none sm:text-[15px] transition-colors duration-200 ease-abc placeholder:text-abc-muted focus:border-abc-gold-accent"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[12px] text-abc-muted">What is the next step?</span>
          <input
            value={value.nextAction}
            onChange={(e) => set('nextAction', e.target.value)}
            disabled={disabled}
            placeholder="Send pricing, share the deck…"
            className={INPUT}
          />
        </label>

        <div>
          <span className="mb-2 block text-[12px] text-abc-muted">When should you follow up?</span>
          <div className="flex flex-wrap gap-2">
            {FOLLOW_UP_PRESETS.map((preset) => {
              const active = activePreset?.label === preset.label
              return (
                <button
                  key={preset.label}
                  type="button"
                  disabled={disabled}
                  onClick={() => set('followUpAt', isoInDays(preset.days))}
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
            {value.followUpAt ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => set('followUpAt', null)}
                className="rounded-full border border-abc-border bg-abc-raised px-3.5 py-2 text-[12.5px] font-medium text-abc-muted transition-colors duration-200 ease-abc hover:text-abc-text abc-focus-ring"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
