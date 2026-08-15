'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  IconBrandLinkedin,
  IconBrandWhatsapp,
  IconCheck,
  IconChevronRight,
  IconClockPause,
  IconCopy,
  IconExternalLink,
  IconMail,
  IconMapPin,
  IconMessage2,
  IconSparkles,
  IconTargetArrow,
  IconX,
} from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'
import Avatar from '@/components/ui/abc/Avatar'
import Button from '@/components/ui/abc/Button'
import { ErrorNote, FIELD_LABEL_CLASS, INPUT_CLASS } from '@/components/contacts/detail/parts'
import {
  openEmailComposer,
  openLinkedInComposer,
  openWhatsAppComposer,
} from '@/lib/outreach-composers'
import type { FollowUpItem } from '@/lib/follow-ups-data'

type Channel = 'email' | 'whatsapp' | 'linkedin' | 'sms'

const CHANNELS: { id: Channel; label: string; icon: TablerIcon; cta: string }[] = [
  { id: 'email', label: 'Email', icon: IconMail, cta: 'Open in email' },
  { id: 'whatsapp', label: 'WhatsApp', icon: IconBrandWhatsapp, cta: 'Open WhatsApp' },
  { id: 'linkedin', label: 'LinkedIn', icon: IconBrandLinkedin, cta: 'Open LinkedIn' },
  { id: 'sms', label: 'SMS', icon: IconMessage2, cta: 'Open messages' },
]

