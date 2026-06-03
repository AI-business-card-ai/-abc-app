'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { IconChevronRight, IconCamera } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase-client'
import BottomNav from '@/components/ui/BottomNav'
import type { ScannedContact } from '@/lib/types'

export default function ChatListPage() {
  const router = useRouter()
  const supabase = createClient()

  const [contacts, setContacts] = useState<ScannedContact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data, error: e } = await supabase
        .from('scanned_contacts')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['approved', 'sent', 'replied'])
        .order('scanned_at', { ascending: false })
      if (!active) return
      if (e) setError(e.message)
      else setContacts((data as ScannedContact[]) ?? [])
      setLoading(false)
    })()
    return () => { active = false }
  }, [router, supabase])

  return (
    <div className="min-h-screen bg-[#07050E] pb-28">
      <div className="flex items-center justify-between px-4 pt-6 pb-4">
        <h1 className="gradient-text text-xl font-black tracking-wide">CHAT</h1>
      </div>

      <div className="flex flex-col gap-3 px-4">
        {loading ? (
          <p className="py-10 text-center text-sm text-[#6B7280]">Načítám...</p>
        ) : error ? (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-sm text-[#6B7280]">Zatím žádné konverzace.</p>
            <button onClick={() => router.push('/scan')} className="glow-btn rounded-xl text-white px-5 py-2.5 flex items-center gap-2">
              <IconCamera size={18} /> Naskenovat vizitku
            </button>
          </div>
        ) : (
          contacts.map((c) => {
            const initials = c.name?.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() ?? '?'
            return (
              <motion.button
                key={c.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => router.push('/chat/' + c.id)}
                className="abc-card flex items-center gap-3 p-3 text-left"
              >
                <span className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg,#7C3AED,#0EA5E9)' }}>{initials}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#F0EAFF]">{c.name ?? 'Neznámý'}</p>
                  <p className="text-xs text-[#6B7280]">{[c.role, c.company].filter(Boolean).join(' · ')}</p>
                </div>
                <span className="text-xs" style={{ color: c.status === 'replied' ? '#34D399' : '#6B7280' }}>{c.status === 'replied' ? '● Odpověděl' : '● Čeká'}</span>
                <IconChevronRight size={18} className="text-[#6B7280]" />
              </motion.button>
            )
          })
        )}
      </div>

      <BottomNav />
    </div>
  )
}
