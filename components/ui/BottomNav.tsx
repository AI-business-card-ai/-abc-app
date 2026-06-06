'use client'

import { usePathname, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { IconCamera, IconCards, IconMessage, IconUser } from '@tabler/icons-react'

const tabs = [
  { icon: IconCamera, label: 'Scan', path: '/scan' },
  { icon: IconCards, label: 'Kartotéka', path: '/contacts' },
  { icon: IconMessage, label: 'Chat', path: '/chat' },
  { icon: IconUser, label: 'Profil', path: '/settings' },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] border-t border-abc-border pb-[env(safe-area-inset-bottom)] z-30"
      style={{
        background: 'rgba(6, 4, 12, 0.92)',
        backdropFilter: 'blur(20px)',
      }}
    >
      <div className="flex">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.path)
          return (
            <motion.button
              key={tab.path}
              whileTap={{ scale: 0.9 }}
              onClick={() => router.push(tab.path)}
              className="flex-1 flex flex-col items-center gap-0.5 py-3 relative"
            >
              {active && (
                <motion.div
                  layoutId="nav-glow"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-gradient-primary"
                  style={{ boxShadow: '0 0 8px rgba(124,58,237,0.6)' }}
                />
              )}
              <tab.icon
                size={22}
                className={active ? 'text-[#A78BFA]' : 'text-muted'}
                style={active ? { filter: 'drop-shadow(0 0 4px rgba(167,139,250,0.5))' } : undefined}
              />
              <span className={`text-[10px] font-medium ${active ? 'gradient-text' : 'text-muted'}`}>
                {tab.label}
              </span>
            </motion.button>
          )
        })}
      </div>
    </nav>
  )
}
