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
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-[#06040C] border-t border-[#1A0E30] pb-[env(safe-area-inset-bottom)]"
      style={{ backdropFilter: 'blur(20px)' }}>
      <div className="flex">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.path)
          return (
            <motion.button
              key={tab.path}
              whileTap={{ scale: 0.9 }}
              onClick={() => router.push(tab.path)}
              className="flex-1 flex flex-col items-center gap-1 py-3"
            >
              <tab.icon
                size={22}
                className={active ? 'text-[#A78BFA]' : 'text-[#2A1A4A]'}
              />
              <span className={`text-[10px] font-medium ${active ? 'gradient-text' : 'text-[#2A1A4A]'}`}>
                {tab.label}
              </span>
              {active && (
                <motion.div
                  layoutId="nav-dot"
                  className="w-1 h-1 rounded-full bg-[#A78BFA]"
                  style={{ boxShadow: '0 0 5px #A78BFA' }}
                />
              )}
            </motion.button>
          )
        })}
      </div>
    </nav>
  )
}
