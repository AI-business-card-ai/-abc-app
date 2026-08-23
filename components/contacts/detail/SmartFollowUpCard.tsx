'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  IconBrandLinkedin,
  IconBrandWhatsapp,
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconMail,
  IconMessage2,
  IconSparkles,
} from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import { CardTitle, ErrorNote, FIELD_LABEL_CLASS, INPUT_CLASS } from '@/components/contacts/detail/parts'
import { dueDateLabel } from '@/lib/format-date'
import {
  openEmailComposer,
  openLinkedInComposer,
  openWhatsAppComposer,
} from '@/lib/outreach-composers'
import { bucketFor } from '@/lib/followups'
import type { ContactDetail } from '@/lib/contact-detail'

type Channel = 'email' | 'whatsapp' | 'linkedin' | 'sms'

const STATUS: Record<string, { label: string; color: string }> = {
  overdue: { label: 'Overdue', color: 'var(--abc-overdue)' },
  today: { label: 'Due today', color: 'var(--abc-today)' },
  upcoming: { label: 'Upcoming', color: 'var(--abc-upcoming)' },
}

const CHANNELS: { id: Channel; label: string; icon: TablerIcon; cta: string }[] = [
  { id: 'email', label: 'Email', icon: IconMail, cta: 'Open in email' },
  { id: 'whatsapp', label: 'WhatsApp', icon: IconBrandWhatsapp, cta: 'Open WhatsApp' },
  { id: 'linkedin', label: 'LinkedIn', icon: IconBrandLinkedin, cta: 'Open LinkedIn' },
  { id: 'sms', label: 'SMS', icon: IconMessage2, cta: 'Open messages' },
]

/**
 * Drafts a short follow-up from identity + the selected meeting + next step.
 *
 * The meeting is the newest encounter — the same one the meeting context card
 * above is showing, read from the same place so the two cannot disagree. Its id
 * goes to the server, which fetches the meeting itself; nothing about what was
 * said travels from the browser. Before this, generation read the flat contact
 * columns, which meant a repeat meeting with no notes produced a message
 * recalling the previous conference and a promise already kept.
 *
 * We never claim to send: each channel opens its own composer with the text
 * pre-filled, because none of these platforms permit silent sending from here.
 * LinkedIn cannot even accept pre-filled text, so we copy first and say so.
 * "Mark as followed up" is the owner's own statement, which is the only
 * trustworthy signal there is.
 */
