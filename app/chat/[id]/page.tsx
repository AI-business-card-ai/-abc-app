'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClientComponent } from '@/lib/supabase'
import MessageComposer from '@/components/chat/MessageComposer'
import type { FollowupSequence, ScannedContact } from '@/lib/types'

type Channel = 'linkedin' | 'email' | 'whatsapp'

const CHANNEL_META: Record<Channel, { label: string; color: string }> = {
  linkedin: { label: 'LinkedIn', color: '#0077B5' },
  email: { label: 'Email', color: '#f0197d' },
  whatsapp: { label: 'WhatsApp', color: '#25D366' },
}

interface ChatMessage {
  id: string
  body: string
  channel: Channel
  at: string
}

function buildHistory(contact: ScannedContact, seqs: FollowupSequence[]): ChatMessage[] {
  const msgs: ChatMessage[] = []

  if (contact.status === 'sent' || contact.status === 'replied') {
    if (contact.message_linkedin) {
      msgs.push({ id: 'contact-li', body: contact.message_linkedin, channel: 'linkedin', at: contact.scanned_at })
    }
    if (contact.message_email) {
      msgs.push({ id: 'contact-em', body: contact.message_email, channel: 'email', at: contact.scanned_at })
    }
    if (contact.message_whatsapp) {
      msgs.push({ id: 'contact-wa', body: contact.message_whatsapp, channel: 'whatsapp', at: contact.scanned_at })
    }
  }

  for (const s of seqs) {
    if (s.sent_at) {
      msgs.push({ id: s.id, body: s.message_body, channel: s.message_type, at: s.sent_at })
    }
  }

  return msgs.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
}

export default function ChatDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = useMemo(() => createClientComponent(), [])
  const id = String(params?.id ?? '')

  const [contact, setContact] = useState<ScannedContact | null>(null)
  const [sequences, setSequences] = useState<FollowupSequence[]>([])
  const [googleConnected, setGoogleConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const [{ data: c, error: cErr }, { data: seq }, { data: profile }] = await Promise.all([
      supabase.from('scanned_contacts').select('*').eq('id', id).eq('user_id', user.id).maybeSingle(),
      supabase.from('followup_sequences').select('*').eq('contact_id', id).order('step', { ascending: true }),
      supabase.from('abc_profiles').select('google_connected').eq('id', user.id).maybeSingle(),
    ])

    if (cErr || !c) {
      setNotFound(true)
      setContact(null)
      return
    }

    setContact(c as ScannedContact)
    setSequences((seq as FollowupSequence[]) ?? [])
    setGoogleConnected(Boolean(profile?.google_connected))
  }, [id, router, supabase])

  useEffect(() => {
    let active = true
    ;(async () => {
      await loadData()
      if (active) setLoading(false)
    })()
    return () => { active = false }
  }, [loadData])

  const initials = useMemo(() => {
    const name = contact?.name || '?'
    return name.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
  }, [contact?.name])

  const history = useMemo(
    () => (contact ? buildHistory(contact, sequences) : []),
    [contact, sequences]
  )

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f0f0f' }}>
        <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#00d4d4', borderRightColor: '#f0197d' }} />
      </div>
    )
  }

  if (notFound || !contact) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#999999', background: '#0f0f0f', minHeight: '100vh' }}>
        <p style={{ marginBottom: '16px' }}>Conversation not found</p>
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

  return (
    <div
      style={{
        background: '#0f0f0f',
        minHeight: '100vh',
        padding: '16px 16px 0',
        paddingBottom: 'calc(140px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <button
        type="button"
        onClick={() => router.back()}
        style={{ display: 'inline-block', marginBottom: '20px', color: '#00d4d4', fontSize: '14px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        ← Back
      </button>

      <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* CONTACT HEADER */}
        <div style={{ background: '#1a1a1a', borderRadius: '12px', border: '1px solid #2a2a2a', padding: '20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          {contact.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={contact.photo_url} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(0,212,212,0.3)', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#f0197d,#00d4d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
              {initials}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {contact.name || 'Unknown contact'}
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#999999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[contact.role, contact.company].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
        </div>

        {/* SENT MESSAGE HISTORY */}
        {history.length > 0 && (
          <div style={{ background: '#1a1a1a', borderRadius: '12px', border: '1px solid #2a2a2a', padding: '20px' }}>
            <div style={{ fontSize: '11px', color: '#999999', letterSpacing: '0.08em', marginBottom: '12px' }}>SENT MESSAGES</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {history.map((m) => {
                const meta = CHANNEL_META[m.channel]
                return (
                  <div
                    key={m.id}
                    style={{
                      background: '#242424',
                      border: '1px solid #2a2a2a',
                      borderLeft: `3px solid ${meta.color}`,
                      borderRadius: '8px',
                      padding: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', color: meta.color, textTransform: 'uppercase' }}>
                        {meta.label}
                      </span>
                      <span style={{ fontSize: '10px', color: '#555555' }}>
                        {new Date(m.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '13px', color: '#ffffff', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{m.body}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* AI MESSAGE COMPOSER */}
        <MessageComposer
          contact={contact}
          googleConnected={googleConnected}
          onContactUpdate={setContact}
        />
      </div>
    </div>
  )
}
