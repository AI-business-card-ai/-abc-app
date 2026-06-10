'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { IconChevronRight, IconCamera } from '@tabler/icons-react'
import { createClientComponent } from '@/lib/supabase'
import BottomNav from '@/components/ui/BottomNav'
import GradientAvatar from '@/components/ui/GradientAvatar'
import type { ScannedContact } from '@/lib/types'

export default function ChatListPage() {
  const router = useRouter()
  const supabase = createClientComponent()

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
    <div className="min-h-screen bg-bg pb-28">
      <div className="hero-radial px-4 pt-6 pb-4">
        <h1 className="gradient-text text-2xl font-black tracking-wide relative">CHAT</h1>
        <p className="text-xs text-text-secondary mt-0.5 relative">Konverzace s kontakty</p>
      </div>

      <div className="flex flex-col gap-2.5 px-4">
        {loading ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <div className="w-7 h-7 rounded-full border-2 border-transparent border-t-primary border-r-secondary animate-spin" />
            <p className="text-sm text-text-secondary">Načítám...</p>
          </div>
        ) : error ? (
          <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-14 text-center">
            <p className="text-sm text-text-secondary">Zatím žádné konverzace.</p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => router.push('/scan')}
              className="glow-btn rounded-xl text-white px-5 py-2.5 flex items-center gap-2"
            >
              <IconCamera size={18} /> Naskenovat vizitku
            </motion.button>
          </div>
        ) : (
          contacts.map((c) => {
            const initials = c.name?.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() ?? '?'
            const replied = c.status === 'replied'
            return (
              <motion.button
                key={c.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => router.push('/chat/' + c.id)}
                className="abc-card flex items-center gap-3 p-3.5 text-left w-full transition-colors hover:border-primary/30"
              >
                <GradientAvatar initials={initials} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">{c.name ?? 'Neznámý'}</p>
                  <p className="text-xs text-text-secondary truncate">
                    {[c.role, c.company].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span
                  className="text-[10px] shrink-0 flex items-center gap-1"
                  style={{ color: replied ? '#34D399' : '#3A2060' }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: replied ? '#34D399' : '#3A2060' }}
                  />
                  {replied ? 'Odpověděl' : 'Čeká'}
                </span>
                <IconChevronRight size={16} className="text-muted shrink-0" />
              </motion.button>
            )
          })
        )}
      </div>

      <BottomNav />
    </div>
  )
}
