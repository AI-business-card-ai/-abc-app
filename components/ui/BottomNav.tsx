'use client'

import { usePathname, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { IconCamera, IconCards, IconMessage, IconUser, IconLayoutKanban } from '@tabler/icons-react'

const tabs = [
  { icon: IconCamera, label: 'Scan', path: '/scan' },
  { icon: IconCards, label: 'Contacts', path: '/contacts' },
  { icon: IconLayoutKanban, label: 'Pipeline', path: '/pipeline' },
  { icon: IconMessage, label: 'Chat', path: '/chat' },
  { icon: IconUser, label: 'Profile', path: '/settings' },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 w-full z-30 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
      style={{ background: '#0d0f1a', borderTop: '1px solid rgba(0, 212, 212, 0.1)' }}
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
                  className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                  style={{ background: '#f0197d', boxShadow: '0 0 6px rgba(240, 25, 125, 0.8)' }}
                />
              )}
              <tab.icon
                size={22}
                style={
                  active
                    ? { color: '#00d4d4', filter: 'drop-shadow(0 0 4px rgba(0, 212, 212, 0.5))' }
                    : { color: '#4a5168' }
                }
              />
              {active ? (
                <span className="text-[10px] font-medium" style={{ color: '#00d4d4' }}>
                  {tab.label}
                </span>
              ) : (
                <span className="text-[10px] font-medium" style={{ color: '#4a5168' }}>
                  {tab.label}
                </span>
              )}
            </motion.button>
          )
        })}
      </div>
    </nav>
  )
}
