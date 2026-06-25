'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  IconArrowLeft,
  IconDots,
  IconMail,
  IconPhone,
  IconBrandLinkedin,
  IconCopy,
  IconDeviceMobile,
} from '@tabler/icons-react'
import { createClientComponent } from '@/lib/supabase'
import MatchScore, { scoreColors } from '@/components/ui/MatchScore'
import IntelligencePanel from '@/components/contact/IntelligencePanel'
import { hasDisplayValue } from '@/lib/research'
import { logCrmActivity } from '@/lib/crm-client'
import DealInformation from '@/components/crm/DealInformation'
import SalesforceFields from '@/components/crm/SalesforceFields'
import CommunicationHistory from '@/components/crm/CommunicationHistory'
import EnrichmentIndicator from '@/components/ui/EnrichmentIndicator'
import EnrichmentProgress from '@/components/ui/EnrichmentProgress'
import QuickCrmPanel from '@/components/mobile/QuickCrmPanel'
import CollapsibleSection from '@/components/mobile/CollapsibleSection'
import { useDevice } from '@/lib/hooks/useDevice'
import type { ScannedContact } from '@/lib/types'
import type { ActivityType } from '@/lib/crm'

type Tab = 'linkedin' | 'email' | 'whatsapp'

const TABS: { key: Tab; label: string }[] = [
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'email', label: 'Email' },
  { key: 'whatsapp', label: 'WhatsApp' },
]

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0 },
}

const cleanText = (text: string) =>
  text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/\[(\d+)\]/g, '')
    .trim()

