'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { IconSearch, IconCamera } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase-client'
import BottomNav from '@/components/ui/BottomNav'
import CardStack from '@/components/ui/CardStack'
import type { ScannedContact } from '@/lib/types'

export default function ContactsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [contacts, setContacts] = useState<ScannedContact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('Vše')
  const [cur, setCur] = useState(0)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data, error: e } = await supabase
        .from('scanned_contacts')
        .select('*')
        .eq('user_id', user.id)
        .order('scanned_at', { ascending: false })
      if (!active) return
      if (e) setError(e.message)
      else setContacts((data as ScannedContact[]) ?? [])
      setLoading(false)
    })()
    return () => { active = false }
  }, [router, supabase])

  const stats = useMemo(() => ({
    scans: contacts.length,
    sent: contacts.filter((c) => c.status === 'sent' || c.status === 'replied').length,
    replied: contacts.filter((c) => c.status === 'replied').length,
  }), [contacts])

  const events = useMemo(() => {
    const set = new Set<string>()
    contacts.forEach((c) => c.event_name && set.add(c.event_name))
    return ['Vše', ...Array.from(set)]
  }, [contacts])

  const filtered = useMemo(() => (
    filter === 'Vše' ? contacts : contacts.filter((c) => c.event_name === filter)
  ), [contacts, filter])

  useEffect(() => { setCur(0) }, [filter])

  const active = filtered[cur] ?? null

  return (
    <div className="min-h-screen bg-[#07050E] pb-28">
      {/* TOP BAR */}
      <div className="flex items-center justify-between px-4 pt-6 pb-4">
        <h1 className="gradient-text text-xl font-black tracking-wide">KARTOTÉKA</h1>
        <button className="w-9 h-9 rounded-full border border-[#1A0E30] flex items-center justify-center text-[#6B7280]">
          <IconSearch size={18} />
        </button>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-3 gap-2 px-4">
        <div className="abc-card flex flex-col items-center py-3">
          <span className="text-xl font-bold text-[#F0EAFF]">{stats.scans}</span>
          <span className="text-[11px] text-[#6B7280]">Skenů</span>
        </div>
        <div className="abc-card flex flex-col items-center py-3">
          <span className="text-xl font-bold text-[#F0EAFF]">{stats.sent}</span>
          <span className="text-[11px] text-[#6B7280]">Odesláno</span>
        </div>
        <div className="abc-card flex flex-col items-center py-3">
          <span className="text-xl font-bold gradient-text">{stats.replied}</span>
          <span className="text-[11px] text-[#6B7280]">Odpovědělo</span>
        </div>
      </div>

      {/* FILTER CHIPS */}
      <div className="px-4 flex gap-2 flex-wrap mt-4">
        {events.map((ev) => {
          const isActive = filter === ev
          return (
            <button
              key={ev}
              onClick={() => setFilter(ev)}
              className="px-3 py-1.5 rounded-full text-xs border transition-colors"
              style={isActive ? { borderColor: '#7C3AED', color: '#A78BFA', background: '#1A0A2E' } : { borderColor: '#1A0E30', color: '#6B7280' }}
            >
              {ev}
            </button>
          )
        })}
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-[#6B7280]">Načítám...</p>
      ) : error ? (
        <p className="mx-4 mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-12 px-6 text-center">
          <p className="text-sm text-[#6B7280]">Zatím nemáš žádné naskenované vizitky.</p>
          <button onClick={() => router.push('/scan')} className="glow-btn rounded-xl text-white px-5 py-2.5 flex items-center gap-2">
            <IconCamera size={18} /> Naskenovat první
          </button>
        </div>
      ) : (
        <>
          <div className="mt-5">
            <CardStack contacts={filtered} cur={cur} onCurChange={setCur} onSelect={(id) => router.push('/contact/' + id)} />
          </div>

          {/* PAGINATION DOTS */}
          <div className="flex justify-center gap-1 py-2">
            {filtered.map((c, i) => (
              <button
                key={c.id}
                onClick={() => setCur(i)}
                aria-label={`Karta ${i + 1}`}
                className="rounded-full transition-all"
                style={i === cur ? { width: 14, height: 4, background: '#A78BFA' } : { width: 4, height: 4, background: '#1A0E30' }}
              />
            ))}
          </div>

          {/* INFO STRIP */}
          <AnimatePresence mode="wait">
            {active && (
              <motion.div
                key={active.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="abc-card mx-4 p-3 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#A78BFA', boxShadow: '0 0 6px #A78BFA' }} />
                    <span className="text-xs text-[#A78BFA]">{active.event_name ?? 'Bez události'}</span>
                  </div>
                  <span className="text-xs text-[#6B7280]">{new Date(active.scanned_at).toLocaleDateString('cs-CZ')}</span>
                </div>
                {active.notes && <p className="text-sm text-[#6B7280]">{active.notes}</p>}
                <div className="flex gap-2">
                  <button onClick={() => router.push('/chat/' + active.id)} className="flex-1 rounded-lg border border-[#1A0E30] py-2 text-xs text-[#F0EAFF]">💬 Chat</button>
                  <button onClick={() => router.push('/contact/' + active.id)} className="flex-1 rounded-lg border border-[#1A0E30] py-2 text-xs text-[#F0EAFF]">✉ Zpráva</button>
                  <button onClick={() => router.push('/contact/' + active.id)} className="flex-1 rounded-lg border border-[#1A0E30] py-2 text-xs text-[#F0EAFF]">✦ Detail</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      <BottomNav />
    </div>
  )
}
