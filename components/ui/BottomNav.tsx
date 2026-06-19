'use client'

import { usePathname, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { IconCamera, IconCards, IconMessage, IconUser } from '@tabler/icons-react'

const tabs = [
  { icon: IconCamera, label: 'Scan', path: '/scan' },
  { icon: IconCards, label: 'Contacts', path: '/contacts' },
  { icon: IconMessage, label: 'Chat', path: '/chat' },
  { icon: IconUser, label: 'Profile', path: '/settings' },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-30 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
      style={{ background: '#06040C', borderTop: '0.5px solid #1A0E30' }}
    >
      <div className="flex" style={{ minHeight: 64 }}>
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.path)
          return (
            <motion.button
              key={tab.path}
              whileTap={{ scale: 0.9 }}
              onClick={() => router.push(tab.path)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-3 relative"
            >
              {active && (
                <span
                  className="absolute top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ background: '#A78BFA', boxShadow: '0 0 6px #A78BFA' }}
                />
              )}
              <tab.icon
                size={22}
                style={
                  active
                    ? { color: '#A78BFA', filter: 'drop-shadow(0 0 4px rgba(167,139,250,0.5))' }
                    : { color: '#2A1A4A' }
                }
              />
              {active ? (
                <span className="text-[10px] font-medium gradient-text">{tab.label}</span>
              ) : (
                <span className="text-[10px] font-medium" style={{ color: '#2A1A4A' }}>{tab.label}</span>
              )}
            </motion.button>
          )
        })}
      </div>
    </nav>
  )
}
