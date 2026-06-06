'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { IconArrowLeft, IconSend } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase-client'
import type { FollowupSequence, ScannedContact } from '@/lib/types'

type Channel = 'linkedin' | 'email' | 'whatsapp'

const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'email', label: 'Email' },
  { key: 'whatsapp', label: 'WhatsApp' },
]

interface ChatMessage {
  id: string
  direction: 'in' | 'out'
  body: string
  channel: Channel
  at: string
}

const chipStyle = (active: boolean): React.CSSProperties =>
  active
    ? { border: '0.5px solid #7C3AED', color: '#A78BFA', background: '#1A0A2E' }
    : { border: '0.5px solid #1A0E30', color: '#3A2060', background: 'transparent' }

function buildMessages(contact: ScannedContact, seqs: FollowupSequence[]): ChatMessage[] {
  const msgs: ChatMessage[] = []

  if (contact.status === 'sent' || contact.status === 'replied') {
    if (contact.message_linkedin) {
      msgs.push({
        id: `contact-li`,
        direction: 'out',
        body: contact.message_linkedin,
        channel: 'linkedin',
        at: contact.scanned_at,
      })
    }
    if (contact.message_email) {
      msgs.push({
        id: `contact-em`,
        direction: 'out',
        body: contact.message_email,
        channel: 'email',
        at: contact.scanned_at,
      })
    }
    if (contact.message_whatsapp) {
      msgs.push({
        id: `contact-wa`,
        direction: 'out',
        body: contact.message_whatsapp,
        channel: 'whatsapp',
        at: contact.scanned_at,
      })
    }
  }

  for (const s of seqs) {
    if (s.sent_at) {
      msgs.push({
        id: s.id,
        direction: 'out',
        body: s.message_body,
        channel: s.message_type,
        at: s.sent_at,
      })
    }
  }

  return msgs.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
}

