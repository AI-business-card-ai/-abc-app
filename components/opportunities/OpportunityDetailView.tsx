'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  IconArrowBackUp,
  IconCalendarEvent,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconMail,
  IconMessage2,
  IconPencil,
  IconPhone,
  IconTrophy,
  IconX,
} from '@tabler/icons-react'
import CrmPushCard from '@/components/contacts/detail/CrmPushCard'
import { CardTitle, FIELD_LABEL_CLASS, INPUT_CLASS } from '@/components/contacts/detail/parts'
import NextActionFields, { EMPTY_DRAFT, type NextActionDraft } from '@/components/opportunities/NextActionFields'
import { ACTION_ICON, CURRENCY_SELECT_CLASS, DueLabel, InlineError, InteractionLine, Notice, StageChip } from '@/components/opportunities/parts'
import Avatar from '@/components/ui/abc/Avatar'
import Button from '@/components/ui/abc/Button'
import { relativeDay } from '@/lib/format-date'
import {
  BOARD_STAGES,
  CURRENCIES,
  LIMITS,
  STAGE_LABEL,
  STAGE_TONE,
  actionTypeLabel,
  dateInputValue,
  formatMoney,
  isOpenStage,
  type Currency,
  type Opportunity,
  type OpportunityStage,
} from '@/lib/opportunities/model'
import type { OpportunityDetailData } from '@/lib/opportunities/data'

const ACTIVITY_LABEL: Record<string, string> = {
  EMAIL_SENT: 'Email sent',
  LINKEDIN_COPIED: 'LinkedIn message',
  WHATSAPP_OPENED: 'WhatsApp message',
  RESPONSE_RECEIVED: 'Reply received',
  FOLLOWUP_COMPLETED: 'Follow-up completed',
  NEXT_ACTION_DONE: 'Next step done',
  STAGE_CHANGED: 'Stage changed',
}

