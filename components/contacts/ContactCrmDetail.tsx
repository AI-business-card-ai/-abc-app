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
import type { ContactEvent, ScannedContact, SpeakingEngagement } from '@/lib/types'

const CARD = { background: '#141628', borderRadius: '12px', border: '1px solid #2a2d3e', padding: '20px' } as const
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
  if (score >= 41) return { bg: '#eab308', text: '#0d0f1a' }
  return { bg: '#6b7280', text: '#fff' }
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function InfoRow({ icon, label, href, children }: { icon: string; label: string; href?: string; children: ReactNode }) {
  const content = (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
      <span style={{ fontSize: '14px', width: '20px' }}>{icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '2px' }}>{label}</div>
        <div style={{ fontSize: '13px', color: '#f0f0ff', wordBreak: 'break-word' }}>{children}</div>
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

  const [dealValue, setDealValue] = useState('')
  const [closeDate, setCloseDate] = useState('')
  const [closeProb, setCloseProb] = useState('')
  const [oppType, setOppType] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [leadStatus, setLeadStatus] = useState('New')
  const [rating, setRating] = useState('Warm')

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
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
        const { data, error } = await supabase
          .from('scanned_contacts')
          .select('*')
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle()

        if (!active) return
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

  const applyContact = (c: ScannedContact) => {
    setContact(c)
    syncDealForm(c)
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

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      showToast('Copied')
    } catch {
      showToast('Copy failed')
    }
  }

  async function markSent(channel: 'LinkedIn' | 'Email' | 'WhatsApp', text: string) {
    if (!contact || !text) return
    setSaving(true)
    try {
      const { contact: updated } = await logMessageSent({ contactId: contact.id, channel, messageText: text })
      applyContact(updated)
      setActivityKey((k) => k + 1)
      showToast(`Marked as sent (${channel})`)
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

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00d4d4' }}>
        <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#00d4d4', borderRightColor: '#8b5cf6' }} />
      </div>
    )
  }

  if (notFound || !contact) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#8892b0' }}>
        <p style={{ marginBottom: '16px' }}>Contact not found</p>
        <Link href="/pipeline" style={{ color: '#00d4d4' }}>← Back to Pipeline</Link>
      </div>
    )
  }

  const posts = Array.isArray(contact.linkedin_posts) ? contact.linkedin_posts.slice(0, 3) : []
  const skills = Array.isArray(contact.linkedin_skills) ? contact.linkedin_skills : []
  const upcoming = Array.isArray(contact.events_upcoming) ? contact.events_upcoming : []
  const past = Array.isArray(contact.events_past) ? contact.events_past : []
  const speaking = Array.isArray(contact.speaking_engagements) ? contact.speaking_engagements : []

  return (
    <div style={{ background: '#0d0f1a', minHeight: '100vh', padding: '16px 16px 100px' }}>
      <Link href="/pipeline" style={{ display: 'inline-block', marginBottom: '20px', color: '#00d4d4', fontSize: '14px', textDecoration: 'none' }}>
        ← Pipeline
      </Link>

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
              <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#00d4d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 800, color: '#fff', marginBottom: '12px' }}>
                {initials}
              </div>
            )}
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#f0f0ff' }}>{dash(contact.name)}</h1>
            <p style={{ margin: '6px 0 12px', fontSize: '13px', color: '#8892b0' }}>
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

          <hr style={{ border: 'none', borderTop: '1px solid #2a2d3e', margin: '16px 0' }} />

          <InfoRow icon="✉️" label="Email" href={contact.email ? `mailto:${contact.email}` : undefined}>{dash(contact.email)}</InfoRow>
          <InfoRow icon="📞" label="Phone" href={contact.phone ? `tel:${contact.phone}` : undefined}>{dash(contact.phone)}</InfoRow>
          <InfoRow icon="💼" label="LinkedIn" href={contact.linkedin_url || undefined}>{dash(contact.linkedin_url)}</InfoRow>
          <InfoRow icon="🌐" label="Website" href={contact.website?.startsWith('http') ? contact.website : contact.website ? `https://${contact.website}` : undefined}>{dash(contact.website)}</InfoRow>

          <hr style={{ border: 'none', borderTop: '1px solid #2a2d3e', margin: '16px 0' }} />

          <div style={{ fontSize: '10px', color: '#00d4d4', letterSpacing: '0.08em', marginBottom: '10px' }}>COMPANY</div>
          <div style={{ fontSize: '13px', color: '#8892b0', lineHeight: 1.6 }}>
            <div><strong style={{ color: '#f0f0ff' }}>Industry:</strong> {dash(contact.industry)}</div>
            <div><strong style={{ color: '#f0f0ff' }}>Size:</strong> {dash(contact.company_size || contact.no_of_employees)}</div>
            <div><strong style={{ color: '#f0f0ff' }}>Revenue:</strong> {dash(contact.company_revenue || contact.annual_revenue)}</div>
            <div><strong style={{ color: '#f0f0ff' }}>HQ:</strong> {dash(hqLocation)}</div>
            <div><strong style={{ color: '#f0f0ff' }}>Funding:</strong> {dash(contact.company_funding_stage)}</div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #2a2d3e', margin: '16px 0' }} />

          <TagPills tags={contact.tags || []} />
          <div style={{ marginTop: '12px', fontSize: '13px', color: '#8892b0' }}>
            <div><strong style={{ color: '#f0f0ff' }}>Event:</strong> {dash(contact.lead_source || contact.event_name)}</div>
            <div style={{ marginTop: '6px' }}><strong style={{ color: '#f0f0ff' }}>Met:</strong> {formatDate(contact.meeting_date || contact.scanned_at)}</div>
          </div>
        </div>

        {/* MIDDLE — Intelligence */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          {(contact.ai_summary || contact.match_reason) && (
            <div style={CARD}>
              <div style={{ fontSize: '11px', color: '#8b5cf6', letterSpacing: '0.08em', marginBottom: '12px' }}>AI SUMMARY</div>
              {contact.ai_summary && (
                <div style={{ padding: '14px', borderLeft: '3px solid #8b5cf6', background: 'rgba(139,92,246,0.08)', borderRadius: '0 8px 8px 0', fontSize: '14px', lineHeight: 1.6, color: '#f0f0ff', marginBottom: contact.match_reason ? '12px' : 0 }}>
                  {contact.ai_summary}
                </div>
              )}
              {contact.match_reason && (
                <p style={{ margin: 0, fontSize: '13px', color: '#8892b0', fontStyle: 'italic' }}>{contact.match_reason}</p>
              )}
            </div>
          )}

          <div style={CARD}>
            <div style={{ fontSize: '11px', color: '#00d4d4', letterSpacing: '0.08em', marginBottom: '12px' }}>AI MESSAGES</div>
            {[
              { label: 'LinkedIn', color: '#00d4d4', text: contact.message_linkedin, channel: 'LinkedIn' as const },
              { label: 'Email', color: '#f0197d', text: contact.message_email, subject: contact.email_subject, channel: 'Email' as const },
              { label: 'WhatsApp', color: '#25D366', text: contact.message_whatsapp, channel: 'WhatsApp' as const },
            ].map((msg) => (
              <div key={msg.label} style={{ marginBottom: '12px', padding: '14px', borderRadius: '10px', background: '#1a1d2e', borderLeft: `3px solid ${msg.color}` }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: msg.color, marginBottom: '8px' }}>{msg.label}</div>
                {msg.subject && <div style={{ fontSize: '12px', color: '#8892b0', marginBottom: '6px' }}>Subject: {msg.subject}</div>}
                <p style={{ margin: '0 0 12px', fontSize: '13px', lineHeight: 1.5, color: '#f0f0ff', whiteSpace: 'pre-wrap' }}>{msg.text || '—'}</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" disabled={!msg.text} onClick={() => copyText(msg.subject ? `Subject: ${msg.subject}\n\n${msg.text}` : msg.text || '')} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #2a2d3e', background: 'transparent', color: '#8892b0', fontSize: '12px', cursor: 'pointer' }}>Copy</button>
                  <button type="button" disabled={!msg.text || saving} onClick={() => markSent(msg.channel, msg.text || '')} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: msg.color, color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Mark as Sent</button>
                </div>
              </div>
            ))}
          </div>

          {(contact.linkedin_headline || contact.linkedin_summary || posts.length > 0 || skills.length > 0) && (
            <div style={CARD}>
              <div style={{ fontSize: '11px', color: '#8b5cf6', letterSpacing: '0.08em', marginBottom: '12px' }}>LINKEDIN INTELLIGENCE</div>
              {contact.linkedin_headline && <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#f0f0ff' }}>{contact.linkedin_headline}</p>}
              {contact.linkedin_summary && <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#8892b0', lineHeight: 1.5 }}>{contact.linkedin_summary}</p>}
              {posts.map((post, i) => (
                <div key={i} style={{ marginBottom: '10px', padding: '10px', background: '#1a1d2e', borderRadius: '8px' }}>
                  <p style={{ margin: 0, fontSize: '12px', color: '#f0f0ff' }}>{post.text}</p>
                  {post.date && <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#6b7280' }}>{formatDate(post.date)}</p>}
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
                <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '12px', paddingBottom: '12px', borderBottom: i < upcoming.length + past.length + speaking.length - 1 ? '1px solid #2a2d3e' : 'none' }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', minWidth: '72px' }}>{formatDate(ev.date)}</div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#8b5cf6', marginBottom: '2px' }}>{ev.kind}</div>
                    <div style={{ fontSize: '13px', color: '#f0f0ff' }}>{ev.name}</div>
                    {'title' in ev && ev.title && <div style={{ fontSize: '12px', color: '#8892b0' }}>{ev.title}</div>}
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
                    border: stage === s.id ? `1px solid ${s.color}` : '1px solid #2a2d3e',
                    background: stage === s.id ? `${s.color}22` : '#1a1d2e',
                    color: stage === s.id ? s.color : '#6b7280',
                    cursor: 'pointer',
                  }}
                >
                  {s.label.replace(' ✓', '')}
                </button>
              ))}
            </div>

            <label style={{ display: 'block', fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>Lead status</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
              {LEAD_STATUSES.map((s) => (
                <button key={s} type="button" onClick={() => setLeadStatus(s)} style={{ padding: '6px 10px', borderRadius: '999px', fontSize: '11px', border: leadStatus === s ? '1px solid #00d4d4' : '1px solid #2a2d3e', background: leadStatus === s ? 'rgba(0,212,212,0.1)' : 'transparent', color: leadStatus === s ? '#00d4d4' : '#6b7280', cursor: 'pointer' }}>{s}</button>
              ))}
            </div>

            <label style={{ display: 'block', fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>Rating</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {RATINGS.map((r) => (
                <button key={r.id} type="button" onClick={() => setRating(r.id)} style={{ flex: 1, padding: '8px', borderRadius: '8px', fontSize: '11px', border: rating === r.id ? '1px solid #f0197d' : '1px solid #2a2d3e', background: rating === r.id ? 'rgba(240,25,125,0.1)' : 'transparent', color: rating === r.id ? '#f0197d' : '#6b7280', cursor: 'pointer' }}>{r.label}</button>
              ))}
            </div>
          </div>

          <div style={CARD}>
            <div style={{ fontSize: '11px', color: '#f0197d', letterSpacing: '0.08em', marginBottom: '12px' }}>DEAL INFORMATION</div>
            <label style={{ display: 'block', fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Deal value ($)</label>
            <input type="number" value={dealValue} onChange={(e) => setDealValue(e.target.value)} style={{ width: '100%', marginBottom: '10px', background: '#1a1d2e', border: '1px solid #2a2d3e', borderRadius: '8px', padding: '8px 12px', color: '#f0f0ff', fontSize: '13px' }} />
            <label style={{ display: 'block', fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Expected close date</label>
            <input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} style={{ width: '100%', marginBottom: '10px', background: '#1a1d2e', border: '1px solid #2a2d3e', borderRadius: '8px', padding: '8px 12px', color: '#f0f0ff', fontSize: '13px' }} />
            <label style={{ display: 'block', fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Close probability (%)</label>
            <input type="number" value={closeProb} onChange={(e) => setCloseProb(e.target.value)} style={{ width: '100%', marginBottom: '10px', background: '#1a1d2e', border: '1px solid #2a2d3e', borderRadius: '8px', padding: '8px 12px', color: '#f0f0ff', fontSize: '13px' }} />
            <label style={{ display: 'block', fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Opportunity type</label>
            <input value={oppType} onChange={(e) => setOppType(e.target.value)} placeholder="New Business, Renewal…" style={{ width: '100%', marginBottom: '10px', background: '#1a1d2e', border: '1px solid #2a2d3e', borderRadius: '8px', padding: '8px 12px', color: '#f0f0ff', fontSize: '13px' }} />
            <label style={{ display: 'block', fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Next step</label>
            <input value={nextStep} onChange={(e) => setNextStep(e.target.value)} style={{ width: '100%', marginBottom: '14px', background: '#1a1d2e', border: '1px solid #2a2d3e', borderRadius: '8px', padding: '8px 12px', color: '#f0f0ff', fontSize: '13px' }} />
            <button type="button" disabled={saving} onClick={saveDeal} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,#f0197d,#8b5cf6)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Update Deal</button>
          </div>

          <div style={CARD}>
            <div style={{ fontSize: '11px', color: '#8b5cf6', letterSpacing: '0.08em', marginBottom: '12px' }}>ACTIVITY TIMELINE</div>
            <ActivityTimeline key={activityKey} contactId={contact.id} />
            <div style={{ marginTop: '16px' }}>
              <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a note…" style={{ width: '100%', marginBottom: '8px', background: '#1a1d2e', border: '1px solid #2a2d3e', borderRadius: '8px', padding: '8px 12px', color: '#f0f0ff', fontSize: '13px' }} />
              <button type="button" disabled={saving || !noteText.trim()} onClick={addNote} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #2a2d3e', background: 'transparent', color: '#00d4d4', fontSize: '12px', cursor: 'pointer' }}>Add Note</button>
            </div>
          </div>

          <div style={CARD}>
            <div style={{ fontSize: '11px', color: '#00d4d4', letterSpacing: '0.08em', marginBottom: '12px' }}>QUICK ACTIONS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button type="button" onClick={() => router.push(`/contact/${contact.id}`)} style={{ padding: '12px', borderRadius: '8px', border: 'none', background: '#00d4d4', color: '#0d0f1a', fontWeight: 700, cursor: 'pointer' }}>Send Follow-up</button>
              <button type="button" onClick={() => showToast('Meeting scheduler coming soon')} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #2a2d3e', background: '#1a1d2e', color: '#f0f0ff', cursor: 'pointer' }}>Schedule Meeting</button>
              <a href="/api/export/csv?format=salesforce" style={{ padding: '12px', borderRadius: '8px', border: '1px solid #2a2d3e', background: '#1a1d2e', color: '#f0f0ff', textAlign: 'center', textDecoration: 'none', fontSize: '13px' }}>Export to Salesforce</a>
              <a href="/api/export/csv?format=hubspot" style={{ padding: '12px', borderRadius: '8px', border: '1px solid #2a2d3e', background: '#1a1d2e', color: '#f0f0ff', textAlign: 'center', textDecoration: 'none', fontSize: '13px' }}>Export to HubSpot</a>
              <button type="button" disabled={saving} onClick={() => markOutcome('won')} style={{ padding: '12px', borderRadius: '8px', border: 'none', background: '#22c55e', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Mark as Won</button>
              <button type="button" disabled={saving} onClick={() => markOutcome('lost')} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', fontWeight: 700, cursor: 'pointer' }}>Mark as Lost</button>
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', padding: '12px 20px', borderRadius: '999px', background: '#141628', border: '1px solid #00d4d4', color: '#00d4d4', fontSize: '13px', zIndex: 100 }}>
          {toast}
        </div>
      )}
    </div>
  )
}
