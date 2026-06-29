'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { IconCamera, IconCards, IconMessage, IconUser, IconLayoutKanban } from '@tabler/icons-react'
import { createClientComponent } from '@/lib/supabase'
import { filterContacts } from '@/lib/pipeline-ai'
import type { ScannedContact } from '@/lib/types'

const tabs = [
  { icon: IconCards, label: 'Contacts', path: '/contacts', badgeKey: 'new' as const },
  { icon: IconLayoutKanban, label: 'Pipeline', path: '/pipeline', badgeKey: 'action' as const },
  { icon: IconMessage, label: 'Chat', path: '/chat', badgeKey: null },
  { icon: IconUser, label: 'Profile', path: '/profile', badgeKey: null },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClientComponent()
  const [badges, setBadges] = useState({ new: 0, action: 0 })

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('scanned_contacts').select('*').eq('user_id', user.id)
      const list = (data as ScannedContact[]) || []
      setBadges({
        new: list.filter((c) => c.crm_status === 'NEW' || c.crm_status === 'ENRICHED').length,
        action: filterContacts(list, 'action').length,
      })
    })()
  }, [pathname, supabase])

  const isScan = pathname.startsWith('/scan')

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 w-full z-30 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
      style={{ background: 'rgba(15, 15, 15, 0.92)', borderTop: '1px solid #2a2a2a' }}
    >
      <div className="flex items-end justify-around px-1" style={{ minHeight: 64 }}>
        <NavItem
          icon={IconCards}
          label="Contacts"
          active={pathname.startsWith('/contacts')}
          onClick={() => router.push('/contacts')}
          badge={badges.new}
        />

        <NavItem
          icon={IconLayoutKanban}
          label="Pipeline"
          active={pathname.startsWith('/pipeline')}
          onClick={() => router.push('/pipeline')}
          badge={badges.action}
        />

        <button
          type="button"
          onClick={() => router.push('/scan')}
          className="relative -mt-5 flex flex-col items-center justify-center shrink-0"
          aria-label="Scan"
        >
          <span
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #f0197d, #00d4d4)',
              boxShadow: '0 4px 20px rgba(0, 212, 212, 0.35)',
            }}
          >
            <IconCamera size={26} style={{ color: '#fff' }} />
          </span>
          <span className="text-[10px] font-semibold mt-1" style={{ color: isScan ? '#00d4d4' : '#999999' }}>
            Scan
          </span>
        </button>

        <NavItem
          icon={IconMessage}
          label="Chat"
          active={pathname.startsWith('/chat')}
          onClick={() => router.push('/chat')}
        />

        <NavItem
          icon={IconUser}
          label="Profile"
          active={pathname.startsWith('/profile') || pathname.startsWith('/settings')}
          onClick={() => router.push('/profile')}
        />
      </div>
    </nav>
  )
}

function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: typeof IconCamera
  label: string
  active: boolean
  onClick: () => void
  badge?: number
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      type="button"
      onClick={onClick}
      className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 relative min-h-[44px] max-w-[72px]"
    >
      {active && (
        <span
          className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
          style={{ background: '#00d4d4', boxShadow: '0 0 6px rgba(0, 212, 212, 0.8)' }}
        />
      )}
      <span className="relative">
        <Icon
          size={22}
          style={
            active
              ? { color: '#00d4d4', filter: 'drop-shadow(0 0 4px rgba(0, 212, 212, 0.5))' }
              : { color: '#555555' }
          }
        />
        {badge != null && badge > 0 && (
          <span
            className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
            style={{ background: '#f0197d' }}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span className="text-[10px] font-medium" style={{ color: active ? '#00d4d4' : '#555555' }}>
        {label}
      </span>
    </motion.button>
  )
}