const SNOOZE: { label: string; days: number }[] = [
  { label: 'Tomorrow', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
]

function inDays(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(9, 0, 0, 0)
  return date.toISOString()
}

/**
 * The quick action panel: everything needed to actually follow up, without
 * opening the contact and hunting for the generator.
 */
export default function FollowUpSheet({
  item,
  onClose,
  onDone,
  onSnoozed,
}: {
  item: FollowUpItem
  onClose: () => void
  onDone: (id: string) => void
  onSnoozed: (id: string) => void
}) {
  const [channel, setChannel] = useState<Channel>('email')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [generating, setGenerating] = useState(false)
  const [working, setWorking] = useState(false)
  const [showSnooze, setShowSnooze] = useState(false)
  const [customDate, setCustomDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const available: Record<Channel, boolean> = {
    email: Boolean(item.email),
    whatsapp: Boolean(item.phone),
    linkedin: Boolean(item.linkedinUrl),
    sms: Boolean(item.phone),
  }

  // Start on a channel the contact can actually be reached on.
  useEffect(() => {
    const first = CHANNELS.find((c) => available[c.id])
    if (first && !available[channel]) setChannel(first.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id])

  // Lock the page behind the sheet so mobile doesn't scroll two layers.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  function flash(text: string) {
    setNotice(text)
    setTimeout(() => setNotice(null), 2500)
  }

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/contact/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: item.id, channel }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'failed')
      setMessage(data.message || '')
      setSubject(data.subject || '')
    } catch (err) {
      setError(
        err instanceof Error && err.message !== 'failed'
          ? err.message
          : 'Could not draft a message. Try again.'
      )
    } finally {
      setGenerating(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(
        channel === 'email' && subject ? `${subject}\n\n${message}` : message
      )
      flash('Copied')
    } catch {
      setError('Could not copy to the clipboard.')
    }
  }

  async function openChannel() {
    setError(null)
    if (channel === 'email' && item.email) {
      openEmailComposer(item.email, subject, message)
      return
    }
    if (channel === 'whatsapp' && item.phone) {
      if (!openWhatsAppComposer(item.phone, message)) {
        setError('That phone number could not be used for WhatsApp.')
      }
      return
    }
    if (channel === 'sms' && item.phone) {
      window.open(`sms:${item.phone}?body=${encodeURIComponent(message)}`, '_blank')
      return
    }
    if (channel === 'linkedin' && item.linkedinUrl) {
      await openLinkedInComposer(item.linkedinUrl, message)
      flash('Message copied — paste it in LinkedIn')
    }
  }

  async function act(action: 'complete' | 'snooze', until?: string) {
    setWorking(true)
    setError(null)
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: item.id, action, until }),
      })
      if (!res.ok) throw new Error('failed')
      if (action === 'complete') onDone(item.id)
      else onSnoozed(item.id)
    } catch {
      setError(
        action === 'complete'
          ? 'Could not mark that done.'
          : 'Could not move that follow-up.'
      )
      setWorking(false)
    }
  }

  const activeChannel = CHANNELS.find((c) => c.id === channel)!
  const meta = [item.role, item.company].filter(Boolean).join(' · ')

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-6"
      style={{ background: 'rgba(4,4,5,0.72)' }}
      role="dialog"
      aria-modal="true"
      aria-label={`Follow up with ${item.name}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-card border border-abc-border bg-abc-card sm:max-h-[86vh] sm:rounded-card"
        style={{ boxShadow: 'var(--abc-shadow-raised)' }}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-abc-border p-4 sm:p-5">
          <Avatar src={item.photoUrl} name={item.name} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold text-abc-text">{item.name}</p>
            {meta ? (
              <p className="mt-0.5 truncate text-[13px] text-abc-secondary">{meta}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-abc-muted transition-colors hover:bg-abc-raised hover:text-abc-text abc-focus-ring"
          >
            <IconX size={19} stroke={1.9} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {/* Why this is due */}
          {item.event || item.discussed || item.nextStep ? (
            <div className="flex flex-col gap-2.5 rounded-inner border border-abc-border bg-abc-raised p-3.5">
              {item.event ? (
                <Row icon={IconMapPin} label="Met at">
                  {item.event}
                </Row>
              ) : null}
              {item.discussed ? (
                <Row icon={IconMessage2} label="Discussed">
                  {item.discussed}
                </Row>
              ) : null}
              {item.nextStep ? (
                <Row icon={IconTargetArrow} label="Next">
                  {item.nextStep}
                </Row>
              ) : null}
            </div>
          ) : null}

          {/* Channels */}
          <div className="abc-scroll-x mt-4">
            <div className="flex gap-2">
              {CHANNELS.map((item2) => {
                const isActive = item2.id === channel
                const usable = available[item2.id]
                return (
                  <button
                    key={item2.id}
                    type="button"
                    onClick={() => setChannel(item2.id)}
                    disabled={!usable}
                    aria-pressed={isActive}
                    title={usable ? item2.label : `No ${item2.label.toLowerCase()} details saved`}
                    className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-[12.5px] font-medium transition-colors duration-200 ease-abc disabled:opacity-35 abc-focus-ring ${
                      isActive
                        ? 'border-transparent text-[#1a1205]'
                        : 'border-abc-border bg-abc-raised text-abc-secondary hover:border-abc-border-strong hover:text-abc-text'
                    }`}
                    style={isActive ? { background: 'var(--abc-gold)' } : undefined}
                  >
                    <item2.icon size={15} stroke={1.9} />
                    {item2.label}
                  </button>
                )
              })}
            </div>
          </div>

          {message ? (
            <div className="mt-4 flex flex-col gap-3">
              {channel === 'email' ? (
                <label className="block">
                  <span className={FIELD_LABEL_CLASS}>Subject</span>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className={`h-11 ${INPUT_CLASS}`}
                  />
                </label>
              ) : null}
              <label className="block">
                <span className={FIELD_LABEL_CLASS}>Message</span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={6}
                  className={`resize-y py-2.5 leading-[1.55] ${INPUT_CLASS}`}
                />
              </label>
            </div>
          ) : (
            <p className="mt-4 rounded-inner border border-dashed border-abc-border px-4 py-5 text-center text-[13.5px] text-abc-secondary">
              Generate a draft from the meeting context, then edit before sending.
            </p>
          )}

          {error ? <div className="mt-3"><ErrorNote>{error}</ErrorNote></div> : null}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => void generate()}
              variant={message ? 'surface' : 'gold'}
              disabled={generating}
              fullWidth
              className="sm:w-auto"
            >
              <IconSparkles size={17} stroke={1.9} />
              {generating ? 'Drafting…' : message ? 'Regenerate' : 'Generate message'}
            </Button>
            {message ? (
              <>
                <Button onClick={() => void copy()} variant="surface" fullWidth className="sm:w-auto">
                  <IconCopy size={17} stroke={1.9} />
                  Copy
                </Button>
                <Button
                  onClick={() => void openChannel()}
                  disabled={!available[channel]}
                  fullWidth
                  className="sm:w-auto"
                >
                  <IconExternalLink size={17} stroke={1.9} />
                  {activeChannel.cta}
                </Button>
              </>
            ) : null}
          </div>

          {notice ? (
            <p className="mt-2.5 text-center text-[12.5px] text-abc-gold-accent" role="status">
              {notice}
            </p>
          ) : null}

          <Link
            href={`/contacts/${item.id}`}
            className="mt-4 inline-flex items-center gap-1 rounded text-[13px] font-medium text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
          >
            Open full contact
            <IconChevronRight size={15} stroke={2} />
          </Link>
        </div>

        {/* Footer actions */}
        <div
          className="border-t border-abc-border p-4 sm:p-5"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          {showSnooze ? (
            <div>
              <span className={FIELD_LABEL_CLASS}>Move this follow-up to</span>
              <div className="flex flex-wrap gap-2">
                {SNOOZE.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    disabled={working}
                    onClick={() => void act('snooze', inDays(option.days))}
                    className="rounded-full border border-abc-border bg-abc-raised px-3.5 py-2 text-[12.5px] font-medium text-abc-secondary transition-colors hover:border-abc-border-strong hover:text-abc-text disabled:opacity-40 abc-focus-ring"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className={`h-11 ${INPUT_CLASS}`}
                />
                <Button
                  onClick={() =>
                    void act('snooze', new Date(`${customDate}T09:00:00`).toISOString())
                  }
                  variant="surface"
                  disabled={working || !customDate}
                  className="shrink-0"
                >
                  Move
                </Button>
              </div>
              <button
                type="button"
                onClick={() => setShowSnooze(false)}
                className="mt-2.5 text-[13px] text-abc-secondary transition-colors hover:text-abc-text"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <Button
                onClick={() => void act('complete')}
                disabled={working}
                size="lg"
                fullWidth
                className="sm:w-auto sm:flex-1"
              >
                <IconCheck size={18} stroke={2} />
                {working ? 'Saving…' : 'Mark done'}
              </Button>
              <Button
                onClick={() => setShowSnooze(true)}
                variant="surface"
                size="lg"
                disabled={working}
                fullWidth
                className="sm:w-auto sm:flex-1"
              >
                <IconClockPause size={18} stroke={1.8} />
                Snooze
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({
  icon: RowIcon,
  label,
  children,
}: {
  icon: TablerIcon
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-2">
      <RowIcon
        size={15}
        stroke={1.8}
        className="mt-[3px] shrink-0"
        style={{ color: 'var(--abc-gold-accent)' }}
      />
      <p className="min-w-0 text-[13.5px] leading-[1.5] text-abc-text">
        <span className="text-abc-muted">{label}: </span>
        {children}
      </p>
    </div>
  )
}