function longDate(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * One opportunity, answering four questions in order: who is this, what
 * happened, what should I do next, where is the deal.
 *
 * The person and their meetings come from the contact screen's own loader and
 * are linked back to it rather than re-implemented. External CRM sync is the
 * contact screen's push card, unchanged.
 */
export default function OpportunityDetailView({
  data,
  stepUnsaved = false,
}: {
  data: OpportunityDetailData
  /** Arrived from Create with a next step the database could not keep yet. */
  stepUnsaved?: boolean
}) {
  const router = useRouter()
  const { contact, lastFollowUp, lastInteraction, activity } = data
  const [opportunity, setOpportunity] = useState<Opportunity>(data.opportunity)
  const [error, setError] = useState<string | null>(stepUnsaved ? 'The deal was created, but its next step could not be saved yet.' : null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [editingStep, setEditingStep] = useState(false)
  const [draft, setDraft] = useState<NextActionDraft>(EMPTY_DRAFT)

  const [editingDeal, setEditingDeal] = useState(false)
  const [valueText, setValueText] = useState(opportunity.value ? String(opportunity.value) : '')
  const [currency, setCurrency] = useState<Currency>(opportunity.currency)
  const [name, setName] = useState(opportunity.name)
  const [note, setNote] = useState(opportunity.note ?? '')

  const [meetingFollowUpDone, setMeetingFollowUpDone] = useState(false)

  const latest = contact.encounters[0] ?? null
  const earlier = contact.encounters.slice(1, 4)
  const why = latest?.discussed ?? contact.discussed
  const open = isOpenStage(opportunity.stage)
  const value = formatMoney(opportunity.value, opportunity.currency)
  const meetingFollowUp = !meetingFollowUpDone && contact.followUpAt ? { text: contact.nextStep, dueAt: contact.followUpAt } : null

  // A follow-up was sent after the deal was opened, and it is still New: offer the move, never make it.
  const suggestProgress =
    opportunity.stage === 'new' &&
    lastFollowUp !== null &&
    new Date(lastFollowUp.at).getTime() > new Date(opportunity.createdAt).getTime()

  function flash(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 2600)
  }

  async function patch(body: Record<string, unknown>, key: string, done?: string): Promise<boolean> {
    setBusy(key)
    setError(null)
    try {
      const res = await fetch(`/api/crm/opportunities/${opportunity.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.opportunity) {
        setError(typeof json.error === 'string' ? json.error : 'Could not update this opportunity. Try again.')
        return false
      }
      setOpportunity(json.opportunity as Opportunity)
      if (done) flash(done)
      router.refresh()
      return true
    } catch {
      setError('Could not update this opportunity. Try again.')
      return false
    } finally {
      setBusy(null)
    }
  }

  function moveTo(stage: OpportunityStage) {
    if (stage === opportunity.stage) return
    void patch({ stage }, `stage:${stage}`, `Moved to ${STAGE_LABEL[stage]}`)
  }

  async function nextAction(body: Record<string, unknown>, key: string, done: string) {
    setBusy(key)
    setError(null)
    try {
      const res = await fetch(`/api/crm/opportunities/${opportunity.id}/next-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.opportunity) {
        setError(typeof json.error === 'string' ? json.error : 'Could not save the next step. Try again.')
        return
      }
      setOpportunity(json.opportunity as Opportunity)
      setEditingStep(false)
      flash(done)
      router.refresh()
    } catch {
      setError('Could not save the next step. Try again.')
    } finally {
      setBusy(null)
    }
  }

  async function completeMeetingFollowUp() {
    setBusy('meeting')
    setError(null)
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: contact.id, action: 'complete' }),
      })
      if (!res.ok) throw new Error('failed')
      setMeetingFollowUpDone(true)
      flash('Follow-up marked done')
      router.refresh()
    } catch {
      setError('Could not mark that done. Try again.')
    } finally {
      setBusy(null)
    }
  }

  function startStepEdit() {
    const current = opportunity.nextAction
    setDraft(
      current
        ? { type: current.type, text: current.text, dueDate: dateInputValue(current.dueAt) }
        : EMPTY_DRAFT
    )
    setEditingStep(true)
  }

  async function saveDeal() {
    const ok = await patch(
      { name: name.trim() || opportunity.name, value: valueText.trim() || null, currency, note: note.trim() || null },
      'deal',
      'Saved'
    )
    if (ok) setEditingDeal(false)
  }

  const meta = [contact.role, contact.company].filter(Boolean).join(' · ')
  const deal = opportunity.nextAction
  const DealIcon = deal ? ACTION_ICON[deal.type] : null

  return (
    <div className="mx-auto w-full max-w-[1100px] abc-page-top px-4 pb-10 sm:px-6 lg:px-8">
      <Link
        href="/crm"
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-inner py-1.5 text-[13.5px] font-medium text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
      >
        <IconChevronLeft size={17} stroke={2} />
        CRM
      </Link>

      {/* WHO, and where the deal stands, at a glance */}
      <header className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar src={contact.photoUrl} name={contact.name} size={64} ring />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-abc-muted">{opportunity.name}</p>
          <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-tight text-abc-text lg:text-[32px]">{contact.name}</h1>
          {meta ? <p className="mt-0.5 text-[15px] text-abc-secondary">{meta}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <StageChip stage={opportunity.stage} />
            {value ? (
              <span className="text-[15px] font-bold tabular-nums" style={{ color: 'var(--abc-gold-accent)' }}>
                {value}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {error ? <div className="mt-4"><InlineError>{error}</InlineError></div> : null}

      {suggestProgress && lastFollowUp ? (
        <div className="abc-surface mt-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-[13.5px] text-abc-text">
            You sent a follow-up on {longDate(lastFollowUp.at)}. Move this deal to {STAGE_LABEL.in_progress}?
          </p>
          <Button onClick={() => moveTo('in_progress')} disabled={busy !== null} className="shrink-0">
            Move to {STAGE_LABEL.in_progress}
          </Button>
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          {/* PERSON */}
          <section className="abc-surface p-5" aria-label="Person">
            <CardTitle>Person</CardTitle>
            <div className="mt-3 flex flex-col gap-2">
              {contact.email ? (
                <a href={`mailto:${contact.email}`} className="flex min-h-[44px] items-center gap-2.5 rounded-inner border border-abc-border bg-abc-raised px-3.5 text-[14px] text-abc-text transition-colors hover:border-abc-border-strong abc-focus-ring">
                  <IconMail size={17} stroke={1.75} className="shrink-0" style={{ color: 'var(--abc-gold-accent)' }} />
                  <span className="min-w-0 truncate">{contact.email}</span>
                </a>
              ) : null}
              {contact.phone ? (
                <a href={`tel:${contact.phone}`} className="flex min-h-[44px] items-center gap-2.5 rounded-inner border border-abc-border bg-abc-raised px-3.5 text-[14px] text-abc-text transition-colors hover:border-abc-border-strong abc-focus-ring">
                  <IconPhone size={17} stroke={1.75} className="shrink-0" style={{ color: 'var(--abc-gold-accent)' }} />
                  <span className="min-w-0 truncate">{contact.phone}</span>
                </a>
              ) : null}
              <Button href={`/contacts/${contact.id}`} variant="surface" fullWidth>
                Open contact
                <IconChevronRight size={16} stroke={2} />
              </Button>
            </div>
          </section>

          {/* WHAT HAPPENED */}
          <section className="abc-surface p-5" aria-label="Why this matters">
            <CardTitle>Why this matters</CardTitle>
            {why ? (
              <p className="mt-3 flex gap-2.5 text-[14.5px] leading-[1.55] text-abc-text">
                <IconMessage2 size={18} stroke={1.75} className="mt-0.5 shrink-0" style={{ color: 'var(--abc-gold-accent)' }} />
                {why}
              </p>
            ) : (
              <p className="mt-3 text-[13.5px] text-abc-secondary">
                No meeting notes yet.{' '}
                <Link href={`/contacts/${contact.id}`} className="font-medium text-abc-gold-accent underline-offset-2 hover:underline">
                  Add them on the contact
                </Link>
                .
              </p>
            )}
            {opportunity.note ? (
              <p className="mt-3 rounded-inner border border-abc-border bg-abc-raised px-3.5 py-3 text-[13.5px] leading-[1.5] text-abc-secondary">
                {opportunity.note}
              </p>
            ) : null}
          </section>

          <section className="abc-surface p-5" aria-label="Relationship">
            <CardTitle>Relationship</CardTitle>
            <div className="mt-3">
              <InteractionLine interaction={lastInteraction} />
            </div>

            {latest ? (
              <div className="mt-3 rounded-inner border border-abc-border bg-abc-raised px-3.5 py-3">
                <p className="flex items-center gap-2 text-[13.5px] font-semibold text-abc-text">
                  <IconCalendarEvent size={16} stroke={1.75} style={{ color: 'var(--abc-gold-accent)' }} />
                  {latest.event ?? 'Meeting'}
                  <span className="ml-auto text-[12px] font-normal text-abc-muted">{longDate(latest.metAt)}</span>
                </p>
                {latest.discussed ? <p className="mt-1.5 line-clamp-3 text-[13px] leading-[1.5] text-abc-secondary">{latest.discussed}</p> : null}
              </div>
            ) : (
              <p className="mt-3 text-[13px] text-abc-muted">No meetings recorded yet.</p>
            )}

            {earlier.length > 0 ? (
              <ul className="mt-2 flex flex-col">
                {earlier.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 border-b border-abc-border py-2 text-[13px] last:border-b-0">
                    <span className="min-w-0 truncate text-abc-secondary">{e.event ?? 'Meeting'}</span>
                    <span className="ml-auto shrink-0 text-[12px] text-abc-muted">{longDate(e.metAt)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {contact.encounters.length > 4 ? (
              <Link href={`/contacts/${contact.id}`} className="mt-2 inline-flex min-h-[44px] items-center text-[13px] font-medium text-abc-gold-accent">
                {contact.encounters.length - 4} earlier meetings on the contact
              </Link>
            ) : null}

            {lastFollowUp ? (
              <p className="mt-3 text-[12.5px] text-abc-secondary">
                Last follow-up sent {relativeDay(lastFollowUp.at).toLowerCase()}
                {lastFollowUp.channel ? ` · ${lastFollowUp.channel}` : ''}
              </p>
            ) : null}

            {activity.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-1.5 border-t border-abc-border pt-3">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-baseline gap-2 text-[12.5px]">
                    <span className="min-w-0 truncate text-abc-secondary">{a.detail ?? ACTIVITY_LABEL[a.type] ?? a.type}</span>
                    <span className="ml-auto shrink-0 text-[11.5px] text-abc-muted">{relativeDay(a.at)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </div>

        <div className="flex flex-col gap-4">
          {/* WHAT NEXT */}
          <section className="abc-surface p-5" aria-label="Next action">
            <CardTitle>Next action</CardTitle>

            {editingStep ? (
              <div className="mt-3">
                <NextActionFields value={draft} onChange={setDraft} firstName={contact.firstName ?? contact.name} idPrefix="detail-next" />
                <div className="mt-3 flex gap-2">
                  <Button variant="surface" onClick={() => setEditingStep(false)} disabled={busy !== null} className="flex-1">
                    Cancel
                  </Button>
                  <Button
                    onClick={() =>
                      void nextAction({ action: 'set', type: draft.type, text: draft.text, dueAt: draft.dueDate || null }, 'step', 'Next step saved')
                    }
                    disabled={busy !== null || draft.text.trim() === ''}
                    className="flex-1"
                  >
                    {busy === 'step' ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
            ) : deal && DealIcon ? (
              <div className="mt-3">
                <div className="flex items-start gap-3 rounded-inner border border-abc-border bg-abc-raised px-3.5 py-3">
                  <DealIcon size={19} stroke={1.75} className="mt-0.5 shrink-0" style={{ color: 'var(--abc-gold-accent)' }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-semibold text-abc-text">{deal.text}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-abc-muted">
                      {actionTypeLabel(deal.type)}
                      <DueLabel dueAt={deal.dueAt} />
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => void nextAction({ action: 'complete' }, 'done', 'Next step done')} disabled={busy !== null} className="flex-1">
                    <IconCheck size={16} stroke={2} />
                    {busy === 'done' ? 'Saving…' : 'Mark done'}
                  </Button>
                  <Button variant="surface" onClick={startStepEdit} disabled={busy !== null} ariaLabel="Edit next step">
                    <IconPencil size={16} stroke={1.9} />
                  </Button>
                  <Button variant="surface" onClick={() => void nextAction({ action: 'clear' }, 'clear', 'Next step cleared')} disabled={busy !== null} ariaLabel="Clear next step">
                    <IconX size={16} stroke={1.9} />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <p className="text-[13.5px] text-abc-secondary">{open ? 'No next step on this deal yet.' : 'This deal is closed.'}</p>
                {open ? (
                  <Button onClick={startStepEdit} variant="surface" fullWidth className="mt-3">
                    Set next step
                  </Button>
                ) : null}
              </div>
            )}

            {meetingFollowUp ? (
              <div className="mt-4 border-t border-abc-border pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-abc-muted">From your meeting</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] text-abc-text">{meetingFollowUp.text ?? 'Follow up'}</p>
                    <DueLabel dueAt={meetingFollowUp.dueAt} />
                  </div>
                  <Button variant="surface" onClick={() => void completeMeetingFollowUp()} disabled={busy !== null} className="shrink-0">
                    <IconCheck size={16} stroke={2} style={{ color: 'var(--abc-green)' }} />
                    Done
                  </Button>
                </div>
              </div>
            ) : null}
          </section>

          {/* WHERE IS THE DEAL */}
          <section className="abc-surface p-5" aria-label="Deal">
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Deal</CardTitle>
              {!editingDeal ? (
                <button
                  type="button"
                  onClick={() => setEditingDeal(true)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-btn px-2 text-[13px] font-medium text-abc-secondary hover:text-abc-text abc-focus-ring"
                >
                  <IconPencil size={15} stroke={1.9} />
                  Edit
                </button>
              ) : null}
            </div>

            {open ? (
              <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Stage">
                {BOARD_STAGES.filter((s) => s !== 'won').map((stage) => {
                  const current = opportunity.stage === stage
                  const tone = STAGE_TONE[stage]
                  return (
                    <button
                      key={stage}
                      type="button"
                      role="radio"
                      aria-checked={current}
                      onClick={() => moveTo(stage)}
                      disabled={busy !== null}
                      className="min-h-[44px] rounded-inner border px-2 text-[13px] font-semibold transition-colors duration-200 ease-abc disabled:opacity-60 abc-focus-ring"
                      style={
                        current
                          ? { color: tone.text, background: tone.bg, borderColor: tone.border }
                          : { color: 'var(--abc-text-secondary)', background: 'var(--abc-raised)', borderColor: 'var(--abc-border)' }
                      }
                    >
                      {STAGE_LABEL[stage]}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => moveTo('won')}
                  disabled={busy !== null}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-inner border px-2 text-[13px] font-semibold transition-colors disabled:opacity-60 abc-focus-ring"
                  style={{ color: STAGE_TONE.won.text, background: STAGE_TONE.won.bg, borderColor: STAGE_TONE.won.border }}
                >
                  <IconTrophy size={16} stroke={1.8} />
                  Won
                </button>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-3">
                <StageChip stage={opportunity.stage} />
                <span className="text-[13px] text-abc-secondary">
                  {opportunity.stage === 'won' ? 'Closed — won.' : 'Closed — lost.'}
                </span>
              </div>
            )}

            {editingDeal ? (
              <div className="mt-4 flex flex-col gap-3 border-t border-abc-border pt-4">
                <label className="block">
                  <span className={FIELD_LABEL_CLASS}>Name</span>
                  <input value={name} maxLength={LIMITS.name} onChange={(e) => setName(e.target.value)} className={`${INPUT_CLASS} h-11 min-h-[44px]`} />
                </label>
                <div>
                  <span className={FIELD_LABEL_CLASS}>Value (optional)</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label="Value"
                      value={valueText}
                      onChange={(e) => setValueText(e.target.value)}
                      placeholder="e.g. 12000"
                      className={`${INPUT_CLASS} h-11 min-h-[44px] min-w-0 flex-1`}
                    />
                    <select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className={CURRENCY_SELECT_CLASS}>
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <label className="block">
                  <span className={FIELD_LABEL_CLASS}>Note (optional)</span>
                  <textarea value={note} maxLength={LIMITS.note} onChange={(e) => setNote(e.target.value)} rows={3} className={`${INPUT_CLASS} resize-none py-2.5`} />
                </label>
                <div className="flex gap-2">
                  <Button variant="surface" onClick={() => setEditingDeal(false)} disabled={busy !== null} className="flex-1">
                    Cancel
                  </Button>
                  <Button onClick={() => void saveDeal()} disabled={busy !== null} className="flex-1">
                    {busy === 'deal' ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
            ) : (
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-abc-border pt-4 text-[13px]">
                <div>
                  <dt className="text-abc-muted">Value</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-abc-text">{value || '—'}</dd>
                </div>
                <div>
                  <dt className="text-abc-muted">Opened</dt>
                  <dd className="mt-0.5 text-abc-text">{longDate(opportunity.createdAt)}</dd>
                </div>
              </dl>
            )}

            <div className="mt-4 border-t border-abc-border pt-3">
              {open ? (
                <button
                  type="button"
                  onClick={() => moveTo('lost')}
                  disabled={busy !== null}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-btn px-1 text-[13px] font-medium transition-colors disabled:opacity-60 abc-focus-ring"
                  style={{ color: 'var(--abc-overdue)' }}
                >
                  <IconX size={16} stroke={1.9} />
                  Mark as lost
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => moveTo('new')}
                  disabled={busy !== null}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-btn px-1 text-[13px] font-medium text-abc-secondary transition-colors hover:text-abc-text disabled:opacity-60 abc-focus-ring"
                >
                  <IconArrowBackUp size={16} stroke={1.9} />
                  Reopen as New
                </button>
              )}
            </div>
          </section>

          {/* EXTERNAL CRM — keep it in ABC, or sync it to the CRM you already use */}
          <div>
            <p className="mb-2 px-1 text-[12.5px] leading-[1.5] text-abc-muted">
              Keep it in ABC, or sync this person and your latest meeting to the CRM you already use.
            </p>
            <CrmPushCard contact={contact} />
          </div>
        </div>
      </div>

      {notice ? <Notice>{notice}</Notice> : null}
    </div>
  )
}
