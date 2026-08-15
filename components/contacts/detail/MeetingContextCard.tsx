'use client'

import { useState } from 'react'
import {
  IconCalendarEvent,
  IconMapPin,
  IconMessage,
  IconPencil,
  IconTargetArrow,
} from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import { CardTitle, ErrorNote, FIELD_LABEL_CLASS, INPUT_CLASS } from '@/components/contacts/detail/parts'
import { dueDateLabel } from '@/lib/format-date'
import type { ContactDetail } from '@/lib/contact-detail'

const FOLLOW_UP_PRESETS: { label: string; days: number }[] = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
]

const STATUS: Record<string, { label: string; color: string }> = {
  overdue: { label: 'Overdue', color: 'var(--abc-overdue)' },
  today: { label: 'Due today', color: 'var(--abc-today)' },
  upcoming: { label: 'Upcoming', color: 'var(--abc-upcoming)' },
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

function formatMetAt(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Meeting context, the next step and the follow-up date — the answers a
 * phonebook entry loses. Saved through the existing /api/card/context route
 * with scoring and message generation switched off.
 */
export default function MeetingContextCard({
  contact,
  onSaved,
}: {
  contact: ContactDetail
  onSaved: (next: Partial<ContactDetail>) => void
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [event, setEvent] = useState(contact.event ?? '')
  const [discussed, setDiscussed] = useState(contact.discussed ?? '')
  const [nextStep, setNextStep] = useState(contact.nextStep ?? '')
  const [followUpAt, setFollowUpAt] = useState<string | null>(contact.followUpAt)
  const [customDate, setCustomDate] = useState(false)

  const hasContext = Boolean(contact.event || contact.discussed || contact.nextStep)
  const status = contact.followUp ? STATUS[contact.followUp] : null
  const metAt = formatMetAt(contact.metAt)

  function reset() {
    setEvent(contact.event ?? '')
    setDiscussed(contact.discussed ?? '')
    setNextStep(contact.nextStep ?? '')
    setFollowUpAt(contact.followUpAt)
    setCustomDate(false)
    setError(null)
    setEditing(false)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/card/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: contact.id,
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
        event: event.trim() || null,
        discussed: discussed.trim() || null,
        nextStep: nextStep.trim() || null,
        followUpAt,
      })
      setEditing(false)
    } catch {
      setError('Could not save the meeting context. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="abc-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardTitle>Meeting context</CardTitle>
          <p className="mt-1.5 text-[13px] leading-[1.55] text-abc-secondary">
            This is what you will have forgotten in three weeks.
          </p>
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-inner px-2.5 py-1.5 text-[13px] font-semibold text-abc-gold-accent transition-colors hover:bg-abc-raised abc-focus-ring"
          >
            <IconPencil size={15} stroke={1.9} />
            {hasContext ? 'Edit' : 'Add'}
          </button>
        ) : null}
      </div>

      {editing ? (
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
              {saving ? 'Saving…' : 'Save context'}
            </Button>
            <Button onClick={reset} variant="surface" disabled={saving} fullWidth className="sm:w-auto">
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3.5">
          {contact.event ? (
            <Detail icon={IconMapPin} label="Met at">
              {contact.event}
              {metAt ? <span className="text-abc-muted"> · {metAt}</span> : null}
            </Detail>
          ) : metAt && hasContext ? (
            // Without any other context this is just the scan date, which the
            // header already shows — don't repeat it as if it were context.
            <Detail icon={IconMapPin} label="Met on">
              {metAt}
            </Detail>
          ) : null}

          {contact.discussed ? (
            <Detail icon={IconMessage} label="Discussed">
              {contact.discussed}
            </Detail>
          ) : null}

          {contact.notes && contact.notes !== contact.discussed ? (
            <Detail icon={IconMessage} label="Notes">
              {contact.notes}
            </Detail>
          ) : null}

          {contact.nextStep ? (
            <Detail icon={IconTargetArrow} label="Next step">
              {contact.nextStep}
            </Detail>
          ) : null}

          {contact.followUpAt ? (
            <Detail icon={IconCalendarEvent} label="Follow up">
              <span className="inline-flex flex-wrap items-center gap-x-2">
                <span>{dueDateLabel(contact.followUpAt)}</span>
                {status ? (
                  <span
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-medium"
                    style={{ color: status.color }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: status.color }}
                      aria-hidden="true"
                    />
                    {status.label}
                  </span>
                ) : null}
              </span>
            </Detail>
          ) : null}

          {!hasContext && !contact.followUpAt ? (
            <div className="rounded-inner border border-dashed border-abc-border px-4 py-5 text-center">
              <p className="text-[13.5px] text-abc-secondary">
                No meeting context saved for this contact yet.
              </p>
              <Button onClick={() => setEditing(true)} variant="surface" className="mt-3.5">
                Add meeting context
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}

function Detail({
  icon: DetailIcon,
  label,
  children,
}: {
  icon: typeof IconMapPin
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-2.5">
      <DetailIcon
        size={16}
        stroke={1.75}
        className="mt-[3px] shrink-0"
        style={{ color: 'var(--abc-gold-accent)' }}
      />
      <div className="min-w-0">
        <p className="text-[12px] text-abc-muted">{label}</p>
        <p className="mt-0.5 whitespace-pre-wrap text-[14.5px] leading-[1.55] text-abc-text">
          {children}
        </p>
      </div>
    </div>
  )
}
