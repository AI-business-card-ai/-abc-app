'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { logMessageSent } from '@/lib/crm-client'
import { useOutreachSendConfirm } from '@/lib/hooks/useOutreachSendConfirm'
import SendConfirmDialog from '@/components/outreach/SendConfirmDialog'
import { GOOGLE_RECONNECT_CODE } from '@/lib/google-gmail-auth'
import {
  openEmailComposer,
  openLinkedInComposer,
  openWhatsAppComposer,
} from '@/lib/outreach-composers'
import type { ScannedContact } from '@/lib/types'

const CARD = { background: '#1a1a1a', borderRadius: '12px', border: '1px solid #2a2a2a', padding: '20px' } as const

const VARIANT_STYLES = ['Direct', 'Professional', 'Casual'] as const
export type Platform = 'linkedin' | 'email' | 'whatsapp'

export type MessageVariant = {
  id: number
  style: (typeof VARIANT_STYLES)[number]
  text: string
  platforms: Record<Platform, boolean>
}

export function buildVariantsFromContact(contact: ScannedContact): MessageVariant[] {
  const texts = [
    contact.message_linkedin || '',
    contact.message_email || '',
    contact.message_whatsapp || '',
  ]
  const fallback = texts.find((t) => t.trim()) || ''

  return VARIANT_STYLES.map((style, index) => ({
    id: index + 1,
    style,
    text: texts[index]?.trim() ? texts[index] : fallback,
    platforms: {
      linkedin: index === 0,
      email: index === 1,
      whatsapp: index === 2,
    },
  }))
}

function autoResizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

const PLATFORM_META: { key: Platform; label: string; color: string }[] = [
  { key: 'linkedin', label: 'LinkedIn', color: '#0077B5' },
  { key: 'email', label: 'Email', color: '#f0197d' },
  { key: 'whatsapp', label: 'WhatsApp', color: '#25D366' },
]

const LINKEDIN_LIMIT = 300
const WHATSAPP_LIMIT = 160
const EMAIL_SUBJECT_LIMIT = 60

function Toast({ message }: { message: string }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        padding: '14px 20px',
        borderRadius: '10px',
        background: '#1a1a1a',
        border: '1px solid #2a2a2a',
        color: '#ffffff',
        fontSize: '13px',
        zIndex: 100,
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        maxWidth: '360px',
        lineHeight: 1.5,
      }}
    >
      {message}
    </div>
  )
}

type SentChannel = {
  channel: 'LinkedIn' | 'Email' | 'WhatsApp' | 'Gmail'
  text: string
  toast: string
  skipLog?: boolean
}

type Props = {
  contact: ScannedContact
  googleConnected: boolean
  onContactUpdate: (contact: ScannedContact) => void
}

