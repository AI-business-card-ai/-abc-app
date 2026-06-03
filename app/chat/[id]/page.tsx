'use client'

import { useEffect, useMemo, useState } from 'react'
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

  if (loading) return <div className="min-h-screen flex items-center justify-center text-[#6B7280]">Načítám...</div>
  if (error && !contact) return <div className="min-h-screen flex items-center justify-center text-[#6B7280] px-6 text-center">{error}</div>

  return (
    <div className="min-h-screen bg-[#07050E] flex flex-col">
      {/* TOP BAR */}
      <div className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b border-[#1A0E30] bg-[#07050E]/90" style={{ backdropFilter: 'blur(20px)' }}>
        <button onClick={() => router.back()} className="w-9 h-9 rounded-full border border-[#1A0E30] flex items-center justify-center text-[#6B7280]">
          <IconArrowLeft size={18} />
        </button>
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg,#7C3AED,#0EA5E9)' }}>{initials}</div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#F0EAFF]">{contact?.name ?? 'Kontakt'}</p>
          <p className="text-xs" style={{ color: replied ? '#34D399' : '#6B7280' }}>{replied ? '● Odpověděl' : '● Čeká'}</p>
        </div>
      </div>

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#6B7280]">Zatím žádné odeslané zprávy.</p>
        ) : (
          messages.map((m) => {
            const out = m.direction === 'out'
            return (
              <div key={m.id} className={`flex flex-col ${out ? 'self-end items-end' : 'self-start items-start'} max-w-[80%]`}>
                <div
                  className="px-3 py-2 text-sm"
                  style={out
                    ? { background: 'linear-gradient(135deg,#1A0A2E,#0A1428)', color: '#C4B5FD', borderRadius: '10px 10px 2px 10px' }
                    : { background: '#0D0A18', color: '#6A5098', borderRadius: '10px 10px 10px 2px' }}
                >
                  {m.body}
                </div>
                <span className="text-[10px] text-[#6B7280] mt-1">
                  {new Date(m.at).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })} · {m.channel}
                </span>
              </div>
            )
          })
        )}

        {/* SCHEDULED PANEL */}
        <div className="abc-card mx-0 p-3 mt-4 flex flex-col gap-2">
          <span className="text-[10px] text-[#3A2060] tracking-widest">PLÁNOVANÉ ZPRÁVY</span>
          {scheduled.length === 0 ? (
            <p className="text-xs text-[#6B7280]">Žádné naplánované follow-upy.</p>
          ) : (
            scheduled.map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full" style={s.status === 'sent' ? { background: '#7C3AED', boxShadow: '0 0 8px #7C3AED' } : { background: '#2A1A4A' }} />
                <div className="flex-1">
                  <p className="text-xs text-[#F0EAFF]">{CHANNELS.find((c) => c.key === s.message_type)?.label} · krok {s.step}</p>
                  <p className="text-[11px] text-[#6B7280]">{new Date(s.scheduled_at).toLocaleDateString('cs-CZ')}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* CHANNEL TABS */}
      <div className="px-4 flex gap-2 border-t border-[#1A0E30] pt-2">
        {CHANNELS.map((c) => (
          <button
            key={c.key}
            onClick={() => setChannel(c.key)}
            className="px-3 py-1 rounded-full text-xs"
            style={channel === c.key ? { borderColor: '#7C3AED', color: '#A78BFA', background: '#1A0A2E', border: '1px solid #7C3AED' } : { color: '#6B7280', border: '1px solid #1A0E30' }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* INPUT BAR */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-[#06040C] border-t border-[#1A0E30] p-3 flex gap-2 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Napsat zprávu..."
          className="flex-1 bg-[#0D0A18] border border-[#1A0E30] rounded-xl px-4 py-2.5 text-sm text-[#F0EAFF] outline-none placeholder:text-[#6B7280] focus:border-[#7C3AED]"
        />
        <motion.button whileTap={{ scale: 0.9 }} onClick={send} className="glow-btn w-10 h-10 rounded-xl flex items-center justify-center text-white">
          <IconSend size={18} />
        </motion.button>
      </div>
    </div>
  )
}
