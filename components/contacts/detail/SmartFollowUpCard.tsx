'use client'

import { useState } from 'react'
import {
  IconBrandLinkedin,
  IconBrandWhatsapp,
  IconCopy,
  IconExternalLink,
  IconMail,
  IconMessage2,
  IconSparkles,
} from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import { CardTitle, ErrorNote, FIELD_LABEL_CLASS, INPUT_CLASS } from '@/components/contacts/detail/parts'
import {
  openEmailComposer,
  openLinkedInComposer,
  openWhatsAppComposer,
} from '@/lib/outreach-composers'
import type { ContactDetail } from '@/lib/contact-detail'

type Channel = 'email' | 'whatsapp' | 'linkedin' | 'sms'

const CHANNELS: { id: Channel; label: string; icon: TablerIcon; cta: string }[] = [
  { id: 'email', label: 'Email', icon: IconMail, cta: 'Open in email' },
  { id: 'whatsapp', label: 'WhatsApp', icon: IconBrandWhatsapp, cta: 'Open WhatsApp' },
  { id: 'linkedin', label: 'LinkedIn', icon: IconBrandLinkedin, cta: 'Open LinkedIn' },
  { id: 'sms', label: 'SMS', icon: IconMessage2, cta: 'Open messages' },
]

/**
 * Drafts a short follow-up from identity + meeting context + next step.
 *
 * We never claim to send: each channel opens its own composer with the text
 * pre-filled, because none of these platforms permit silent sending from here.
 * LinkedIn cannot even accept pre-filled text, so we copy first and say so.
 */
export default function SmartFollowUpCard({ contact }: { contact: ContactDetail }) {
  const [channel, setChannel] = useState<Channel>('email')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const active = CHANNELS.find((c) => c.id === channel)!

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
        body: JSON.stringify({ contactId: contact.id, channel }),
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
        Drafted from where you met, what you discussed and what you promised.
      </p>

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

      {notice ? (
        <p className="mt-2.5 text-center text-[12.5px] text-abc-gold-accent" role="status">
          {notice}
        </p>
      ) : null}
    </section>
  )
}