export default function MessageComposer({ contact, googleConnected: googleConnectedProp, onContactUpdate }: Props) {
  const [variants, setVariants] = useState<MessageVariant[]>([])
  const [emailSubject, setEmailSubject] = useState(contact.email_subject || '')
  const [toast, setToast] = useState<string | null>(null)
  const [googleConnected, setGoogleConnected] = useState(googleConnectedProp)
  const [sendingGmail, setSendingGmail] = useState(false)
  const [gmailReconnectError, setGmailReconnectError] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [showSendBar, setShowSendBar] = useState(true)

  useEffect(() => {
    setGoogleConnected(googleConnectedProp)
  }, [googleConnectedProp])

  useEffect(() => {
    setVariants(buildVariantsFromContact(contact))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-init when message fields change, not whole contact object
  }, [contact.id, contact.message_linkedin, contact.message_email, contact.message_whatsapp])

  useEffect(() => {
    setEmailSubject(contact.email_subject || '')
    setShowSendBar(true)
  }, [contact.id, contact.email_subject])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function showToastSequence(messages: string[]) {
    messages.forEach((msg, index) => {
      setTimeout(() => {
        setToast(msg)
        setTimeout(() => setToast(null), 2800)
      }, index * 3000)
    })
  }

  // After the first sent message, move the contact out of 'new' into 'follow-up'.
  // Never moves a contact backward — contacts already past 'new' are left untouched.
  async function maybeAdvancePipelineStage(c: ScannedContact) {
    const current = c.pipeline_stage
    if (current && current !== 'new') return
    try {
      const res = await fetch('/api/pipeline/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: c.id, stage: 'follow-up' }),
      })
      if (res.ok) {
        onContactUpdate({ ...c, pipeline_stage: 'follow-up' })
      }
    } catch (e) {
      console.error('[message-composer] pipeline auto-advance failed:', e)
    }
  }

  const { dialogPending, enqueuePendingSend, confirmSent, dismissNotSent } = useOutreachSendConfirm(
    async (pending) => {
      const result = await logMessageSent({
        contactId: pending.contactId,
        channel: pending.channel,
        messageText: pending.messageText,
      })
      const updated = (result.contact as ScannedContact) ?? contact
      if (result.contact) onContactUpdate(updated)
      showToast('✓ Marked as sent')
      await maybeAdvancePipelineStage(updated)
    }
  )

  function queueSendConfirmation(channel: 'LinkedIn' | 'Email' | 'WhatsApp', messageText: string) {
    enqueuePendingSend({
      contactId: contact.id,
      contactName: contact.name || 'this contact',
      channel,
      messageText,
    })
  }

  const selectedSendCount = variants.reduce(
    (count, variant) =>
      count
      + (variant.platforms.linkedin ? 1 : 0)
      + (variant.platforms.email ? 1 : 0)
      + (variant.platforms.whatsapp ? 1 : 0),
    0
  )

  function updateVariantText(id: number, text: string) {
    setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, text } : v)))
  }

  function toggleVariantPlatform(id: number, platform: Platform) {
    setVariants((prev) =>
      prev.map((v) =>
        v.id === id
          ? { ...v, platforms: { ...v.platforms, [platform]: !v.platforms[platform] } }
          : v
      )
    )
  }

  async function sendGmailViaApi(subject: string, body: string) {
    setSendingGmail(true)
    setGmailReconnectError(null)
    try {
      const res = await fetch('/api/card/send-gmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: contact.id,
          subject,
          body,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.code === GOOGLE_RECONNECT_CODE) {
          setGoogleConnected(false)
          setGmailReconnectError(json.error || 'Email session expired. Please reconnect in Settings.')
        }
        throw new Error(json.error || 'Email send failed')
      }
      if (json.contact) onContactUpdate(json.contact as ScannedContact)
      await maybeAdvancePipelineStage((json.contact as ScannedContact) ?? contact)
      return true
    } catch (e) {
      console.error(e)
      showToast(e instanceof Error ? e.message : 'Email send failed')
      return false
    } finally {
      setSendingGmail(false)
    }
  }

  function handleSendSelected() {
    void handleSendSelectedAsync()
  }

  async function handleSendSelectedAsync() {
    const subject = emailSubject.trim() || 'Following up'
    const whatsappPhone = contact.phone || contact.mobile_phone || contact.whatsapp_number || ''
    const pendingLogs: SentChannel[] = []
    const gmailJobs: Array<{ subject: string; body: string }> = []

    for (const variant of variants) {
      const text = variant.text.trim()
      if (!text) continue

      if (variant.platforms.email) {
        if (contact.email) {
          if (googleConnected) {
            gmailJobs.push({ subject, body: text })
          } else if (openEmailComposer(contact.email, subject, text)) {
            pendingLogs.push({ channel: 'Email', text, toast: 'Email opened ✓' })
          }
        }
      }

      if (variant.platforms.whatsapp) {
        if (whatsappPhone && openWhatsAppComposer(whatsappPhone, text)) {
          pendingLogs.push({ channel: 'WhatsApp', text, toast: 'WhatsApp opened ✓' })
        }
      }

      if (variant.platforms.linkedin) {
        if (contact.linkedin_url) {
          const opened = await openLinkedInComposer(contact.linkedin_url, text)
          if (opened) {
            pendingLogs.push({
              channel: 'LinkedIn',
              text,
              toast: 'Message copied — paste it on their LinkedIn profile.',
            })
          }
        }
      }
    }

    for (const job of gmailJobs) {
      const sent = await sendGmailViaApi(job.subject, job.body)
      if (sent) {
        pendingLogs.push({ channel: 'Gmail', text: job.body, toast: 'Email sent ✓', skipLog: true })
      }
    }

    if (pendingLogs.length === 0) {
      showToast('Select at least one platform with a message')
      return
    }

    for (const entry of pendingLogs) {
      if (entry.skipLog || entry.channel === 'Gmail') continue
      queueSendConfirmation(entry.channel, entry.text)
    }

    showToastSequence(pendingLogs.map((entry) => entry.toast))
  }

  async function handleVariantGmailSend(variantId: number) {
    if (!contact.email) {
      showToast('Email address missing')
      return
    }
    const variant = variants.find((v) => v.id === variantId)
    const text = variant?.text.trim()
    if (!text) {
      showToast('No message to send')
      return
    }
    const sent = await sendGmailViaApi(emailSubject.trim() || 'Following up', text)
    if (sent) showToast('Email sent ✓')
  }

  async function handleVariantEmailOpen(variantId: number) {
    if (!contact.email) {
      showToast('Email address missing')
      return
    }
    const variant = variants.find((v) => v.id === variantId)
    const text = variant?.text.trim()
    if (!text) {
      showToast('No message to send')
      return
    }
    if (!openEmailComposer(contact.email, emailSubject.trim() || 'Following up', text)) return
    queueSendConfirmation('Email', text)
    showToast('Email opened ✓')
  }

  async function handleRegenerateMessages() {
    setRegenerating(true)
    try {
      const res = await fetch(`/api/enrich/messages/${contact.id}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to regenerate messages')
      if (json.contact) onContactUpdate(json.contact as ScannedContact)
      showToast('Messages regenerated')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Regeneration failed')
    } finally {
      setRegenerating(false)
    }
  }

  const subjectOver = emailSubject.length > EMAIL_SUBJECT_LIMIT

  return (
    <>
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', color: '#00d4d4', letterSpacing: '0.08em' }}>AI MESSAGES</div>
          <button
            type="button"
            className="interactive"
            disabled={regenerating}
            onClick={() => void handleRegenerateMessages()}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid #2a2a2a',
              background: '#242424',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: regenerating ? 'wait' : 'pointer',
              opacity: regenerating ? 0.6 : 1,
            }}
          >
            {regenerating ? 'Regenerating…' : '🔄 Regenerate messages'}
          </button>
        </div>

        {gmailReconnectError && (
          <div
            style={{
              marginBottom: '12px',
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid rgba(239,68,68,0.4)',
              background: 'rgba(239,68,68,0.08)',
              color: '#fca5a5',
              fontSize: '13px',
              lineHeight: 1.5,
            }}
          >
            {gmailReconnectError}{' '}
            <Link href="/settings" style={{ color: '#00d4d4', fontWeight: 700 }}>
              Reconnect Email →
            </Link>
          </div>
        )}

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '11px', color: '#555555', marginBottom: '6px' }}>
            Email subject
          </label>
          <input
            className="interactive-input"
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            placeholder="Following up"
            style={{
              width: '100%',
              background: '#0f0f0f',
              border: '1px solid #2a2a2a',
              borderRadius: '8px',
              padding: '10px 12px',
              color: '#ffffff',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <span style={{ display: 'block', marginTop: '4px', fontSize: '11px', color: subjectOver ? '#ef4444' : '#555555' }}>
            Subject: {emailSubject.length}/{EMAIL_SUBJECT_LIMIT}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {variants.map((variant) => {
            const anyChecked = variant.platforms.linkedin || variant.platforms.email || variant.platforms.whatsapp
            const linkedinLen = variant.text.length
            const whatsappLen = variant.text.length
            const linkedinOver = linkedinLen > LINKEDIN_LIMIT
            const whatsappOver = whatsappLen > WHATSAPP_LIMIT

            return (
              <div
                key={variant.id}
                className="interactive"
                style={{
                  background: '#1a1a1a',
                  borderRadius: '12px',
                  border: `1px solid ${anyChecked ? '#00d4d4' : '#2a2a2a'}`,
                  padding: '16px',
                  width: '100%',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#00d4d4', marginBottom: '10px' }}>
                  Variant {variant.id} · {variant.style}
                </div>

                <textarea
                  className="interactive-input"
                  value={variant.text}
                  onChange={(e) => {
                    updateVariantText(variant.id, e.target.value)
                    autoResizeTextarea(e.target)
                  }}
                  onFocus={(e) => autoResizeTextarea(e.target)}
                  rows={3}
                  placeholder="Edit your message…"
                  style={{
                    width: '100%',
                    minHeight: '88px',
                    resize: 'none',
                    overflow: 'hidden',
                    background: '#0f0f0f',
                    border: '1px solid #2a2a2a',
                    borderRadius: '8px',
                    padding: '12px',
                    color: '#ffffff',
                    fontSize: '14px',
                    lineHeight: 1.5,
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '10px', fontSize: '11px' }}>
                  <span style={{ color: linkedinOver ? '#ef4444' : '#555555' }}>
                    LinkedIn: {linkedinLen}/{LINKEDIN_LIMIT}
                  </span>
                  <span style={{ color: whatsappOver ? '#ef4444' : '#555555' }}>
                    WhatsApp: {whatsappLen}/{WHATSAPP_LIMIT}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '10px',
                    marginTop: '14px',
                  }}
                >
                  {PLATFORM_META.map(({ key, label, color }) => {
                    const checked = variant.platforms[key]
                    return (
                      <label
                        key={key}
                        className="interactive"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          minHeight: '44px',
                          minWidth: '120px',
                          padding: '8px 14px',
                          borderRadius: '8px',
                          border: `1px solid ${checked ? color : '#2a2a2a'}`,
                          background: checked ? `${color}18` : 'transparent',
                          color: checked ? color : '#999999',
                          fontSize: '14px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleVariantPlatform(variant.id, key)}
                          style={{
                            width: '18px',
                            height: '18px',
                            accentColor: color,
                            cursor: 'pointer',
                          }}
                        />
                        {label}
                      </label>
                    )
                  })}
                </div>

                {variant.platforms.email && contact.email && (
                  <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {googleConnected ? (
                      <>
                        <button
                          type="button"
                          className="interactive-primary"
                          disabled={sendingGmail || !variant.text.trim()}
                          onClick={() => void handleVariantGmailSend(variant.id)}
                          style={{
                            width: '100%',
                            padding: '12px 16px',
                            borderRadius: '10px',
                            border: 'none',
                            background: 'linear-gradient(135deg,#f0197d,#00d4d4)',
                            color: '#0f0f0f',
                            fontWeight: 700,
                            fontSize: '14px',
                            cursor: sendingGmail ? 'wait' : 'pointer',
                          }}
                        >
                          {sendingGmail ? 'Sending…' : 'Send via Email (1-click)'}
                        </button>
                        <button
                          type="button"
                          className="interactive"
                          disabled={!variant.text.trim()}
                          onClick={() => void handleVariantEmailOpen(variant.id)}
                          style={{
                            alignSelf: 'flex-start',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid #2a2a2a',
                            background: 'transparent',
                            color: '#777777',
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          Open in email app
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="interactive"
                        disabled={!variant.text.trim()}
                        onClick={() => void handleVariantEmailOpen(variant.id)}
                        style={{
                          alignSelf: 'flex-start',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          border: '1px solid #2a2a2a',
                          background: '#242424',
                          color: '#ffffff',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Open in email app
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {showSendBar && selectedSendCount > 0 && (
        <div
          className="interactive-primary"
          style={{
            position: 'fixed',
            bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))',
            right: 16,
            zIndex: 95,
            display: 'flex',
            alignItems: 'center',
            maxWidth: 140,
            height: 44,
            borderRadius: 999,
            background: 'linear-gradient(135deg, #f0197d, #00d4d4)',
            boxShadow: '0 4px 20px rgba(240, 25, 125, 0.35)',
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            className="interactive"
            disabled={sendingGmail}
            onClick={handleSendSelected}
            style={{
              flex: 1,
              minWidth: 0,
              height: '100%',
              border: 'none',
              background: 'transparent',
              color: '#0f0f0f',
              fontSize: '13px',
              fontWeight: 800,
              cursor: sendingGmail ? 'wait' : 'pointer',
              padding: '0 8px 0 14px',
              whiteSpace: 'nowrap',
            }}
          >
            {sendingGmail ? 'Sending…' : `Send (${selectedSendCount})`}
          </button>
          <button
            type="button"
            className="interactive"
            onClick={() => setShowSendBar(false)}
            aria-label="Dismiss send bar"
            style={{
              flexShrink: 0,
              width: 32,
              height: 32,
              marginRight: 6,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(15, 15, 15, 0.25)',
              color: '#0f0f0f',
              fontSize: '16px',
              fontWeight: 700,
              lineHeight: 1,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>
      )}

      {toast && <Toast message={toast} />}

      <SendConfirmDialog
        pending={dialogPending}
        onConfirm={() => void confirmSent()}
        onDismiss={dismissNotSent}
      />
    </>
  )
}
