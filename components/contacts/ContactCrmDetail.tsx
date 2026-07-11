'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClientComponent } from '@/lib/supabase'
import ActivityTimeline from '@/components/crm/ActivityTimeline'
import TagPills from '@/components/crm/TagPills'
import { PIPELINE_STAGES } from '@/lib/pipeline'
import { getStatusColor } from '@/lib/pipeline-ai'
import { logCrmActivity, logDealOutcome, logMessageSent, updateContact } from '@/lib/crm-client'
import { exportToHubSpot, exportToSalesforce } from '@/lib/crm-export'
import { GOOGLE_RECONNECT_CODE } from '@/lib/google-gmail-auth'
import {
  openEmailComposer,
  openLinkedInComposer,
  openWhatsAppComposer,
} from '@/lib/outreach-composers'
import type { ContactEvent, ScannedContact, SpeakingEngagement } from '@/lib/types'
import EventTagPrompt from '@/components/contact/EventTagPrompt'
import CrmMissingFieldsBanner from '@/components/contact/CrmMissingFieldsBanner'
import CrmExportEventModal from '@/components/contact/CrmExportEventModal'
import LinkedInMismatchBanner from '@/components/contact/LinkedInMismatchBanner'
import EstimatedBadge from '@/components/ui/EstimatedBadge'
import { contactHasEventTag } from '@/lib/event-tag'
import {
  getContactCompanySize,
  getContactHeadquarters,
  getContactRevenue,
  isCrmFieldEstimated,
} from '@/lib/crm-mandatory-fields'

const CARD = { background: '#1a1a1a', borderRadius: '12px', border: '1px solid #2a2a2a', padding: '20px' } as const
const LEAD_STATUSES = ['New', 'Working', 'Nurturing', 'Qualified', 'Converted']
const RATINGS = [
  { id: 'Hot', label: '🔥 Hot' },
  { id: 'Warm', label: '⚡ Warm' },
  { id: 'Cold', label: '❄️ Cold' },
]

function dash(value: unknown) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string' && !value.trim()) return '—'
  if (typeof value === 'number' && Number.isNaN(value)) return '—'
  return String(value)
}

function scoreColors(score: number) {
  if (score >= 70) return { bg: '#ef4444', text: '#fff' }
  if (score >= 41) return { bg: '#eab308', text: '#0f0f0f' }
  return { bg: '#555555', text: '#fff' }
}

function scoreRatingEmoji(rating: string | null | undefined, score: number) {
  const r = rating?.toLowerCase() || (score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold')
  if (r.includes('hot')) return '🔥'
  if (r.includes('warm')) return '⚡'
  return '❄️'
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
        <span style={{ color: '#999999' }}>{label}</span>
        <span style={{ color: '#ffffff', fontWeight: 600 }}>{pct}%</span>
      </div>
      <div style={{ height: '6px', background: '#2a2a2a', borderRadius: '3px', overflow: 'hidden' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #f0197d, #00d4d4)',
            borderRadius: '3px',
          }}
        />
      </div>
    </div>
  )
}

