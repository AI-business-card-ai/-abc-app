'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconMapPin, IconMessage2, IconX } from '@tabler/icons-react'
import { FIELD_LABEL_CLASS, INPUT_CLASS } from '@/components/contacts/detail/parts'
import NextActionFields, { EMPTY_DRAFT, type NextActionDraft } from '@/components/opportunities/NextActionFields'
import { InlineError } from '@/components/opportunities/parts'
import Avatar from '@/components/ui/abc/Avatar'
import Button from '@/components/ui/abc/Button'
import { relativeDay } from '@/lib/format-date'
import { CURRENCIES, LIMITS, defaultOpportunityName, type Currency } from '@/lib/opportunities/model'
import type { ContactDetail } from '@/lib/contact-detail'

/**
 * Create opportunity — as small as a form can be.
 *
 * Who it is with, and why it matters, are not asked: they are read from the
 * contact and their latest meeting and shown, so the owner can see what the
 * deal starts from. Everything the owner can add is optional, and the deal
 * starts in New.
 */
export default function CreateOpportunitySheet({
  contact,
  onClose,
}: {
  contact: ContactDetail
  onClose: () => void
}) {
  const router = useRouter()
  const latest = contact.encounters[0]
  const event = latest?.event ?? contact.event
  const discussed = latest?.discussed ?? contact.discussed
  const metAt = latest?.metAt ?? contact.metAt

  const [value, setValue] = useState('')
  const [currency, setCurrency] = useState<Currency>('EUR')
  const [draft, setDraft] = useState<NextActionDraft>(EMPTY_DRAFT)
  const [note, setNote] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  async function create() {
    setSaving(true)
    setError(null)
    const wantsStep = draft.text.trim().length > 0
    try {
      const res = await fetch('/api/crm/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: contact.id,
          name: name.trim() || undefined,
          value: value.trim() || undefined,
          currency,
          note: note.trim() || undefined,
          nextAction: wantsStep ? { type: draft.type, text: draft.text, dueAt: draft.dueDate || undefined } : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.opportunity?.id) {
        setError(typeof data.error === 'string' ? data.error : 'Could not create this opportunity. Try again.')
        setSaving(false)
        return
      }
      const partial = wantsStep && data.created && !data.nextActionSaved
      router.push(`/crm/opportunities/${data.opportunity.id}${partial ? '?step=unsaved' : ''}`)
    } catch {
      setError('Could not create this opportunity. Try again.')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-6"
      style={{ background: 'rgba(4,4,5,0.72)' }}
      role="dialog"
      aria-modal="true"
      aria-label={`Create opportunity with ${contact.name}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-card border border-abc-border bg-abc-card sm:max-h-[86vh] sm:rounded-card"
        style={{ boxShadow: 'var(--abc-shadow-raised)' }}
      >
        <div className="flex items-start gap-3 border-b border-abc-border p-4 sm:p-5">
          <Avatar src={contact.photoUrl} name={contact.name} size={44} />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-abc-muted">New opportunity</p>
            <p className="mt-0.5 truncate text-[16px] font-semibold text-abc-text">{contact.name}</p>
            {contact.company ? <p className="truncate text-[13px] text-abc-secondary">{contact.company}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-abc-muted transition-colors hover:bg-abc-raised hover:text-abc-text abc-focus-ring"
          >
            <IconX size={19} stroke={1.9} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {/* What the deal starts from — read, not asked */}
          <div className="flex flex-col gap-2.5 rounded-inner border border-abc-border bg-abc-raised p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-abc-muted">Why this matters</p>
            {discussed ? (
              <p className="flex gap-2 text-[13.5px] leading-[1.5] text-abc-text">
                <IconMessage2 size={16} stroke={1.75} className="mt-0.5 shrink-0" style={{ color: 'var(--abc-gold-accent)' }} />
                {discussed}
              </p>
            ) : (
              <p className="text-[13px] text-abc-muted">No meeting notes yet — you can add a note below.</p>
            )}
            {event || metAt ? (
              <p className="flex items-center gap-2 text-[12.5px] text-abc-secondary">
                <IconMapPin size={15} stroke={1.75} className="shrink-0 text-abc-muted" />
                {[event ? `Met at ${event}` : 'Met', metAt ? relativeDay(metAt) : null].filter(Boolean).join(' · ')}
              </p>
            ) : null}
          </div>

          <div className="mt-5">
            <span className={FIELD_LABEL_CLASS}>Value (optional)</span>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                aria-label="Value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. 12000"
                className={`${INPUT_CLASS} h-11 min-h-[44px] min-w-0 flex-1`}
              />
              <select
                aria-label="Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
                className={`${INPUT_CLASS} h-11 min-h-[44px] w-[96px] shrink-0`}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-[12px] text-abc-muted">Next step (optional)</p>
            <NextActionFields value={draft} onChange={setDraft} firstName={contact.firstName ?? contact.name} idPrefix="create-next" />
          </div>

          <label className="mt-5 block">
            <span className={FIELD_LABEL_CLASS}>Note (optional)</span>
            <textarea
              value={note}
              maxLength={LIMITS.note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Anything worth keeping with this deal"
              className={`${INPUT_CLASS} resize-none py-2.5`}
            />
          </label>

          <label className="mt-5 block">
            <span className={FIELD_LABEL_CLASS}>Name (optional)</span>
            <input
              type="text"
              value={name}
              maxLength={LIMITS.name}
              onChange={(e) => setName(e.target.value)}
              placeholder={defaultOpportunityName({ name: contact.name, company: contact.company })}
              className={`${INPUT_CLASS} h-11 min-h-[44px]`}
            />
          </label>

          {error ? <div className="mt-4"><InlineError>{error}</InlineError></div> : null}
        </div>

        <div className="flex gap-2 border-t border-abc-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-5">
          <Button variant="surface" onClick={onClose} disabled={saving} className="flex-1 sm:flex-none">
            Cancel
          </Button>
          <Button onClick={() => void create()} disabled={saving} className="flex-1">
            {saving ? 'Creating…' : 'Create opportunity'}
          </Button>
        </div>
      </div>
    </div>
  )
}
