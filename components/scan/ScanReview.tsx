'use client'

import { useMemo, useState } from 'react'
import {
  IconBriefcase,
  IconBuilding,
  IconBrandLinkedin,
  IconChevronDown,
  IconMail,
  IconPhone,
  IconUser,
  IconWorld,
} from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import { SectionLabel } from '@/components/ui/abc/Bits'
import type { ContactCandidate } from '@/lib/scan/candidate'

/**
 * What this screen edits is exactly the candidate the scanner produced.
 *
 * These were two identical declarations — one here, one for the parsers — which
 * is the shape drift that lets a field get added on one side and quietly missed
 * on the other. The name stays because it reads better at the call site; the
 * type is the canonical one.
 */
export type ReviewFields = ContactCandidate

export type MeetingContextValue = {
  whereMet: string
  discussed: string
  nextAction: string
  followUpAt: string | null
}

const FIELDS: { key: keyof ReviewFields; label: string; icon: TablerIcon; type?: string }[] = [
  { key: 'first_name', label: 'First name', icon: IconUser },
  { key: 'last_name', label: 'Last name', icon: IconUser },
  { key: 'company', label: 'Company', icon: IconBuilding },
  { key: 'role', label: 'Role', icon: IconBriefcase },
  { key: 'email', label: 'Email', icon: IconMail, type: 'email' },
  { key: 'phone', label: 'Phone', icon: IconPhone, type: 'tel' },
  { key: 'website', label: 'Website', icon: IconWorld, type: 'url' },
  { key: 'linkedin_url', label: 'LinkedIn', icon: IconBrandLinkedin, type: 'url' },
]

const FOLLOW_UP_PRESETS: { label: string; days: number | null }[] = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
]

function isoDateInDays(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(9, 0, 0, 0)
  return date.toISOString()
}

function toDateInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10)
}

