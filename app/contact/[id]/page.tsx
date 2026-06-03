'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  IconArrowLeft,
  IconDots,
  IconMail,
  IconPhone,
  IconBrandLinkedin,
  IconBuilding,
} from '@tabler/icons-react'
import { createClient } from '@/lib/supabase-client'
import MatchScore from '@/components/ui/MatchScore'
import type { ScannedContact } from '@/lib/types'

type Tab = 'linkedin' | 'email' | 'whatsapp'

const TABS: { key: Tab; label: string }[] = [
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'email', label: 'Email' },
  { key: 'whatsapp', label: 'WhatsApp' },
]

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
}
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
}

export default function ContactResultPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const id = String(params?.id ?? '')

  const [contact, setContact] = useState<ScannedContact | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tab, setTab] = useState<Tab>('linkedin')
  const [messages, setMessages] = useState<Record<Tab, string>>({ linkedin: '', email: '', whatsapp: '' })
  const [subject, setSubject] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [showFollowup, setShowFollowup] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data, error: e } = await supabase
        .from('scanned_contacts')
        .select('*')
        .eq('id', id)
        .single()
      if (!active) return
      if (e || !data) {
        setError('Kontakt nenalezen.')
      } else {
        const c = data as ScannedContact
        setContact(c)
        setMessages({
          linkedin: c.message_linkedin ?? '',
          email: c.message_email ?? '',
          whatsapp: c.message_whatsapp ?? '',
        })
        setSubject(c.email_subject ?? '')
      }
      setLoading(false)
    })()
    return () => { active = false }
  }, [id, supabase])

  const initials = useMemo(() => {
    if (!contact?.name) return '?'
    return contact.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  }, [contact?.name])

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
        body: JSON.stringify({ contactId: contact.id, messageType: tab, messageBody: messages[tab], userId: user.id }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Odeslání selhalo.')
      setShowFollowup(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Něco se pokazilo.')
    } finally {
      setSending(false)
    }
  }

  async function scheduleFollowup(yes: boolean) {
    if (!contact) { router.push('/contacts'); return }
    if (yes) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await fetch('/api/card/followup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contactId: contact.id, userId: user.id }),
          })
        }
      } catch { /* non-blocking */ }
    }
    router.push('/contacts')
  }

  async function archive() {
    if (!contact) return
    await supabase.from('scanned_contacts').update({ status: 'archived' }).eq('id', contact.id)
    router.push('/contacts')
  }

  async function remove() {
    if (!contact) return
    await supabase.from('scanned_contacts').delete().eq('id', contact.id)
    router.push('/contacts')
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-[#6B7280]">Načítám...</div>
  }

  if (error && !contact) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-[#6B7280]">{error}</p>
        <button onClick={() => router.push('/contacts')} className="glow-btn rounded-xl text-white px-5 py-2.5">Zpět do kartotéky</button>
      </div>
    )
  }

  if (!contact) return null

  const limit = tab === 'linkedin' ? 300 : tab === 'whatsapp' ? 160 : null
  const over = limit !== null && messages[tab].length > limit

  return (
    <div className="min-h-screen bg-[#07050E] pb-44">
      {/* TOP BAR */}
      <div className="flex items-center justify-between px-4 pt-6 pb-4 relative">
        <button onClick={() => router.push('/contacts')} className="w-9 h-9 rounded-full border border-[#1A0E30] flex items-center justify-center text-[#6B7280]">
          <IconArrowLeft size={18} />
        </button>
        <span className="text-sm font-semibold">Výsledek</span>
        <button onClick={() => setMenuOpen((o) => !o)} className="w-9 h-9 rounded-full border border-[#1A0E30] flex items-center justify-center text-[#6B7280]">
          <IconDots size={18} />
        </button>
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="absolute right-4 top-16 z-20 abc-card overflow-hidden w-40"
            >
              <button onClick={() => { setMenuOpen(false); setTab(tab) }} className="block w-full text-left px-4 py-2.5 text-sm text-[#F0EAFF] hover:bg-[#1A0A2E]">Upravit</button>
              <button onClick={archive} className="block w-full text-left px-4 py-2.5 text-sm text-[#F0EAFF] hover:bg-[#1A0A2E]">Archivovat</button>
              <button onClick={remove} className="block w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-[#1A0A2E]">Smazat</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <motion.div variants={container} initial="hidden" animate="show" className="flex flex-col gap-4 px-4">
        {/* HERO */}
        <motion.div variants={item} className="abc-card p-4 flex items-center gap-3">
          <div className="rounded-full p-[2px]" style={{ background: 'linear-gradient(135deg,#7C3AED,#0EA5E9)' }}>
            <div className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-lg font-bold text-[#F0EAFF]" style={{ background: '#1A0A2E' }}>
              {initials}
            </div>
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-[#F0EAFF]">{contact.name ?? 'Neznámý kontakt'}</h2>
            <p className="text-xs text-[#6B7280]">{[contact.role, contact.company].filter(Boolean).join(' · ') || '—'}</p>
          </div>
          <div className="flex gap-2">
            {contact.email && <a href={`mailto:${contact.email}`} className="w-8 h-8 rounded-full border border-[#1A0E30] flex items-center justify-center text-[#6B7280]"><IconMail size={16} /></a>}
            {contact.phone && <a href={`tel:${contact.phone}`} className="w-8 h-8 rounded-full border border-[#1A0E30] flex items-center justify-center text-[#6B7280]"><IconPhone size={16} /></a>}
            {contact.linkedin_url && <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-full border border-[#1A0E30] flex items-center justify-center text-[#6B7280]"><IconBrandLinkedin size={16} /></a>}
          </div>
        </motion.div>

        {/* MATCH SCORE */}
        <motion.div variants={item} className="abc-card p-4 flex items-center gap-4">
          <MatchScore score={contact.match_score ?? 0} />
          <div className="flex-1">
            <p className="text-[10px] tracking-widest text-[#3A2060]">MATCH SCORE</p>
            <p className="text-sm text-[#6B7280] mt-1">{contact.match_reason ?? 'Bez vyhodnocení relevance.'}</p>
          </div>
        </motion.div>

        {/* COMPANY */}
        <motion.div variants={item} className="abc-card p-4 flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <IconBuilding size={20} className="text-[#0EA5E9] mt-0.5" />
            <p className="text-sm text-[#6B7280] flex-1">{contact.company_summary ?? 'Bez popisu firmy.'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {contact.industry && <span className="rounded-full border border-[#1A0E30] px-3 py-1 text-xs text-[#6B7280]">{contact.industry}</span>}
            {contact.company_size && <span className="rounded-full border border-[#1A0E30] px-3 py-1 text-xs text-[#6B7280]">{contact.company_size}</span>}
          </div>
        </motion.div>

        {/* MESSAGES */}
        <motion.div variants={item} className="abc-card p-4 flex flex-col gap-3">
          <div className="flex">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className="relative flex-1 pb-2 text-sm font-medium" style={{ color: tab === t.key ? '#F0EAFF' : '#6B7280' }}>
                {t.label}
                {tab === t.key && (
                  <motion.span layoutId="msg-underline" className="absolute bottom-0 left-0 w-full h-0.5 rounded-full" style={{ background: 'linear-gradient(90deg,#A78BFA,#38BDF8)' }} />
                )}
              </button>
            ))}
          </div>

          {tab === 'email' && (
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Předmět emailu"
              className="bg-[#111] border-[0.5px] border-[#1A0E30] focus:border-[#7C3AED] text-[#F0EAFF] rounded-lg px-3 py-2 text-sm outline-none"
            />
          )}

          <textarea
            value={messages[tab]}
            onChange={(e) => setMessages((m) => ({ ...m, [tab]: e.target.value }))}
            className="bg-[#111] border-[0.5px] border-[#1A0E30] focus:border-[#7C3AED] text-[#F0EAFF] rounded-lg px-3 py-2 text-sm outline-none min-h-[100px] resize-none"
          />

          {limit !== null && (
            <div className="text-right text-xs" style={{ color: over ? '#EF4444' : '#6B7280' }}>
              {messages[tab].length}/{limit}
            </div>
          )}
        </motion.div>

        {error && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</p>}
      </motion.div>

      {/* STICKY BOTTOM */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-[#07050E] border-t border-[#1A0E30] p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <button onClick={handleSend} disabled={sending} className={`glow-btn w-full rounded-xl text-white font-semibold py-3.5 ${sending ? 'opacity-40' : ''}`}>
          ✦ Schválit &amp; Odeslat
        </button>
        <div className="flex gap-3 mt-3">
          <button onClick={() => setTab(tab)} className="flex-1 rounded-xl border border-[#1A0E30] text-[#F0EAFF] py-2.5 text-sm">Upravit</button>
          <button onClick={() => router.push('/contacts')} className="flex-1 rounded-xl border border-[#1A0E30] text-[#F0EAFF] py-2.5 text-sm">Přeskočit</button>
        </div>
      </div>

      {/* FOLLOW-UP MODAL */}
      <AnimatePresence>
        {showFollowup && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 flex items-end justify-center" style={{ background: 'rgba(7,5,14,0.7)' }}>
            <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }} className="w-full max-w-[430px] rounded-t-2xl border-t border-[#1A0E30] bg-[#0D0A18] p-6">
              <h3 className="font-bold text-[#F0EAFF] mb-1">Naplánovat follow-up?</h3>
              <p className="text-sm text-[#6B7280] mb-5">Vytvoříme 3-krokovou sekvenci (LinkedIn +1d, Email +3d, WhatsApp +7d).</p>
              <div className="flex gap-3">
                <button onClick={() => scheduleFollowup(true)} className="glow-btn flex-1 rounded-xl text-white py-3 font-semibold">Ano, naplánovat</button>
                <button onClick={() => scheduleFollowup(false)} className="flex-1 rounded-xl border border-[#1A0E30] text-[#F0EAFF] py-3">Ne</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
