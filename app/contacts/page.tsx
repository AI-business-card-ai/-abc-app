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
    <div className="min-h-screen bg-bg pb-28">
      {/* HERO HEADER */}
      <div className="hero-radial px-4 pt-6 pb-4">
        <div className="relative flex items-center justify-between">
          <div>
            <h1 className="gradient-text text-2xl font-black tracking-wide">KARTOTÉKA</h1>
            <p className="text-xs text-text-secondary mt-0.5">Apple Wallet stack vizitek</p>
          </div>
          <button className="icon-btn" aria-label="Hledat">
            <IconSearch size={18} />
          </button>
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-3 gap-2 px-4">
        {[
          { value: stats.scans, label: 'Skenů', gradient: false },
          { value: stats.sent, label: 'Odesláno', gradient: false },
          { value: stats.replied, label: 'Odpovědělo', gradient: true },
        ].map((s) => (
          <div key={s.label} className="abc-card flex flex-col items-center py-3.5">
            <span className={`text-xl font-bold ${s.gradient ? 'gradient-text' : 'text-text-primary'}`}>
              {s.value}
            </span>
            <span className="text-[11px] text-muted mt-0.5">{s.label}</span>
          </div>
        ))}
      </div>

      {/* FILTER CHIPS */}
      <div className="px-4 flex gap-2 flex-wrap mt-4">
        {events.map((ev) => {
          const isActive = filter === ev
          return (
            <button
              key={ev}
              onClick={() => setFilter(ev)}
              className={`abc-chip ${isActive ? 'abc-chip-active' : ''}`}
            >
              {ev}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="py-16 flex flex-col items-center gap-3">
          <div className="w-7 h-7 rounded-full border-2 border-transparent border-t-primary border-r-secondary animate-spin" />
          <p className="text-sm text-text-secondary">Načítám...</p>
        </div>
      ) : error ? (
        <p className="mx-4 mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-14 px-6 text-center hero-radial">
          <p className="text-sm text-text-secondary">Zatím nemáš žádné naskenované vizitky.</p>
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
          <div className="mt-6">
            <CardStack
              contacts={filtered}
              cur={cur}
              onCurChange={setCur}
              onSelect={(id) => router.push('/contact/' + id)}
            />
          </div>

          {/* PAGINATION DOTS */}
          <div className="flex justify-center gap-1.5 py-3">
            {filtered.map((c, i) => (
              <button
                key={c.id}
                onClick={() => setCur(i)}
                aria-label={`Karta ${i + 1}`}
                className="rounded-full transition-all duration-300"
                style={
                  i === cur
                    ? { width: 16, height: 4, background: 'linear-gradient(90deg, #A78BFA, #38BDF8)', boxShadow: '0 0 6px rgba(167,139,250,0.5)' }
                    : { width: 4, height: 4, background: '#1A0E30' }
                }
              />
            ))}
          </div>

          {/* INFO STRIP */}
          <AnimatePresence mode="wait">
            {active && (
              <motion.div
                key={active.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="abc-card mx-4 p-3.5 flex flex-col gap-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: '#A78BFA', boxShadow: '0 0 8px #A78BFA' }}
                    />
                    <span className="text-xs text-[#A78BFA] font-medium">
                      {active.event_name ?? 'Bez události'}
                    </span>
                  </div>
                  <span className="text-xs text-muted">
                    {new Date(active.scanned_at).toLocaleDateString('cs-CZ')}
                  </span>
                </div>
                {active.notes && (
                  <p className="text-sm text-text-secondary leading-relaxed">{active.notes}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => router.push('/chat/' + active.id)}
                    className="ghost-btn flex-1 py-2 text-xs"
                  >
                    💬 Chat
                  </button>
                  <button
                    onClick={() => router.push('/contact/' + active.id)}
                    className="ghost-btn flex-1 py-2 text-xs"
                  >
                    ✉ Zpráva
                  </button>
                  <button
                    onClick={() => router.push('/contact/' + active.id)}
                    className="glow-btn flex-1 py-2 text-xs text-white font-medium"
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