export default function ChatPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const id = String(params?.id ?? '')

  const [contact, setContact] = useState<ScannedContact | null>(null)
  const [sequences, setSequences] = useState<FollowupSequence[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [channel, setChannel] = useState<Channel>('linkedin')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const loadData = useCallback(async () => {
    const [{ data: c, error: cErr }, { data: seq, error: sErr }] = await Promise.all([
      supabase.from('scanned_contacts').select('*').eq('id', id).single(),
      supabase.from('followup_sequences').select('*').eq('contact_id', id).order('step', { ascending: true }),
    ])

    if (cErr || !c) {
      setError('Konverzace nenalezena.')
      setContact(null)
      setSequences([])
      setMessages([])
      return
    }

    const contactData = c as ScannedContact
    const seqs = (seq as FollowupSequence[]) ?? []
    setContact(contactData)
    setSequences(seqs)
    setMessages(buildMessages(contactData, seqs))
    setError(sErr?.message ?? null)
  }, [id, supabase])

  useEffect(() => {
    let active = true
    ;(async () => {
      await loadData()
      if (active) setLoading(false)
    })()
    return () => { active = false }
  }, [loadData])

  const initials = useMemo(() => {
    if (!contact?.name) return '?'
    return contact.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  }, [contact?.name])

  const replied = contact?.status === 'replied'
  const scheduled = sequences.filter((s) => s.status === 'scheduled')
  const sent = sequences.filter((s) => s.status === 'sent')

  async function send() {
    const body = draft.trim()
    if (!body || !contact) return
    setSending(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const nextStep = sequences.length > 0 ? Math.max(...sequences.map((s) => s.step)) + 1 : 1
      const now = new Date().toISOString()

      const { data, error: insertError } = await supabase
        .from('followup_sequences')
        .insert({
          contact_id: id,
          user_id: user.id,
          step: nextStep,
          message_type: channel,
          message_body: body,
          scheduled_at: now,
          sent_at: now,
          status: 'sent',
        })
        .select()
        .single()

      if (insertError) throw new Error(insertError.message)

      const row = data as FollowupSequence
      setSequences((prev) => [...prev, row])
      setMessages((m) => [
        ...m,
        { id: row.id, direction: 'out', body, channel, at: row.sent_at ?? now },
      ])
      setDraft('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Odeslání selhalo.')
    } finally {
      setSending(false)
    }
  }

  function statusText() {
    if (replied) return '● Odpověděl dnes'
    if (contact?.status === 'sent') return '● Odesláno'
    return '● Čeká na odpověď'
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#07050E' }}>
        <div className="w-7 h-7 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#7C3AED', borderRightColor: '#0EA5E9' }} />
      </div>
    )
  }

  if (error && !contact) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center" style={{ background: '#07050E', color: '#3A2060' }}>
        {error}
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#07050E' }}>
      <div
        className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3"
        style={{ background: 'linear-gradient(180deg, #0A0614, #08060F)', borderBottom: '0.5px solid #1A0E30' }}
      >
        <button onClick={() => router.back()} aria-label="Zpět">
          <IconArrowLeft size={20} style={{ color: '#2A1A4A' }} />
        </button>
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
          style={{ background: 'linear-gradient(135deg, #7C3AED, #0EA5E9)' }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: '#F0EAFF' }}>{contact?.name ?? 'Kontakt'}</p>
          <p className="text-xs" style={{ color: replied || contact?.status === 'sent' ? '#A78BFA' : '#3A2060' }}>
            {statusText()}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 pb-36">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm" style={{ color: '#3A2060' }}>Zatím žádné zprávy.</p>
        ) : (
          messages.map((m) => {
            const out = m.direction === 'out'
            return (
              <div
                key={m.id}
                className={`flex flex-col ${out ? 'self-end items-end' : 'self-start items-start'} max-w-[88%]`}
              >
                <div
                  className="px-3 py-2 text-sm leading-relaxed"
                  style={
                    out
                      ? {
                          background: 'linear-gradient(135deg, #1A0A2E, #0A1428)',
                          color: '#C4B5FD',
                          border: '0.5px solid #2A1A4A',
                          borderRadius: '10px 10px 2px 10px',
                        }
                      : {
                          background: '#0D0A18',
                          color: '#6A5098',
                          border: '0.5px solid #1A0E30',
                          borderRadius: '10px 10px 10px 2px',
                        }
                  }
                >
                  {m.body}
                </div>
                <span className="mt-1 px-1" style={{ fontSize: '7px', color: '#2A1A4A' }}>
                  {new Date(m.at).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })} · {m.channel}
                </span>
              </div>
            )
          })
        )}

        <div
          className="mt-2 px-4 py-3 -mx-4"
          style={{ background: '#06040C', borderTop: '0.5px solid #1A0E30' }}
        >
          <span className="block tracking-widest uppercase mb-2" style={{ fontSize: '8px', color: '#3A2060' }}>
            PLÁNOVANÉ ZPRÁVY
          </span>
          {scheduled.length === 0 && sent.length === 0 ? (
            <p className="text-xs" style={{ color: '#3A2060' }}>Žádné naplánované follow-upy.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {[...scheduled, ...sent].map((s) => {
                const isSent = s.status === 'sent'
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded-lg px-3 py-2"
                    style={{ background: '#0D0A18', border: '0.5px solid #1A0E30' }}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={
                        isSent
                          ? { background: '#A78BFA', boxShadow: '0 0 8px #A78BFA' }
                          : { background: '#1A0E30' }
                      }
                    />
                    <span className="text-xs flex-1" style={{ color: '#3A2060' }}>
                      {CHANNELS.find((c) => c.key === s.message_type)?.label} · krok {s.step}
                    </span>
                    <span className="text-[10px]" style={{ color: '#3A2060' }}>
                      {isSent ? 'Odesláno' : new Date(s.scheduled_at).toLocaleDateString('cs-CZ')}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {error && contact && (
          <p className="text-sm text-red-300 text-center">{error}</p>
        )}
      </div>

      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px]"
        style={{ background: '#06040C', borderTop: '0.5px solid #1A0E30' }}
      >
        <div className="px-4 pb-2 pt-2 flex gap-2">
          {CHANNELS.map((c) => (
            <button
              key={c.key}
              onClick={() => setChannel(c.key)}
              className="px-3 py-1 rounded-full text-xs"
              style={chipStyle(channel === c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="p-3 flex gap-2 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !sending && send()}
            placeholder="Napsat zprávu..."
            disabled={sending}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none disabled:opacity-50"
            style={{ background: '#0D0A18', border: '0.5px solid #1A0E30', color: '#F0EAFF' }}
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={send}
            disabled={sending || !draft.trim()}
            className="glow-btn w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 disabled:opacity-40"
          >
            <IconSend size={18} />
          </motion.button>
        </div>
      </div>
    </div>
  )
}