export default function SmartFollowUpCard({ contact }: { contact: ContactDetail }) {
  const router = useRouter()
  const [channel, setChannel] = useState<Channel>('email')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [generating, setGenerating] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const active = CHANNELS.find((c) => c.id === channel)!

  /** The meeting this follow-up is about: the newest, as shown above. */
  const latest = contact.encounters[0]
  const dueAt = latest ? latest.followUpAt : contact.followUpAt
  const bucket = bucketFor(dueAt)
  const status = bucket ? STATUS[bucket] : null

  /*
    Whether there is anything to write about, as opposed to only the fact of
    having met. Drives the wording below: promising a draft "from what you
    discussed" when nothing was discussed is a small lie the card can avoid.
  */
  const hasMeetingDetail = latest
    ? Boolean(latest.event || latest.discussed || latest.nextAction)
    : Boolean(contact.event || contact.discussed || contact.nextStep)

  const available: Record<Channel, boolean> = {
    email: Boolean(contact.email),
    whatsapp: Boolean(contact.phone),
    linkedin: Boolean(contact.linkedinUrl),
    sms: Boolean(contact.phone),
  }

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
        // The meeting is named, not described. The server reads it back itself.
        body: JSON.stringify({ contactId: contact.id, encounterId: latest?.id, channel }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'failed')

      setMessage(data.message || '')
      setSubject(data.subject || '')
    } catch (err) {
      // Deliberately leaves `message` alone: a failed regeneration must not
      // cost the owner the draft they had already edited.
      setError(
        err instanceof Error && err.message !== 'failed'
          ? err.message
          : 'Could not draft a message. Try again.'
      )
    } finally {
      setGenerating(false)
    }
  }

  /** The owner says the follow-up is done. Nothing external can tell us. */
  async function markFollowedUp() {
    setCompleting(true)
    setError(null)
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Names the meeting on screen. Completing this follow-up must not
        // touch another meeting's reminder for the same person.
        body: JSON.stringify({ contactId: contact.id, encounterId: latest?.id, action: 'complete' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.error || 'failed')

      flash('Marked as followed up')
      router.refresh()
    } catch {
      setError('Could not update this follow-up. Try again.')
    } finally {
      setCompleting(false)
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
    if (channel === 'email' && contact.email) {
      openEmailComposer(contact.email, subject, message)
      return
    }
    if (channel === 'whatsapp' && contact.phone) {
      if (!openWhatsAppComposer(contact.phone, message)) {
        setError('That phone number could not be used for WhatsApp.')
      }
      return
    }
    if (channel === 'sms' && contact.phone) {
      window.open(`sms:${contact.phone}?body=${encodeURIComponent(message)}`, '_blank')
      return
    }
    if (channel === 'linkedin' && contact.linkedinUrl) {
      // LinkedIn accepts no pre-filled text — copy, then open the profile.
      await openLinkedInComposer(contact.linkedinUrl, message)
      flash('Message copied — paste it in LinkedIn')
    }
  }

  return (
    <section className="abc-surface p-5">
      <div className="flex items-center gap-2">
        <IconSparkles size={17} stroke={1.8} style={{ color: 'var(--abc-gold-accent)' }} />
        <CardTitle>Smart follow-up</CardTitle>
      </div>
      <p className="mt-1.5 text-[13px] leading-[1.55] text-abc-secondary">
        {hasMeetingDetail
          ? 'Drafted from where you met, what you discussed and what you promised.'
          : 'Create a quick follow-up for this meeting.'}
      </p>

      {dueAt && status ? (
        <p className="mt-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: status.color }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: status.color }} aria-hidden="true" />
          {status.label} · {dueDateLabel(dueAt)}
        </p>
      ) : null}

      {/* Channel */}
      <div className="abc-scroll-x mt-4">
        <div className="flex gap-2">
          {CHANNELS.map((item) => {
            const isActive = item.id === channel
            const usable = available[item.id]
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setChannel(item.id)}
                disabled={!usable}
                aria-pressed={isActive}
                title={usable ? item.label : `No ${item.label.toLowerCase()} details saved`}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-[12.5px] font-medium transition-colors duration-200 ease-abc disabled:opacity-35 abc-focus-ring ${
                  isActive
                    ? 'border-transparent text-[#1a1205]'
                    : 'border-abc-border bg-abc-raised text-abc-secondary hover:border-abc-border-strong hover:text-abc-text'
                }`}
                style={isActive ? { background: 'var(--abc-gold)' } : undefined}
              >
                <item.icon size={15} stroke={1.9} />
                {item.label}
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
              rows={7}
              className={`resize-y py-2.5 leading-[1.55] ${INPUT_CLASS}`}
            />
          </label>
        </div>
      ) : (
        <p className="mt-4 rounded-inner border border-dashed border-abc-border px-4 py-5 text-center text-[13.5px] text-abc-secondary">
          Generate a draft, then edit it before you send.
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
              {active.cta}
            </Button>
          </>
        ) : null}
      </div>

      {dueAt ? (
        <Button
          onClick={() => void markFollowedUp()}
          variant="surface"
          disabled={completing}
          fullWidth
          className="mt-2"
        >
          <IconCheck size={17} stroke={1.9} />
          {completing ? 'Saving…' : 'Mark as followed up'}
        </Button>
      ) : null}

      {notice ? (
        <p className="mt-2.5 text-center text-[12.5px] text-abc-gold-accent" role="status">
          {notice}
        </p>
      ) : null}
    </section>
  )
}