function MatchScoreBreakdown({ contact, score }: { contact: ScannedContact; score: number }) {
  const hasBreakdown =
    contact.icp_fit_score != null ||
    contact.intent_score != null ||
    contact.timing_score != null ||
    contact.accessibility_score != null

  if (!hasBreakdown && score <= 0) return null

  const starters = Array.isArray(contact.conversation_starters) ? contact.conversation_starters : []

  return (
    <div style={CARD}>
      <div style={{ fontSize: '11px', color: '#f0197d', letterSpacing: '0.08em', marginBottom: '12px' }}>
        MATCH SCORE BREAKDOWN
      </div>
      <div
        style={{
          background: '#242424',
          borderRadius: '10px',
          border: '1px solid #2a2a2a',
          padding: '16px',
        }}
      >
        <div style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', marginBottom: '14px' }}>
          Overall: {score} {scoreRatingEmoji(contact.rating, score)}
          {contact.rating && (
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#999999', marginLeft: '8px' }}>
              {contact.rating}
            </span>
          )}
        </div>

        {contact.icp_fit_score != null && <ScoreBar label="ICP Fit" value={contact.icp_fit_score} />}
        {contact.intent_score != null && <ScoreBar label="Intent Signals" value={contact.intent_score} />}
        {contact.timing_score != null && <ScoreBar label="Timing" value={contact.timing_score} />}
        {contact.accessibility_score != null && <ScoreBar label="Accessibility" value={contact.accessibility_score} />}

        {starters.length > 0 && (
          <div style={{ marginTop: '12px', borderTop: '1px solid #2a2a2a', paddingTop: '12px' }}>
            {starters.map((starter) => (
              <p key={starter} style={{ margin: '0 0 6px', fontSize: '12px', color: '#00d4d4' }}>
                ✓ &quot;{starter}&quot;
              </p>
            ))}
          </div>
        )}

        {contact.red_flags && (
          <p style={{ margin: starters.length ? '8px 0 0' : '12px 0 0', fontSize: '12px', color: '#f59e0b' }}>
            ⚠ {contact.red_flags}
          </p>
        )}
      </div>
    </div>
  )
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const VARIANT_STYLES = ['Direct', 'Professional', 'Casual'] as const
type Platform = 'linkedin' | 'email' | 'whatsapp'

type MessageVariant = {
  id: number
  style: (typeof VARIANT_STYLES)[number]
  text: string
  platforms: Record<Platform, boolean>
}

function buildVariantsFromContact(contact: ScannedContact): MessageVariant[] {
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

function InfoRow({ icon, label, href, children }: { icon: string; label: string; href?: string; children: ReactNode }) {
  const content = (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
      <span style={{ fontSize: '14px', width: '20px' }}>{icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '10px', color: '#555555', marginBottom: '2px' }}>{label}</div>
        <div style={{ fontSize: '13px', color: '#ffffff', wordBreak: 'break-word' }}>{children}</div>
      </div>
    </div>
  )
  if (href) {
    return (
      <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
        {content}
      </a>
    )
  }
  return content
}

export default function ContactCrmDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = useMemo(() => createClientComponent(), [])
  const id = String(params?.id ?? '')

  const [contact, setContact] = useState<ScannedContact | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activityKey, setActivityKey] = useState(0)
  const [noteText, setNoteText] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [variants, setVariants] = useState<MessageVariant[]>([])

  const [dealValue, setDealValue] = useState('')
  const [closeDate, setCloseDate] = useState('')
  const [closeProb, setCloseProb] = useState('')
  const [oppType, setOppType] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [leadStatus, setLeadStatus] = useState('New')
  const [rating, setRating] = useState('Warm')
  const [deleteHover, setDeleteHover] = useState(false)
  const [googleConnected, setGoogleConnected] = useState(false)
  const [sendingGmail, setSendingGmail] = useState(false)
  const [gmailReconnectError, setGmailReconnectError] = useState<string | null>(null)
  const [exportModalTarget, setExportModalTarget] = useState<'salesforce' | 'hubspot' | null>(null)
  const [showSendBar, setShowSendBar] = useState(true)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }, [])

  const showToastSequence = useCallback((messages: string[]) => {
    messages.forEach((msg, index) => {
      setTimeout(() => {
        setToast(msg)
        setTimeout(() => setToast(null), 2800)
      }, index * 3000)
    })
  }, [])

  const syncDealForm = useCallback((c: ScannedContact) => {
    setDealValue(c.deal_value != null ? String(c.deal_value) : '')
    setCloseDate(c.expected_close_date || '')
    setCloseProb(c.close_probability != null ? String(c.close_probability) : '')
    setOppType(c.opportunity_type || '')
    setNextStep(c.next_step || '')
    setLeadStatus(c.lead_status || 'New')
    setRating(c.rating || 'Warm')
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      setNotFound(false)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }

        const [{ data, error }, { data: profile }] = await Promise.all([
          supabase
            .from('scanned_contacts')
            .select('*')
            .eq('id', id)
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('abc_profiles')
            .select('google_connected')
            .eq('id', user.id)
            .maybeSingle(),
        ])

        if (!active) return
        if (active) setGoogleConnected(Boolean(profile?.google_connected))
        if (error) throw error
        if (!data) {
          setNotFound(true)
          setContact(null)
        } else {
          const c = data as ScannedContact
          setContact(c)
          syncDealForm(c)
        }
      } catch (e) {
        console.error(e)
        if (active) setNotFound(true)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [id, router, supabase, syncDealForm])

  useEffect(() => {
    if (contact) setVariants(buildVariantsFromContact(contact))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-init when message fields change, not whole contact object
  }, [contact?.id, contact?.message_linkedin, contact?.message_email, contact?.message_whatsapp])

  useEffect(() => {
    setShowSendBar(true)
  }, [contact?.id])

  const selectedSendCount = useMemo(
    () => variants.reduce(
      (count, variant) =>
        count
        + (variant.platforms.linkedin ? 1 : 0)
        + (variant.platforms.email ? 1 : 0)
        + (variant.platforms.whatsapp ? 1 : 0),
      0
    ),
    [variants]
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

  function handleSendSelected() {
    void handleSendSelectedAsync()
  }

  type SentChannel = {
    channel: 'LinkedIn' | 'Email' | 'WhatsApp' | 'Gmail'
    text: string
    toast: string
    skipLog?: boolean
  }

  async function handleSendSelectedAsync() {
    if (!contact) return
    const emailSubject = contact.email_subject || 'Following up'
    const whatsappPhone = contact.phone || contact.mobile_phone || contact.whatsapp_number || ''
    const pendingLogs: SentChannel[] = []
    const gmailJobs: Array<{ subject: string; body: string }> = []

    for (const variant of variants) {
      const text = variant.text.trim()
      if (!text) continue

      if (variant.platforms.email) {
        if (contact.email) {
          if (googleConnected) {
            gmailJobs.push({ subject: emailSubject, body: text })
          } else if (openEmailComposer(contact.email, emailSubject, text)) {
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
      if (entry.skipLog) continue
      try {
        const result = await logMessageSent({
          contactId: contact.id,
          channel: entry.channel,
          messageText: entry.text,
        })
        if (result.contact) applyContact(result.contact as ScannedContact)
      } catch (e) {
        console.error('Failed to log message sent:', e)
      }
    }

    setActivityKey((k) => k + 1)
    showToastSequence(pendingLogs.map((entry) => entry.toast))
  }

  async function sendGmailViaApi(subject: string, body: string) {
    if (!contact) return false
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
      if (json.contact) applyContact(json.contact as ScannedContact)
      setActivityKey((k) => k + 1)
      return true
    } catch (e) {
      console.error(e)
      showToast(e instanceof Error ? e.message : 'Email send failed')
      return false
    } finally {
      setSendingGmail(false)
    }
  }

  async function handleVariantGmailSend(variantId: number) {
    if (!contact?.email) {
      showToast('Email address missing')
      return
    }
    const variant = variants.find((v) => v.id === variantId)
    const text = variant?.text.trim()
    if (!text) {
      showToast('No message to send')
      return
    }
    const sent = await sendGmailViaApi(contact.email_subject || 'Following up', text)
    if (sent) showToast('Email sent ✓')
  }

  async function handleVariantEmailOpen(variantId: number) {
    if (!contact?.email) {
      showToast('Email address missing')
      return
    }
    const variant = variants.find((v) => v.id === variantId)
    const text = variant?.text.trim()
    if (!text) {
      showToast('No message to send')
      return
    }
    const subject = contact.email_subject || 'Following up'
    if (!openEmailComposer(contact.email, subject, text)) return
    try {
      const result = await logMessageSent({
        contactId: contact.id,
        channel: 'Email',
        messageText: text,
      })
      if (result.contact) applyContact(result.contact as ScannedContact)
      setActivityKey((k) => k + 1)
    } catch (e) {
      console.error(e)
    }
    showToast('Email opened ✓')
  }

  async function handleQuickGmailSend() {
    if (!contact?.email) {
      showToast('Email address missing')
      return
    }
    const text = variants.find((v) => v.text.trim())?.text.trim() || contact.message_email || ''
    if (!text) {
      showToast('No message to send')
      return
    }
    const sent = await sendGmailViaApi(contact.email_subject || 'Following up', text)
    if (sent) showToast('Email sent ✓')
  }

  async function handleQuickEmailOpen() {
    if (!contact?.email) {
      showToast('Email address missing')
      return
    }
    const text = variants.find((v) => v.text.trim())?.text.trim() || contact.message_email || ''
    if (!text) {
      showToast('No message to send')
      return
    }
    const subject = contact.email_subject || 'Following up'
    if (!openEmailComposer(contact.email, subject, text)) return
    try {
      const result = await logMessageSent({
        contactId: contact.id,
        channel: 'Email',
        messageText: text,
      })
      if (result.contact) applyContact(result.contact as ScannedContact)
      setActivityKey((k) => k + 1)
    } catch (e) {
      console.error(e)
    }
    showToast('Email opened ✓')
  }

  const applyContact = (c: ScannedContact) => {
    setContact(c)
    syncDealForm(c)
  }

  function runExport(target: 'salesforce' | 'hubspot', c: ScannedContact) {
    if (target === 'salesforce') exportToSalesforce(c)
    else exportToHubSpot(c)
    showToast(`Exported to ${target === 'salesforce' ? 'Salesforce' : 'HubSpot'} ✓`)
  }

  function handleExportClick(target: 'salesforce' | 'hubspot') {
    if (!contact) return
    if (!contactHasEventTag(contact)) {
      setExportModalTarget(target)
      return
    }
    runExport(target, contact)
  }

  function focusEventInput() {
    document.getElementById('crm-event-input')?.focus()
    document.getElementById('crm-event-input')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const score = contact?.ai_lead_score ?? contact?.match_score ?? 0
  const scoreStyle = scoreColors(score)
  const status = contact?.crm_status || 'NEW'
  const statusColor = getStatusColor(contact?.crm_status)
  const stage = contact?.pipeline_stage || 'new'

  const initials = useMemo(() => {
    const name = contact?.name || '?'
    return name.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
  }, [contact?.name])

  const hqLocation = [contact?.billing_city, contact?.billing_country].filter(Boolean).join(', ')

  async function setPipelineStage(stageId: string) {
    if (!contact) return
    setSaving(true)
    try {
      const { contact: updated } = await updateContact({ contactId: contact.id, pipeline_stage: stageId })
      applyContact(updated)
      setActivityKey((k) => k + 1)
      showToast('Pipeline updated')
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  async function saveDeal() {
    if (!contact) return
    setSaving(true)
    try {
      const { contact: updated } = await updateContact({
        contactId: contact.id,
        deal_value: Number(dealValue) || 0,
        expected_close_date: closeDate || null,
        close_probability: closeProb ? Number(closeProb) : undefined,
        next_step: nextStep || undefined,
        lead_status: leadStatus,
        rating,
        opportunity_stage: oppType || undefined,
      })
      applyContact(updated)
      showToast('Deal updated')
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  async function addNote() {
    if (!contact || !noteText.trim()) return
    setSaving(true)
    try {
      await logCrmActivity({
        contactId: contact.id,
        activityType: 'NOTE_ADDED',
        activityDetail: noteText.trim(),
      })
      setNoteText('')
      setActivityKey((k) => k + 1)
      showToast('Note added')
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  async function markOutcome(outcome: 'won' | 'lost') {
    if (!contact) return
    setSaving(true)
    try {
      const { contact: updated } = await logDealOutcome({
        contactId: contact.id,
        outcome,
        dealValue: Number(dealValue) || undefined,
      })
      applyContact(updated)
      setActivityKey((k) => k + 1)
      showToast(outcome === 'won' ? 'Marked as Won' : 'Marked as Lost')
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  async function deleteContact() {
    if (!contact) return
    if (!window.confirm('Delete this contact? This cannot be undone.')) return

    setSaving(true)
    try {
      const res = await fetch('/api/card/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: contact.id }),
      })
      const json = (await res.json()) as { success?: boolean; error?: string }
      if (!res.ok || !json.success) throw new Error(json.error || 'Delete failed')
      router.push('/contacts')
    } catch (e) {
      console.error(e)
      showToast('Failed to delete contact')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00d4d4' }}>
        <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#00d4d4', borderRightColor: '#f0197d' }} />
      </div>
    )
  }

  if (notFound || !contact) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#999999' }}>
        <p style={{ marginBottom: '16px' }}>Contact not found</p>
        <button
          type="button"
          onClick={() => router.back()}
          style={{ color: '#00d4d4', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}
        >
          ← Back
        </button>
      </div>
    )
  }

  const posts = Array.isArray(contact.linkedin_posts) ? contact.linkedin_posts.slice(0, 3) : []
  const skills = Array.isArray(contact.linkedin_skills) ? contact.linkedin_skills : []
  const upcoming = Array.isArray(contact.events_upcoming) ? contact.events_upcoming : []
  const past = Array.isArray(contact.events_past) ? contact.events_past : []
  const speaking = Array.isArray(contact.speaking_engagements) ? contact.speaking_engagements : []

  const emailSubject = contact.email_subject || ''

  const emailSelected = variants.some((v) => v.platforms.email)
  const sendButtonLabel = googleConnected && emailSelected && !variants.some((v) => v.platforms.linkedin || v.platforms.whatsapp)
    ? 'Send via Email (1-click)'
    : 'Send Selected →'

  return (
    <div
      style={{
        background: '#0f0f0f',
        minHeight: '100vh',
        padding: '16px 16px 0',
        paddingBottom: showSendBar
          ? 'calc(160px + env(safe-area-inset-bottom, 0px))'
          : 'calc(80px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <button
        type="button"
        onClick={() => router.back()}
        style={{ display: 'inline-block', marginBottom: '20px', color: '#00d4d4', fontSize: '14px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        ← Back
      </button>

      <EventTagPrompt
        contact={contact}
        onContactUpdated={(updated) => setContact(updated)}
      />

      <CrmMissingFieldsBanner
        contact={contact}
        onContactUpdated={(updated) => setContact(updated)}
      />

      <CrmExportEventModal
        open={exportModalTarget !== null}
        target={exportModalTarget}
        contact={contact}
        onClose={() => setExportModalTarget(null)}
        onExport={(updated, target) => {
          setContact(updated)
          runExport(target, updated)
        }}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
          alignItems: 'start',
        }}
      >
        {/* LEFT — Identity */}
        <div style={{ ...CARD, maxWidth: '320px', width: '100%', margin: '0 auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '20px' }}>
            {contact.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={contact.photo_url} alt="" style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', marginBottom: '12px', border: '2px solid rgba(0,212,212,0.3)' }} />
            ) : (
              <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'linear-gradient(135deg,#f0197d,#00d4d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 800, color: '#fff', marginBottom: '12px' }}>
                {initials}
              </div>
            )}
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#ffffff' }}>{dash(contact.name)}</h1>
            <p style={{ margin: '6px 0 12px', fontSize: '13px', color: '#999999' }}>
              {[contact.role, contact.company].filter(Boolean).join(' · ') || '—'}
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <span style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, background: scoreStyle.bg, color: scoreStyle.text }}>
                AI Score {score}
              </span>
              <span style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, border: `1px solid ${statusColor}`, color: statusColor }}>
                {status.replace(/_/g, ' ')}
              </span>
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #2a2a2a', margin: '16px 0' }} />

          <InfoRow icon="✉️" label="Email" href={contact.email ? `mailto:${contact.email}` : undefined}>{dash(contact.email)}</InfoRow>
          <InfoRow icon="📞" label="Phone" href={contact.phone ? `tel:${contact.phone}` : undefined}>{dash(contact.phone)}</InfoRow>
          <InfoRow icon="💼" label="LinkedIn" href={contact.linkedin_url || undefined}>{dash(contact.linkedin_url)}</InfoRow>
          <InfoRow icon="🌐" label="Website" href={contact.website?.startsWith('http') ? contact.website : contact.website ? `https://${contact.website}` : undefined}>{dash(contact.website)}</InfoRow>

          <hr style={{ border: 'none', borderTop: '1px solid #2a2a2a', margin: '16px 0' }} />

          <div style={{ fontSize: '10px', color: '#00d4d4', letterSpacing: '0.08em', marginBottom: '10px' }}>COMPANY</div>
          <div style={{ fontSize: '13px', color: '#999999', lineHeight: 1.6 }}>
            <div><strong style={{ color: '#ffffff' }}>Industry:</strong> {dash(contact.industry)}</div>
            <div>
              <strong style={{ color: '#ffffff' }}>Size:</strong> {dash(getContactCompanySize(contact) || contact.company_size || contact.no_of_employees)}
              {isCrmFieldEstimated(contact, 'company_size') && <EstimatedBadge compact />}
            </div>
            <div>
              <strong style={{ color: '#ffffff' }}>Revenue:</strong> {dash(getContactRevenue(contact) || contact.company_revenue || contact.annual_revenue)}
              {isCrmFieldEstimated(contact, 'revenue') && <EstimatedBadge compact />}
            </div>
            <div>
              <strong style={{ color: '#ffffff' }}>HQ:</strong> {dash(getContactHeadquarters(contact) || hqLocation)}
              {isCrmFieldEstimated(contact, 'headquarters') && <EstimatedBadge compact />}
            </div>
            <div><strong style={{ color: '#ffffff' }}>Funding:</strong> {dash(contact.company_funding_stage)}</div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #2a2a2a', margin: '16px 0' }} />

          <TagPills tags={contact.tags || []} />
          <div style={{ marginTop: '12px', fontSize: '13px', color: '#999999' }}>
            <div><strong style={{ color: '#ffffff' }}>Event:</strong> {dash(contact.normalized_event_text || contact.event_name || contact.raw_event_text)}</div>
            <div style={{ marginTop: '6px' }}><strong style={{ color: '#ffffff' }}>Met:</strong> {formatDate(contact.meeting_date || contact.scanned_at)}</div>
          </div>
        </div>

        {/* MIDDLE — Intelligence */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          {(contact.ai_summary || contact.match_reason) && (
            <div style={CARD}>
              <div style={{ fontSize: '11px', color: '#999999', letterSpacing: '0.08em', marginBottom: '12px' }}>AI SUMMARY</div>
              {contact.ai_summary && (
                <div style={{ padding: '14px', borderLeft: '3px solid #00d4d4', background: '#242424', borderRadius: '0 8px 8px 0', fontSize: '14px', lineHeight: 1.6, color: '#ffffff', marginBottom: contact.match_reason ? '12px' : 0 }}>
                  {contact.ai_summary}
                </div>
              )}
              {contact.match_reason && (
                <p style={{ margin: 0, fontSize: '13px', color: '#999999', fontStyle: 'italic' }}>{contact.match_reason}</p>
              )}
            </div>
          )}

          <MatchScoreBreakdown contact={contact} score={score} />

          <div style={CARD}>
            <div style={{ fontSize: '11px', color: '#00d4d4', letterSpacing: '0.08em', marginBottom: '12px' }}>AI MESSAGES</div>
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
            {emailSubject && (
              <div style={{ fontSize: '12px', color: '#999999', marginBottom: '12px' }}>
                Email subject: <span style={{ color: '#ffffff' }}>{emailSubject}</span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {variants.map((variant) => {
                const anyChecked = variant.platforms.linkedin || variant.platforms.email || variant.platforms.whatsapp
                const linkedinLen = variant.text.length
                const whatsappLen = variant.text.length
                const linkedinOver = linkedinLen > 300
                const whatsappOver = whatsappLen > 160

                return (
                  <div
                    key={variant.id}
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
                        LinkedIn: {linkedinLen}/300
                      </span>
                      <span style={{ color: whatsappOver ? '#ef4444' : '#555555' }}>
                        WhatsApp: {whatsappLen}/160
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

          {(contact.linkedin_headline || contact.linkedin_summary || posts.length > 0 || skills.length > 0) && (
            <div style={CARD}>
              <LinkedInMismatchBanner contact={contact} onUpdated={setContact} compact />
              <div style={{ fontSize: '11px', color: '#999999', letterSpacing: '0.08em', marginBottom: '12px' }}>LINKEDIN INTELLIGENCE</div>
              {contact.linkedin_headline && <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#ffffff' }}>{contact.linkedin_headline}</p>}
              {contact.linkedin_summary && <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#999999', lineHeight: 1.5 }}>{contact.linkedin_summary}</p>}
              {posts.map((post, i) => (
                <div key={i} style={{ marginBottom: '10px', padding: '10px', background: '#242424', borderRadius: '8px' }}>
                  <p style={{ margin: 0, fontSize: '12px', color: '#ffffff' }}>{post.text}</p>
                  {post.date && <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#555555' }}>{formatDate(post.date)}</p>}
                </div>
              ))}
              {skills.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                  {skills.slice(0, 12).map((skill) => (
                    <span key={skill} style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '11px', background: 'rgba(0,212,212,0.1)', color: '#00d4d4', border: '1px solid rgba(0,212,212,0.25)' }}>{skill}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {(upcoming.length > 0 || past.length > 0 || speaking.length > 0) && (
            <div style={CARD}>
              <div style={{ fontSize: '11px', color: '#00d4d4', letterSpacing: '0.08em', marginBottom: '12px' }}>NEWS & EVENTS</div>
              {[...upcoming.map((e: ContactEvent) => ({ ...e, kind: 'Upcoming' })), ...past.map((e: ContactEvent) => ({ ...e, kind: 'Past' })), ...speaking.map((e: SpeakingEngagement) => ({ name: e.event, date: e.date, kind: 'Speaking', title: e.title }))].map((ev, i) => (
                <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '12px', paddingBottom: '12px', borderBottom: i < upcoming.length + past.length + speaking.length - 1 ? '1px solid #2a2a2a' : 'none' }}>
                  <div style={{ fontSize: '11px', color: '#555555', minWidth: '72px' }}>{formatDate(ev.date)}</div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#555555', marginBottom: '2px' }}>{ev.kind}</div>
                    <div style={{ fontSize: '13px', color: '#ffffff' }}>{ev.name}</div>
                    {'title' in ev && ev.title && <div style={{ fontSize: '12px', color: '#999999' }}>{ev.title}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT — CRM Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '340px', width: '100%', margin: '0 auto' }}>
          <div style={CARD}>
            <div style={{ fontSize: '11px', color: '#00d4d4', letterSpacing: '0.08em', marginBottom: '12px' }}>PIPELINE STATUS</div>
            <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {PIPELINE_STAGES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={saving}
                  onClick={() => setPipelineStage(s.id)}
                  style={{
                    flex: '1 1 auto',
                    minWidth: '44px',
                    padding: '6px 4px',
                    fontSize: '9px',
                    fontWeight: 700,
                    borderRadius: '6px',
                    border: stage === s.id ? `1px solid ${s.color}` : '1px solid #2a2a2a',
                    background: stage === s.id ? `${s.color}22` : '#242424',
                    color: stage === s.id ? s.color : '#555555',
                    cursor: 'pointer',
                  }}
                >
                  {s.label.replace(' ✓', '')}
                </button>
              ))}
            </div>

            <label style={{ display: 'block', fontSize: '11px', color: '#555555', marginBottom: '6px' }}>Lead status</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
              {LEAD_STATUSES.map((s) => (
                <button key={s} type="button" onClick={() => setLeadStatus(s)} style={{ padding: '6px 10px', borderRadius: '999px', fontSize: '11px', border: leadStatus === s ? '1px solid #00d4d4' : '1px solid #2a2a2a', background: leadStatus === s ? 'rgba(0,212,212,0.1)' : 'transparent', color: leadStatus === s ? '#00d4d4' : '#555555', cursor: 'pointer' }}>{s}</button>
              ))}
            </div>

            <label style={{ display: 'block', fontSize: '11px', color: '#555555', marginBottom: '6px' }}>Rating</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {RATINGS.map((r) => (
                <button key={r.id} type="button" onClick={() => setRating(r.id)} style={{ flex: 1, padding: '8px', borderRadius: '8px', fontSize: '11px', border: rating === r.id ? '1px solid #f0197d' : '1px solid #2a2a2a', background: rating === r.id ? 'rgba(240,25,125,0.1)' : 'transparent', color: rating === r.id ? '#f0197d' : '#555555', cursor: 'pointer' }}>{r.label}</button>
              ))}
            </div>
          </div>

          <div style={CARD}>
            <div style={{ fontSize: '11px', color: '#f0197d', letterSpacing: '0.08em', marginBottom: '12px' }}>DEAL INFORMATION</div>
            <label style={{ display: 'block', fontSize: '11px', color: '#555555', marginBottom: '4px' }}>Deal value ($)</label>
            <input type="number" value={dealValue} onChange={(e) => setDealValue(e.target.value)} style={{ width: '100%', marginBottom: '10px', background: '#242424', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '8px 12px', color: '#ffffff', fontSize: '13px' }} />
            <label style={{ display: 'block', fontSize: '11px', color: '#555555', marginBottom: '4px' }}>Expected close date</label>
            <input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} style={{ width: '100%', marginBottom: '10px', background: '#242424', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '8px 12px', color: '#ffffff', fontSize: '13px' }} />
            <label style={{ display: 'block', fontSize: '11px', color: '#555555', marginBottom: '4px' }}>Close probability (%)</label>
            <input type="number" value={closeProb} onChange={(e) => setCloseProb(e.target.value)} style={{ width: '100%', marginBottom: '10px', background: '#242424', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '8px 12px', color: '#ffffff', fontSize: '13px' }} />
            <label style={{ display: 'block', fontSize: '11px', color: '#555555', marginBottom: '4px' }}>Opportunity type</label>
            <input value={oppType} onChange={(e) => setOppType(e.target.value)} placeholder="New Business, Renewal…" style={{ width: '100%', marginBottom: '10px', background: '#242424', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '8px 12px', color: '#ffffff', fontSize: '13px' }} />
            <label style={{ display: 'block', fontSize: '11px', color: '#555555', marginBottom: '4px' }}>Next step</label>
            <input value={nextStep} onChange={(e) => setNextStep(e.target.value)} style={{ width: '100%', marginBottom: '14px', background: '#242424', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '8px 12px', color: '#ffffff', fontSize: '13px' }} />
            <button type="button" disabled={saving} onClick={saveDeal} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,#f0197d,#00d4d4)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Update Deal</button>
          </div>

          <div style={CARD}>
            <div style={{ fontSize: '11px', color: '#999999', letterSpacing: '0.08em', marginBottom: '12px' }}>ACTIVITY TIMELINE</div>
            <ActivityTimeline key={activityKey} contactId={contact.id} />
            <div style={{ marginTop: '16px' }}>
              <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a note…" style={{ width: '100%', marginBottom: '8px', background: '#242424', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '8px 12px', color: '#ffffff', fontSize: '13px' }} />
              <button type="button" disabled={saving || !noteText.trim()} onClick={addNote} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #2a2a2a', background: 'transparent', color: '#00d4d4', fontSize: '12px', cursor: 'pointer' }}>Add Note</button>
            </div>
          </div>

          <div style={CARD}>
            <div style={{ fontSize: '11px', color: '#00d4d4', letterSpacing: '0.08em', marginBottom: '12px' }}>QUICK ACTIONS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button type="button" onClick={() => router.push(`/contact/${contact.id}`)} style={{ padding: '12px', borderRadius: '8px', border: 'none', background: '#00d4d4', color: '#0f0f0f', fontWeight: 700, cursor: 'pointer' }}>Send Follow-up</button>
              {contact.email && (
                googleConnected ? (
                  <>
                    <button
                      type="button"
                      disabled={sendingGmail}
                      onClick={() => void handleQuickGmailSend()}
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'linear-gradient(135deg,#f0197d,#00d4d4)',
                        color: '#0f0f0f',
                        fontWeight: 700,
                        cursor: sendingGmail ? 'wait' : 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      {sendingGmail ? 'Sending…' : 'Send via Email (1-click)'}
                    </button>
                    <button
                      type="button"
                      onClick={handleQuickEmailOpen}
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
                    onClick={handleQuickEmailOpen}
                    style={{ padding: '12px', borderRadius: '8px', border: '1px solid #2a2a2a', background: '#242424', color: '#ffffff', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                  >
                    Open in email app
                  </button>
                )
              )}
              <button type="button" onClick={() => showToast('Meeting scheduler coming soon')} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #2a2a2a', background: '#242424', color: '#ffffff', cursor: 'pointer' }}>Schedule Meeting</button>
              <button type="button" onClick={() => handleExportClick('salesforce')} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #2a2a2a', background: '#242424', color: '#ffffff', cursor: 'pointer', fontSize: '13px' }}>Export to Salesforce</button>
              <button type="button" onClick={() => handleExportClick('hubspot')} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #2a2a2a', background: '#242424', color: '#ffffff', cursor: 'pointer', fontSize: '13px' }}>Export to HubSpot</button>
              <button type="button" disabled={saving} onClick={() => markOutcome('won')} style={{ padding: '12px', borderRadius: '8px', border: 'none', background: '#22c55e', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Mark as Won</button>
              <button type="button" disabled={saving} onClick={() => markOutcome('lost')} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', fontWeight: 700, cursor: 'pointer' }}>Mark as Lost</button>
              <button
                type="button"
                disabled={saving}
                onClick={deleteContact}
                onMouseEnter={() => setDeleteHover(true)}
                onMouseLeave={() => setDeleteHover(false)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #ef4444',
                  background: deleteHover ? 'rgba(239,68,68,0.1)' : 'transparent',
                  color: '#ef4444',
                  fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                }}
              >
                🗑️ Delete Contact
              </button>
            </div>
          </div>
        </div>
      </div>

      {showSendBar && (
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))',
          background: 'linear-gradient(to top, #0f0f0f 75%, transparent)',
          zIndex: 90,
          display: 'flex',
          alignItems: 'flex-end',
          gap: '10px',
        }}
      >
        <button
          type="button"
          onClick={() => setShowSendBar(false)}
          aria-label="Dismiss send bar"
          style={{
            flexShrink: 0,
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            border: '1px solid #2a2a2a',
            background: '#1a1a1a',
            color: '#999999',
            fontSize: '18px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ×
        </button>
        <button
          type="button"
          disabled={selectedSendCount === 0 || sendingGmail}
          onClick={handleSendSelected}
          style={{
            flex: 1,
            maxWidth: '640px',
            margin: '0 auto',
            display: 'block',
            padding: '16px 24px',
            borderRadius: '12px',
            border: 'none',
            background: selectedSendCount === 0
              ? '#2a2a2a'
              : 'linear-gradient(135deg,#f0197d,#00d4d4)',
            color: selectedSendCount === 0 ? '#555555' : '#0f0f0f',
            fontSize: '16px',
            fontWeight: 800,
            cursor: selectedSendCount === 0 ? 'not-allowed' : 'pointer',
            boxShadow: selectedSendCount === 0 ? 'none' : '0 8px 32px rgba(0,212,212,0.25)',
          }}
        >
          {sendingGmail ? 'Sending…' : sendButtonLabel}
          {selectedSendCount > 0 && (
            <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginTop: '2px', opacity: 0.85 }}>
              Send {selectedSendCount} message{selectedSendCount === 1 ? '' : 's'}
            </span>
          )}
        </button>
      </div>
      )}

      {toast && <Toast message={toast} />}
    </div>
  )
}
