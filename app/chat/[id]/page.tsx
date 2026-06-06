'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { IconArrowLeft, IconSend } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase-client'
import GradientAvatar from '@/components/ui/GradientAvatar'
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

  useEffect(() => {
    let active = true
    ;(async () => {
      const [{ data: c }, { data: seq }] = await Promise.all([
        supabase.from('scanned_contacts').select('*').eq('id', id).single(),
        supabase.from('followup_sequences').select('*').eq('contact_id', id).order('step', { ascending: true }),
      ])
      if (!active) return
      if (!c) {
        setError('Konverzace nenalezena.')
      } else {
        setContact(c as ScannedContact)
        const seqs = (seq as FollowupSequence[]) ?? []
        setSequences(seqs)
        setMessages(
          seqs.filter((s) => s.sent_at !== null).map((s) => ({
            id: s.id,
            direction: 'out' as const,
            body: s.message_body,
            channel: s.message_type,
            at: s.sent_at ?? s.scheduled_at,
          }))
        )
      }
      setLoading(false)
    })()
    return () => { active = false }
  }, [id, supabase])

  const initials = useMemo(() => {
    if (!contact?.name) return '?'
    return contact.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  }, [contact?.name])

  const replied = contact?.status === 'replied'
  const scheduled = sequences.filter((s) => s.status === 'scheduled')

  function send() {
    const body = draft.trim()
    if (!body) return
    setMessages((m) => [...m, { id: `local-${Date.now()}`, direction: 'out', body, channel, at: new Date().toISOString() }])
    setDraft('')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-7 h-7 rounded-full border-2 border-transparent border-t-primary border-r-secondary animate-spin" />
      </div>
    )
  }

  if (error && !contact) {
    return (
      <div className="min-h-screen flex items-center justify-center text-text-secondary px-6 text-center bg-bg">
        {error}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* TOP BAR */}
      <div
        className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b border-abc-border hero-radial"
        style={{ background: 'rgba(7, 5, 14, 0.92)', backdropFilter: 'blur(20px)' }}
      >
        <button onClick={() => router.back()} className="icon-btn shrink-0">
          <IconArrowLeft size={18} />
        </button>
        <GradientAvatar initials={initials} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{contact?.name ?? 'Kontakt'}</p>
          <p className="text-xs flex items-center gap-1" style={{ color: replied ? '#34D399' : '#3A2060' }}>
            <span
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{
                background: replied ? '#34D399' : '#3A2060',
                boxShadow: replied ? '0 0 6px #34D399' : undefined,
              }}
            />
            {replied ? 'Odpověděl' : 'Čeká'}
          </p>
        </div>
      </div>

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 pb-36">
        {messages.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted">Zatím žádné odeslané zprávy.</p>
            <p className="text-xs text-text-secondary mt-1">Napiš první zprávu níže.</p>
          </div>
        ) : (
          messages.map((m) => {
            const out = m.direction === 'out'
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex flex-col ${out ? 'self-end items-end' : 'self-start items-start'} max-w-[82%]`}
              >
                <div className={`px-3.5 py-2.5 text-sm leading-relaxed ${out ? 'chat-bubble-out' : 'chat-bubble-in'}`}>
                  {m.body}
                </div>
                <span className="text-[10px] text-muted mt-1 px-1">
                  {new Date(m.at).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })} · {m.channel}
                </span>
              </motion.div>
            )
          })
        )}

        {/* SCHEDULED PANEL */}
        <div className="abc-card p-3.5 mt-2 flex flex-col gap-2.5">
          <span className="abc-label">Plánované zprávy</span>
          {scheduled.length === 0 ? (
            <p className="text-xs text-text-secondary">Žádné naplánované follow-upy.</p>
          ) : (
            scheduled.map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={
                    s.status === 'sent'
                      ? { background: '#7C3AED', boxShadow: '0 0 8px #7C3AED' }
                      : { background: '#3A2060' }
                  }
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text-primary truncate">
                    {CHANNELS.find((c) => c.key === s.message_type)?.label} · krok {s.step}
                  </p>
                  <p className="text-[11px] text-muted">
                    {new Date(s.scheduled_at).toLocaleDateString('cs-CZ')}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* CHANNEL TABS + INPUT */}
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] border-t border-abc-border"
        style={{ background: 'rgba(6, 4, 12, 0.95)', backdropFilter: 'blur(16px)' }}
      >
        <div className="px-4 flex gap-2 pt-2.5">
          {CHANNELS.map((c) => (
            <button
              key={c.key}
              onClick={() => setChannel(c.key)}
              className={`abc-chip ${channel === c.key ? 'abc-chip-active' : ''}`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="p-3 flex gap-2 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Napsat zprávu..."
            className="abc-input flex-1 px-4 py-2.5 text-sm"
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={send}
            className="glow-btn w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0"
          >
            <IconSend size={18} />
          </motion.button>
        </div>
      </div>
    </div>
  )
}