function extractLocation(text: string | null | undefined): string | null {
  if (!text) return null
  const match = text.match(/##\s*LOCATION[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i)
  if (!match) return null
  const firstLine = match[1]
    .split('\n')
    .map((l) => cleanText(l.replace(/^[-•]\s*/, '')))
    .filter(Boolean)[0]
  return firstLine && hasDisplayValue(firstLine) ? firstLine : null
}

export default function ContactResultPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClientComponent()
  const id = String(params?.id ?? '')
  const device = useDevice()
  const isMobile = device === 'mobile'

  const [contact, setContact] = useState<ScannedContact | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tab, setTab] = useState<Tab>('linkedin')
  const [messages, setMessages] = useState<Record<Tab, string>>({ linkedin: '', email: '', whatsapp: '' })
  const [subject, setSubject] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [showFollowup, setShowFollowup] = useState(false)
  const [followupError, setFollowupError] = useState<string | null>(null)
  const [schedulingFollowup, setSchedulingFollowup] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [enriching, setEnriching] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [showDoneBanner, setShowDoneBanner] = useState(false)
  const [showFullDetail, setShowFullDetail] = useState(false)
  const [retryingEnrichment, setRetryingEnrichment] = useState(false)
  const [regeneratingMessages, setRegeneratingMessages] = useState(false)

  const toast = useCallback((msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 2500)
  }, [])

  const applyContactUpdate = useCallback((c: ScannedContact) => {
    setContact(c)
    setMessages({
      linkedin: c.message_linkedin ? cleanText(c.message_linkedin) : '',
      email: c.message_email ? cleanText(c.message_email) : '',
      whatsapp: c.message_whatsapp ? cleanText(c.message_whatsapp) : '',
    })
    setSubject(c.email_subject ? cleanText(c.email_subject) : '')
  }, [])

  const loadContact = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      setLoading(false)
      return
    }

    const { data, error: e } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (e) {
      setError(e.message)
      setContact(null)
    } else if (!data) {
      setError(null)
      setContact(null)
    } else {
      const c = data as ScannedContact
      applyContactUpdate(c)
      const status = c.enrichment_status || 'DONE'
      setShowFullDetail(status === 'DONE' || !c.enrichment_status)
      setShowDoneBanner(false)
      setError(null)
    }
    setLoading(false)
  }, [id, router, supabase, applyContactUpdate])

  useEffect(() => {
    loadContact()
  }, [loadContact, retryKey])

  useEffect(() => {
    if (!id) return

    const channel = supabase
      .channel(`contact-enrichment-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'scanned_contacts',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const updated = payload.new as ScannedContact
          setContact((prev) => {
            const prevStatus = prev?.enrichment_status || 'DONE'
            if (updated.enrichment_status === 'DONE' && prevStatus !== 'DONE') {
              setShowDoneBanner(true)
              setShowFullDetail(false)
              window.setTimeout(() => {
                setShowDoneBanner(false)
                setShowFullDetail(true)
              }, 3000)
            }
            return updated
          })
          setMessages({
            linkedin: updated.message_linkedin ? cleanText(updated.message_linkedin) : '',
            email: updated.message_email ? cleanText(updated.message_email) : '',
            whatsapp: updated.message_whatsapp ? cleanText(updated.message_whatsapp) : '',
          })
          setSubject(updated.email_subject ? cleanText(updated.email_subject) : '')
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, supabase])

  async function handleRetryEnrichment() {
    setRetryingEnrichment(true)
    try {
      const res = await fetch(`/api/enrich/retry/${id}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Retry failed')
      setShowFullDetail(false)
      toast('Retrying enrichment…')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed')
    } finally {
      setRetryingEnrichment(false)
    }
  }

  const location = useMemo(
    () => extractLocation(contact?.enriched_context),
    [contact?.enriched_context]
  )

  const linkedinIntel = useMemo(() => {
    if (!contact) return null

    const posts = Array.isArray(contact.linkedin_posts) ? contact.linkedin_posts : []
    const skills = Array.isArray(contact.linkedin_skills) ? contact.linkedin_skills : []
    const experience = Array.isArray(contact.linkedin_experience) ? contact.linkedin_experience : []

    const hasData =
      hasDisplayValue(contact.linkedin_headline) ||
      hasDisplayValue(contact.linkedin_summary) ||
      posts.some((p) => hasDisplayValue(p.text)) ||
      skills.some((s) => hasDisplayValue(s)) ||
      experience.some((e) => hasDisplayValue(e.title) || hasDisplayValue(e.company))

    if (!hasData) return null

    return {
      headline: hasDisplayValue(contact.linkedin_headline) ? contact.linkedin_headline : null,
      posts: posts.filter((p) => hasDisplayValue(p.text)).slice(0, 3),
      skills: skills.filter((s) => hasDisplayValue(s)).slice(0, 5),
      experience: experience
        .filter((e) => hasDisplayValue(e.title) || hasDisplayValue(e.company))
        .slice(0, 2),
    }
  }, [contact])

  const trackOutboundMessage = useCallback(
    (channel: 'LinkedIn' | 'Email' | 'WhatsApp', activityType: ActivityType) => {
      if (!contact || contact.status !== 'sent') return
      logCrmActivity({
        contactId: contact.id,
        activityType,
        activityDetail: `Message sent via ${channel} to ${contact.name}`,
      })
      setContact((prev) => {
        if (!prev) return prev
        const crm = prev.crm_status || 'NEW'
        return {
          ...prev,
          messages_sent: (prev.messages_sent || 0) + 1,
          last_message_type: channel,
          last_message_date: new Date().toISOString(),
          crm_status: crm === 'NEW' || crm === 'ENRICHED' ? 'CONTACTED' : crm,
        }
      })
    },
    [contact]
  )

  const openLinkedIn = () => {
    if (!contact) return
    if (contact.linkedin_url) {
      navigator.clipboard.writeText(messages.linkedin || '')
      window.open(contact.linkedin_url, '_blank')
      toast('✓ Message copied! Opening LinkedIn...')
    } else {
      navigator.clipboard.writeText(messages.linkedin || '')
      toast('✓ LinkedIn message copied!')
    }
    if (contact.status === 'sent') {
      trackOutboundMessage('LinkedIn', 'LINKEDIN_COPIED')
    } else {
      logCrmActivity({
        contactId: contact.id,
        activityType: 'LINKEDIN_COPIED',
        activityDetail: `LinkedIn message copied for ${contact.name}`,
      })
    }
  }

  const openEmail = () => {
    if (!contact) return
    const s = encodeURIComponent(subject || 'Hello')
    const body = encodeURIComponent(messages.email || '')
    window.open(`mailto:${contact.email ?? ''}?subject=${s}&body=${body}`)
    if (contact.status === 'sent') {
      trackOutboundMessage('Email', 'EMAIL_SENT')
    } else {
      logCrmActivity({
        contactId: contact.id,
        activityType: 'EMAIL_SENT',
        activityDetail: `Email draft opened for ${contact.name}`,
        metadata: { email: contact.email },
      })
    }
  }

  const openWhatsApp = () => {
    if (!contact) return
    const phone = contact.phone?.replace(/\D/g, '')
    const text = encodeURIComponent(messages.whatsapp || '')
    if (phone) window.open(`https://wa.me/${phone}?text=${text}`)
    else {
      navigator.clipboard.writeText(messages.whatsapp || '')
      toast('✓ WhatsApp message copied!')
    }
    if (contact.status === 'sent') {
      trackOutboundMessage('WhatsApp', 'WHATSAPP_OPENED')
    } else {
      logCrmActivity({
        contactId: contact.id,
        activityType: 'WHATSAPP_OPENED',
        activityDetail: `WhatsApp draft opened for ${contact.name}`,
        metadata: { phone: contact.phone },
      })
    }
  }

  const copyCurrentMessage = () => {
    navigator.clipboard.writeText(messages[tab] || '')
    toast('✓ Message copied!')
    if (contact && tab === 'linkedin') {
      logCrmActivity({
        contactId: contact.id,
        activityType: 'LINKEDIN_COPIED',
        activityDetail: `LinkedIn message copied for ${contact.name}`,
      })
    }
  }

  async function handleRegenerateMessages() {
    setRegeneratingMessages(true)
    try {
      const res = await fetch(`/api/enrich/messages/${id}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to regenerate messages')
      if (json.contact) applyContactUpdate(json.contact as ScannedContact)
      toast('Messages regenerated')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Regeneration failed')
    } finally {
      setRegeneratingMessages(false)
    }
  }

  async function handleEnrichMore() {
    if (!contact) return
    setEnriching(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [enrichRes, queueRes] = await Promise.all([
        fetch('/api/card/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactId: contact.id, userId: user.id }),
        }),
        fetch('/api/enrich/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactId: contact.id }),
        }),
      ])

      const enrichJson = await enrichRes.json()
      const queueJson = await queueRes.json()

      if (!enrichRes.ok && !queueRes.ok) {
        throw new Error(enrichJson.error || queueJson.error || 'Research failed.')
      }

      const updated = queueJson.contact || enrichJson.contact
      if (updated) applyContactUpdate(updated as ScannedContact)
      else setRetryKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Research failed.')
    } finally {
      setEnriching(false)
    }
  }

  const handleStarterClick = (text: string) => {
    setMessages((prev) => {
      const current = prev[tab]?.trim()
      const next = current ? `${current}\n\n${text}` : text
      return { ...prev, [tab]: next }
    })
    toast('✓ Added to message')
  }

  async function handleSend() {
    if (!contact) return
    setSending(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const res = await fetch('/api/card/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: contact.id,
          userId: user.id,
          messages: {
            linkedin: messages.linkedin,
            email: messages.email,
            whatsapp: messages.whatsapp,
          },
          emailSubject: subject,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Sending failed.')
      if (json.contact) setContact(json.contact as ScannedContact)
      logCrmActivity({
        contactId: contact.id,
        activityType: 'MESSAGE_GENERATED',
        activityDetail: `Outreach approved for ${contact.name}`,
      })
      setShowFollowup(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSending(false)
    }
  }

  async function scheduleFollowup(yes: boolean) {
    if (!contact) return
    setFollowupError(null)

    if (yes) {
      setSchedulingFollowup(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }

        const res = await fetch('/api/card/followup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactId: contact.id, userId: user.id }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.error || 'Could not schedule follow-up.')
      } catch (err) {
        setFollowupError(err instanceof Error ? err.message : 'Could not schedule follow-up.')
        return
      } finally {
        setSchedulingFollowup(false)
      }
    }

    setShowFollowup(false)
    router.push('/contacts')
  }

  async function archive() {
    if (!contact) return
    setMenuOpen(false)
    await supabase.from('scanned_contacts').update({ status: 'archived' }).eq('id', contact.id)
    router.push('/contacts')
  }

  const handleDelete = async () => {
    if (!contact) return
    setMenuOpen(false)
    if (!confirm('Delete this contact? This cannot be undone.')) return

    try {
      const { data: { user } } = await supabase.auth.getUser()

      const res = await fetch('/api/card/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: contact.id, userId: user?.id }),
      })

      if (res.ok) {
        router.push('/contacts')
      } else {
        setError('Failed to delete.')
      }
    } catch (err) {
      console.error(err)
      setError('Failed to delete.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg pb-44 px-4 pt-6 animate-pulse">
        <div className="flex items-center justify-between mb-6">
          <div className="w-9 h-9 rounded-full" style={{ background: '#1A0E30' }} />
          <div className="h-4 w-20 rounded" style={{ background: '#1A0E30' }} />
          <div className="w-9 h-9 rounded-full" style={{ background: '#1A0E30' }} />
        </div>
        <div className="abc-card p-4 flex items-center gap-3 mb-4">
          <div className="w-16 h-16 rounded-full" style={{ background: '#1A0E30' }} />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 rounded" style={{ background: '#1A0E30' }} />
            <div className="h-3 w-24 rounded" style={{ background: '#1A0E30' }} />
          </div>
        </div>
        <div className="abc-card p-4 h-32 mb-4" style={{ background: '#0D0A18' }} />
        <div className="abc-card p-4 h-40 mb-4" style={{ background: '#0D0A18' }} />
        <div className="abc-card p-4 h-40" style={{ background: '#0D0A18' }} />
      </div>
    )
  }

  if (error && !contact) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center bg-bg">
        <div className="abc-card p-6 max-w-sm w-full flex flex-col items-center gap-4">
          <p className="text-sm text-red-300">{error}</p>
          <button
            onClick={() => setRetryKey((k) => k + 1)}
            className="glow-btn rounded-xl text-white px-5 py-2.5 w-full"
          >
            Try again
          </button>
          <button
            onClick={() => router.push('/contacts')}
            className="ghost-btn rounded-xl px-5 py-2.5 w-full text-sm"
          >
            ← Back to contacts
          </button>
        </div>
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center bg-bg">
        <div className="abc-card p-6 max-w-sm w-full flex flex-col items-center gap-4">
          <p className="text-text-primary font-semibold">Contact not found</p>
          <p className="text-sm text-text-secondary">
            This contact doesn&apos;t exist or you don&apos;t have access to it.
          </p>
          <button
            onClick={() => router.push('/contacts')}
            className="glow-btn rounded-xl text-white px-5 py-2.5 w-full"
          >
            ← Back to contacts
          </button>
        </div>
      </div>
    )
  }

  const limit = tab === 'linkedin' ? 300 : tab === 'whatsapp' ? 160 : null
  const over = limit !== null && messages[tab].length > limit
  const score = contact.match_score ?? 0
  const sc = scoreColors(score)

  const snapshot: { icon: string; label: string; value: string }[] = [
    hasDisplayValue(contact.company_summary)
      ? { icon: '🏢', label: 'What they do', value: cleanText(contact.company_summary!) }
      : null,
    location ? { icon: '📍', label: 'Location', value: location } : null,
    hasDisplayValue(contact.company_size)
      ? { icon: '👥', label: 'Employees', value: contact.company_size! }
      : null,
    hasDisplayValue(contact.company_revenue)
      ? { icon: '💰', label: 'Revenue', value: contact.company_revenue! }
      : null,
    hasDisplayValue(contact.industry)
      ? { icon: '🏭', label: 'Industry', value: contact.industry! }
      : null,
  ].filter(Boolean) as { icon: string; label: string; value: string }[]

  const enrichmentStatus = contact.enrichment_status || 'DONE'
  const isEnriching = enrichmentStatus === 'PENDING' || enrichmentStatus === 'ENRICHING'
  const showDetailSections = showFullDetail && !showDoneBanner && !isEnriching

  return (
    <motion.div className="min-h-screen bg-bg pb-44">
      {/* TOP BAR */}
      <div className="hero-radial flex items-center justify-between px-4 pt-6 pb-4 relative sticky top-0 z-30 backdrop-blur-md" style={{ background: 'rgba(13,15,26,0.92)' }}>
        <button onClick={() => router.push('/contacts')} className="icon-btn">
          <IconArrowLeft size={18} />
        </button>
        <span className="text-sm font-semibold gradient-text">Result</span>
        <button onClick={() => setMenuOpen((o) => !o)} className="icon-btn">
          <IconDots size={18} />
        </button>
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.95 }}
              className="absolute right-4 top-16 z-20 abc-card overflow-hidden w-44"
              style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
            >
              <button onClick={() => { setMenuOpen(false) }} className="block w-full text-left px-4 py-2.5 text-sm text-text-primary hover:bg-[#1A0A2E] transition-colors">Edit</button>
              <button onClick={archive} className="block w-full text-left px-4 py-2.5 text-sm text-text-primary hover:bg-[#1A0A2E] transition-colors">Archive</button>
              <button
                onClick={handleDelete}
                className="block w-full text-left px-4 py-2.5 text-sm hover:bg-[#1A0A2E] transition-colors"
                style={{ color: '#EF4444' }}
              >
                🗑 Delete contact
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <motion.div variants={container} initial="hidden" animate="show" className="flex flex-col gap-4 px-4">
        {/* SECTION 1 — HEADER */}
        <motion.div variants={item} className="abc-card p-4 flex items-center gap-3">
          <div className="gradient-ring shrink-0">
            {contact.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={contact.photo_url}
                alt={contact.name || ''}
                className="w-16 h-16 rounded-full object-cover block"
              />
            ) : (
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold"
                style={{ background: 'linear-gradient(135deg, #1E0A3C, #0A1A2E)', color: '#F0EAFF' }}
              >
                {contact.name?.split(' ').map((n) => n[0]).join('').substring(0, 2) || '?'}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-text-primary truncate" style={{ fontSize: 20 }}>
              {contact.name ?? 'Unknown contact'}
            </h2>
            <p className="truncate" style={{ fontSize: 14, color: '#8B7AA8' }}>
              {[contact.role, contact.company].filter(Boolean).join(' · ') || '—'}
            </p>
            <div className="flex gap-1.5 mt-2">
              {contact.linkedin_url && (
                <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className="icon-btn w-9 h-9">
                  <IconBrandLinkedin size={17} />
                </a>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="icon-btn w-9 h-9">
                  <IconMail size={17} />
                </a>
              )}
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="icon-btn w-9 h-9">
                  <IconPhone size={17} />
                </a>
              )}
              <a
                href={`/api/contact/vcard/${contact.id}`}
                className="icon-btn w-9 h-9"
                aria-label="Save to Phone"
              >
                <IconDeviceMobile size={17} />
              </a>
            </div>
          </div>
        </motion.div>

        <AnimatePresence>
          {isEnriching && (
            <motion.div variants={item} key="enrichment-progress">
              <EnrichmentProgress step={contact.enrichment_step} status={contact.enrichment_status} />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showDoneBanner && (
            <motion.div
              key="enrichment-done"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="abc-card p-4 text-center"
              style={{ border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.08)' }}
            >
              <p className="text-sm font-semibold" style={{ color: '#22c55e' }}>
                ✓ Contact fully enriched
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {enrichmentStatus === 'ERROR' && (
          <motion.div variants={item} className="abc-card p-4 flex items-center justify-between gap-3">
            <EnrichmentIndicator contact={contact} onRetry={handleRetryEnrichment} retrying={retryingEnrichment} />
          </motion.div>
        )}

        {showDetailSections && (
          <>
        {/* SECTION 2 — MATCH SCORE */}
        <motion.div
          variants={item}
          className="abc-card p-5 flex flex-col items-center gap-3 relative overflow-hidden"
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: `radial-gradient(ellipse at top, ${sc.from}1F, transparent 60%)` }}
          />
          <MatchScore score={score} size={128} />
          <p className="text-sm text-center relative leading-relaxed" style={{ color: '#9090A0' }}>
            {contact.match_reason ? cleanText(contact.match_reason) : 'No relevance assessment yet.'}
          </p>
        </motion.div>

        {/* SECTION 3 — COMPANY SNAPSHOT */}
        {(snapshot.length > 0 || (contact.technologies && contact.technologies.length > 0)) && (
          <motion.div variants={item} className="abc-card p-4 flex flex-col gap-3">
            <span className="abc-label">Company Snapshot</span>
            <div className="flex flex-col gap-2.5">
              {snapshot.map((row) => (
                <div key={row.label} className="flex items-start gap-2.5">
                  <span className="text-base leading-5 shrink-0">{row.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] uppercase tracking-wide" style={{ color: '#3A2060' }}>{row.label}</p>
                    <p className="text-sm leading-snug" style={{ color: '#C9BEDE' }}>{row.value}</p>
                  </div>
                </div>
              ))}
            </div>
            {contact.technologies && contact.technologies.length > 0 && (
              <div className="flex items-start gap-2.5">
                <span className="text-base leading-5 shrink-0">⚡</span>
                <div className="flex flex-wrap gap-1.5">
                  {contact.technologies.map((tech) => (
                    <span
                      key={tech}
                      className="px-2 py-0.5 rounded-full text-xs"
                      style={{ background: '#1A0A2E', border: '0.5px solid #7C3AED44', color: '#A78BFA' }}
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* SECTION 3b — LINKEDIN INTELLIGENCE */}
        {linkedinIntel && (
          <motion.div variants={item} className="abc-card p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="abc-label">LinkedIn Intelligence</span>
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ border: '1px solid rgba(0,212,212,0.4)', color: '#00d4d4' }}
              >
                Source: Enrich Layer
              </span>
            </div>

            {linkedinIntel.headline && (
              <div
                className="rounded-xl px-3 py-2 text-sm font-medium"
                style={{
                  background: 'rgba(0,212,212,0.08)',
                  border: '1px solid rgba(0,212,212,0.25)',
                  color: '#00d4d4',
                }}
              >
                {linkedinIntel.headline}
              </div>
            )}

            {linkedinIntel.posts.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] uppercase tracking-wide" style={{ color: '#4a5168' }}>
                  Recent posts
                </p>
                {linkedinIntel.posts.map((post, idx) => (
                  <div
                    key={`${post.date}-${idx}`}
                    className="rounded-lg px-3 py-2"
                    style={{ background: '#1c1f35', border: '1px solid rgba(139,92,246,0.12)' }}
                  >
                    <p className="text-sm leading-snug" style={{ color: '#8892b0' }}>
                      {post.text}
                    </p>
                    {post.date && !Number.isNaN(Date.parse(post.date)) && (
                      <p className="text-[10px] mt-1" style={{ color: '#4a5168' }}>
                        {new Date(post.date).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {linkedinIntel.skills.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wide mb-2" style={{ color: '#4a5168' }}>
                  Top skills
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {linkedinIntel.skills.map((skill) => (
                    <span
                      key={skill}
                      className="px-2 py-0.5 rounded-full text-xs"
                      style={{
                        background: 'rgba(139,92,246,0.12)',
                        border: '1px solid rgba(139,92,246,0.25)',
                        color: '#a78bfa',
                      }}
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {linkedinIntel.experience.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wide mb-2" style={{ color: '#4a5168' }}>
                  Career timeline
                </p>
                <div className="flex flex-col gap-2">
                  {linkedinIntel.experience.map((exp, idx) => (
                    <div key={`${exp.company}-${exp.title}-${idx}`} className="flex gap-2">
                      <div
                        className="w-0.5 shrink-0 rounded-full"
                        style={{ background: 'linear-gradient(180deg, #00d4d4, #8b5cf6)' }}
                      />
                      <div>
                        <p className="text-sm font-semibold" style={{ color: '#f0f0ff' }}>
                          {exp.title}
                        </p>
                        <p className="text-xs" style={{ color: '#8892b0' }}>
                          {exp.company}
                          {exp.duration ? ` · ${exp.duration}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* SECTION 4 — INTELLIGENCE + CRM SIDEBAR */}
        <div className={`gap-4 items-start ${isMobile ? 'flex flex-col' : 'grid grid-cols-1 xl:grid-cols-[1fr_340px]'}`}>
          <motion.div variants={item} className={`flex flex-col gap-4 min-w-0 ${isMobile ? 'order-1' : ''}`}>
            {isMobile ? (
              <CollapsibleSection title="Intelligence" icon="✨" defaultOpen={false}>
                <IntelligencePanel
                  contact={contact}
                  onStarterClick={handleStarterClick}
                  onResearchMore={handleEnrichMore}
                  researching={enriching}
                />
              </CollapsibleSection>
            ) : (
              <IntelligencePanel
                contact={contact}
                onStarterClick={handleStarterClick}
                onResearchMore={handleEnrichMore}
                researching={enriching}
              />
            )}

            {/* SECTION 5 — MESSAGES */}
            <div className="abc-card p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="abc-label">Messages</span>
            <button
              type="button"
              onClick={handleRegenerateMessages}
              disabled={regeneratingMessages}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-opacity disabled:opacity-40"
              style={{ border: '0.5px solid #1A0E30', color: '#A78BFA' }}
            >
              {regeneratingMessages ? 'Regenerating…' : '🔄 Regenerate messages'}
            </button>
          </div>

          <div className="flex border-b border-abc-border">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="relative flex-1 pb-2.5 text-sm font-medium transition-colors"
                style={{ color: tab === t.key ? '#F0EAFF' : '#3A2060' }}
              >
                {t.label}
                {tab === t.key && (
                  <motion.span
                    layoutId="msg-underline"
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-gradient-text"
                    style={{ boxShadow: '0 0 6px rgba(167,139,250,0.5)' }}
                  />
                )}
              </button>
            ))}
          </div>

          {tab === 'email' && (
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
              className="abc-input px-3 py-2.5 text-base"
            />
          )}

          <textarea
            value={messages[tab]}
            onChange={(e) => setMessages((m) => ({ ...m, [tab]: e.target.value }))}
            className="abc-input px-3 py-2.5 text-base min-h-[120px] resize-none"
          />

          <div className="flex items-center justify-between">
            <button
              onClick={copyCurrentMessage}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
              style={{ border: '0.5px solid #1A0E30', color: '#A78BFA' }}
            >
              <IconCopy size={14} /> Copy
            </button>
            {limit !== null && (
              <div className="text-right text-xs" style={{ color: over ? '#EF4444' : '#3A2060' }}>
                {messages[tab].length}/{limit}
              </div>
            )}
          </div>
            </div>

            {/* SECTION 6 — ACTIONS */}
            <div className="flex flex-col gap-2">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleSend}
            disabled={sending}
            className={`glow-btn w-full rounded-xl text-white font-semibold py-3.5 ${sending ? 'opacity-40' : ''}`}
          >
            {sending ? 'Sending...' : '✅ Approve & Send'}
          </motion.button>

          <div className="grid grid-cols-3 gap-2 mt-1">
            <button
              onClick={openLinkedIn}
              className="rounded-xl py-2.5 text-xs font-semibold text-white flex items-center justify-center gap-1"
              style={{ background: '#0077B5' }}
            >
              🔗 LinkedIn
            </button>
            <button
              onClick={openEmail}
              className="rounded-xl py-2.5 text-xs font-semibold text-white flex items-center justify-center gap-1"
              style={{ background: '#059669' }}
            >
              ✉ Email
            </button>
            <button
              onClick={openWhatsApp}
              className="rounded-xl py-2.5 text-xs font-semibold text-white flex items-center justify-center gap-1"
              style={{ background: '#25D366' }}
            >
              💬 WhatsApp
            </button>
          </div>

          <button
            onClick={() => router.push('/contacts')}
            className="ghost-btn w-full py-2.5 text-sm mt-1"
          >
            Skip
          </button>
            </div>
          </motion.div>

          <motion.div variants={item} className={`flex flex-col gap-4 xl:sticky xl:top-4 ${isMobile ? 'order-2' : ''}`}>
            {isMobile && (
              <>
                <QuickCrmPanel contact={contact} onUpdated={applyContactUpdate} />
              </>
            )}
            <DealInformation contact={contact} onUpdated={applyContactUpdate} />
            <SalesforceFields contact={contact} onUpdated={applyContactUpdate} />
            <CommunicationHistory contact={contact} onUpdated={applyContactUpdate} />
          </motion.div>
        </div>
          </>
        )}

        {error && (
          <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
            {error}
          </p>
        )}
      </motion.div>

      {/* FOLLOW-UP MODAL */}
      <AnimatePresence>
        {showFollowup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-end justify-center"
            style={{ background: 'rgba(7,5,14,0.75)', backdropFilter: 'blur(4px)' }}
          >
            <motion.div
              initial={{ y: 48 }}
              animate={{ y: 0 }}
              exit={{ y: 48 }}
              className="w-full max-w-[430px] rounded-t-2xl border-t border-abc-border bg-card p-6"
              style={{ boxShadow: '0 -8px 40px rgba(124,58,237,0.15)' }}
            >
              <div className="w-10 h-1 rounded-full bg-abc-border mx-auto mb-5" />
              <h3 className="font-bold text-text-primary mb-1">Schedule a follow-up?</h3>
              <p className="text-sm text-text-secondary mb-5 leading-relaxed">
                We&apos;ll create a 3-step sequence (LinkedIn +1d, Email +3d, WhatsApp +7d).
              </p>
              {followupError && (
                <p className="text-sm text-red-300 mb-3">{followupError}</p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => scheduleFollowup(true)}
                  disabled={schedulingFollowup}
                  className={`glow-btn flex-1 rounded-xl text-white py-3 font-semibold ${schedulingFollowup ? 'opacity-40' : ''}`}
                >
                  {schedulingFollowup ? 'Scheduling...' : 'Yes, schedule'}
                </button>
                <button
                  onClick={() => scheduleFollowup(false)}
                  disabled={schedulingFollowup}
                  className="ghost-btn flex-1 py-3"
                >
                  No
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed left-1/2 -translate-x-1/2 bottom-24 z-50 rounded-xl px-4 py-2.5 text-sm font-medium"
            style={{ background: '#16A34A', color: '#fff', boxShadow: '0 8px 24px rgba(22,163,74,0.4)' }}
          >
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