export default function ScanReview({
  fields,
  onFieldsChange,
  context,
  onContextChange,
  previewUrl,
  saving,
  error,
  onSave,
  onDiscard,
}: {
  fields: ReviewFields
  onFieldsChange: (fields: ReviewFields) => void
  context: MeetingContextValue
  onContextChange: (context: MeetingContextValue) => void
  previewUrl: string | null
  saving: boolean
  error: string | null
  onSave: () => void
  onDiscard: () => void
}) {
  // Fields the capture actually produced lead; the rest sit behind a toggle
  // so the screen stays short on a phone.
  const [showAll, setShowAll] = useState(false)
  const [customDate, setCustomDate] = useState(false)

  const filled = useMemo(
    () => FIELDS.filter((f) => fields[f.key].trim().length > 0),
    [fields]
  )
  const empty = useMemo(
    () => FIELDS.filter((f) => fields[f.key].trim().length === 0),
    [fields]
  )
  const visible = showAll ? FIELDS : filled

  function setField(key: keyof ReviewFields, value: string) {
    onFieldsChange({ ...fields, [key]: value })
  }

  function setFollowUp(days: number) {
    setCustomDate(false)
    const next = isoDateInDays(days)
    onContextChange({
      ...context,
      followUpAt: context.followUpAt === next ? null : next,
    })
  }

  const activePreset = FOLLOW_UP_PRESETS.find(
    (preset) => preset.days !== null && context.followUpAt === isoDateInDays(preset.days)
  )

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-4">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Captured source"
            className="h-16 w-24 shrink-0 rounded-inner border border-abc-border object-cover"
          />
        ) : null}
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold tracking-tight text-abc-text lg:text-[26px]">
            Contact captured
          </h1>
          <p className="mt-1 text-[13.5px] text-abc-secondary">
            Check the details, then add where you met.
          </p>
        </div>
      </header>

      {/* Identity */}
      <section className="abc-surface p-4 sm:p-5">
        <SectionLabel>Contact details</SectionLabel>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visible.map((field) => (
            <label key={field.key} className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-[12px] text-abc-muted">
                <field.icon size={14} stroke={1.8} style={{ color: 'var(--abc-gold-accent)' }} />
                {field.label}
              </span>
              <input
                type={field.type || 'text'}
                value={fields[field.key]}
                onChange={(e) => setField(field.key, e.target.value)}
                placeholder="—"
                className="h-11 w-full rounded-inner border border-abc-border bg-abc-raised px-3 text-[16px] text-abc-text outline-none sm:text-[15px] transition-colors duration-200 ease-abc placeholder:text-abc-muted focus:border-abc-gold-accent"
              />
            </label>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="mt-2 text-[13px] text-abc-secondary">
            Nothing was read from that capture. Add the details below.
          </p>
        ) : null}

        {empty.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="mt-3 inline-flex items-center gap-1.5 rounded text-[13px] font-semibold text-abc-gold-accent transition-opacity hover:opacity-80 abc-focus-ring"
          >
            {showAll ? 'Hide empty fields' : `Add missing details (${empty.length})`}
            <IconChevronDown
              size={15}
              stroke={2}
              className={`transition-transform duration-200 ${showAll ? 'rotate-180' : ''}`}
            />
          </button>
        ) : null}
      </section>

      {/* Meeting context */}
      <section className="abc-surface p-4 sm:p-5">
        <SectionLabel>Meeting context</SectionLabel>
        <p className="mt-1.5 text-[13px] leading-[1.55] text-abc-secondary">
          This is what you will have forgotten in three weeks.
        </p>

        <div className="mt-4 flex flex-col gap-3.5">
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-abc-muted">Where did you meet?</span>
            <input
              value={context.whereMet}
              onChange={(e) => onContextChange({ ...context, whereMet: e.target.value })}
              placeholder="Event, city or occasion"
              className="h-11 w-full rounded-inner border border-abc-border bg-abc-raised px-3 text-[16px] text-abc-text outline-none sm:text-[15px] transition-colors duration-200 ease-abc placeholder:text-abc-muted focus:border-abc-gold-accent"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] text-abc-muted">What did you discuss?</span>
            <textarea
              value={context.discussed}
              onChange={(e) => onContextChange({ ...context, discussed: e.target.value })}
              rows={3}
              placeholder="What they need, what you promised"
              className="w-full resize-y rounded-inner border border-abc-border bg-abc-raised px-3 py-2.5 text-[16px] leading-[1.5] text-abc-text outline-none sm:text-[15px] transition-colors duration-200 ease-abc placeholder:text-abc-muted focus:border-abc-gold-accent"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] text-abc-muted">What is the next step?</span>
            <input
              value={context.nextAction}
              onChange={(e) => onContextChange({ ...context, nextAction: e.target.value })}
              placeholder="Send proposal, share deck…"
              className="h-11 w-full rounded-inner border border-abc-border bg-abc-raised px-3 text-[16px] text-abc-text outline-none sm:text-[15px] transition-colors duration-200 ease-abc placeholder:text-abc-muted focus:border-abc-gold-accent"
            />
          </label>

          <div>
            <span className="mb-2 block text-[12px] text-abc-muted">
              When should you follow up?
            </span>
            <div className="flex flex-wrap gap-2">
              {FOLLOW_UP_PRESETS.map((preset) => {
                const active = !customDate && activePreset?.label === preset.label
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setFollowUp(preset.days as number)}
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
                value={toDateInput(context.followUpAt)}
                onChange={(e) => {
                  const value = e.target.value
                  if (!value) {
                    onContextChange({ ...context, followUpAt: null })
                    return
                  }
                  const date = new Date(`${value}T09:00:00`)
                  onContextChange({ ...context, followUpAt: date.toISOString() })
                }}
                className="mt-2.5 h-11 w-full rounded-inner border border-abc-border bg-abc-raised px-3 text-[16px] text-abc-text outline-none sm:text-[15px] transition-colors duration-200 ease-abc focus:border-abc-gold-accent sm:w-auto"
              />
            ) : null}
          </div>
        </div>
      </section>

      {error ? (
        <p
          className="rounded-inner px-3.5 py-3 text-[13.5px]"
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#fca5a5',
          }}
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 pb-2 sm:flex-row-reverse">
        <Button onClick={onSave} disabled={saving} size="lg" fullWidth className="sm:w-auto">
          {saving ? 'Saving…' : 'Save contact'}
        </Button>
        <Button
          onClick={onDiscard}
          variant="surface"
          size="lg"
          disabled={saving}
          fullWidth
          className="sm:w-auto"
        >
          Discard
        </Button>
      </div>
    </div>
  )
}
