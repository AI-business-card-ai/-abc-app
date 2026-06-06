'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { IconSearch, IconCamera } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase-client'
import BottomNav from '@/components/ui/BottomNav'
import CardStack from '@/components/ui/CardStack'
import type { ScannedContact } from '@/lib/types'

const chipStyle = (active: boolean): React.CSSProperties =>
  active
    ? { border: '0.5px solid #7C3AED', color: '#A78BFA', background: '#1A0A2E' }
    : { border: '0.5px solid #1A0E30', color: '#3A2060', background: 'transparent' }

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
    async function loadContacts() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data, error: e } = await supabase
        .from('scanned_contacts')
        .select('*')
        .eq('user_id', user.id)
        .neq('status', 'archived')
        .order('scanned_at', { ascending: false })
      if (!active) return
      if (e) setError(e.message)
      else setContacts((data as ScannedContact[]) ?? [])
      setLoading(false)
    }
    loadContacts()
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
    <div className="min-h-screen pb-28" style={{ background: '#07050E' }}>
      {/* 1. TOP BAR */}
      <div className="flex items-center justify-between px-4 pt-6 pb-2">
        <h1 className="gradient-text text-xl font-black tracking-wide">KARTOTÉKA</h1>
        <button aria-label="Hledat">
          <IconSearch size={20} style={{ color: '#2A1A4A' }} />
        </button>
      </div>

      {/* 2. STATS */}
      <div className="grid grid-cols-3 gap-2 px-4 py-3">
        {[
          { value: stats.scans, label: 'Skenů', gradient: false },
          { value: stats.sent, label: 'Odesláno', gradient: false },
          { value: stats.replied, label: 'Odpovědělo', gradient: true },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl text-center p-3"
            style={{ background: '#0D0A18', border: '0.5px solid #1A0E30' }}
          >
            <span
              className={`block font-bold ${s.gradient ? 'gradient-text' : ''}`}
              style={{ fontSize: '18px', color: s.gradient ? undefined : '#F0EAFF' }}
            >
              {s.value}
            </span>
            <span className="block mt-0.5 uppercase tracking-wide" style={{ fontSize: '8px', color: '#3A2060' }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* 3. FILTER CHIPS */}
      <div className="px-4 pb-3 flex gap-2 flex-wrap">
        {events.map((ev) => (
          <button
            key={ev}
            onClick={() => setFilter(ev)}
            className="px-3 py-1.5 rounded-full text-xs"
            style={chipStyle(filter === ev)}
          >
            {ev}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 flex justify-center">
          <div className="w-7 h-7 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#7C3AED', borderRightColor: '#0EA5E9' }} />
        </div>
      ) : error ? (
        <p className="mx-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-14 px-6 text-center">
          <p className="text-sm" style={{ color: '#3A2060' }}>Zatím nemáš žádné naskenované vizitky.</p>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => router.push('/scan')}
            className="glow-btn rounded-xl text-white px-5 py-2.5 flex items-center gap-2"
          >
            <IconCamera size={18} /> Naskenovat první
          </motion.button>
        </div>
      ) : (
        <>
          {/* 4. WALLET STACK */}
          <CardStack
            contacts={filtered}
            cur={cur}
            onCurChange={setCur}
            onSelect={(id) => router.push('/contact/' + id)}
          />

          {/* 5. PAGINATION DOTS */}
          <div className="flex justify-center gap-1 py-2">
            {filtered.map((c, i) => (
              <button
                key={c.id}
                onClick={() => setCur(i)}
                aria-label={`Karta ${i + 1}`}
                className="rounded-full transition-all"
                style={
                  i === cur
                    ? { width: 14, height: 4, background: '#A78BFA' }
                    : { width: 4, height: 4, background: '#1A0E30' }
                }
              />
            ))}
          </div>

          {/* 6. INFO STRIP */}
          <AnimatePresence mode="wait">
            {active && (
              <motion.div
                key={active.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="mx-4 rounded-xl p-3 mt-2 flex flex-col gap-2"
                style={{ background: '#06040C', border: '0.5px solid #1A0E30' }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: '#A78BFA', boxShadow: '0 0 6px #A78BFA' }}
                    />
                    <span className="text-xs font-medium" style={{ color: '#A78BFA' }}>
                      {active.event_name ?? 'Bez události'}
                    </span>
                  </div>
                  <span className="text-xs" style={{ color: '#3A2060' }}>
                    {new Date(active.scanned_at).toLocaleDateString('cs-CZ')}
                  </span>
                </div>
                {active.notes && (
                  <p className="text-sm" style={{ color: '#3A2060' }}>{active.notes}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => router.push('/chat/' + active.id)}
                    className="flex-1 py-2 text-xs rounded-lg"
                    style={{ border: '0.5px solid #1A0E30', color: '#F0EAFF' }}
                  >
                    💬 Chat
                  </button>
                  <button
                    onClick={() => router.push('/contact/' + active.id)}
                    className="flex-1 py-2 text-xs rounded-lg"
                    style={{ border: '0.5px solid #1A0E30', color: '#F0EAFF' }}
                  >
                    ✉ Zpráva
                  </button>
                  <button
                    onClick={() => router.push('/contact/' + active.id)}
                    className="flex-1 py-2 text-xs rounded-lg glow-btn text-white font-medium"
                  >
                    ✦ Detail
                  </button>
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
