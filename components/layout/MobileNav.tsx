'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconAddressBook, IconScan, IconSend, IconUsers } from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'

type Tab = { icon: TablerIcon; label: string; path: string }

// Order follows the approved mobile dashboard mockup.
const TABS: Tab[] = [
  { icon: IconScan, label: 'Scan', path: '/scan' },
  { icon: IconUsers, label: 'Contacts', path: '/contacts' },
  { icon: IconAddressBook, label: 'My Card', path: '/profile/card' },
  { icon: IconSend, label: 'Follow-ups', path: '/follow-ups' },
]

export default function MobileNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[100] border-t border-abc-border backdrop-blur-xl lg:hidden"
      style={{
        background: 'rgba(10, 10, 11, 0.92)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      aria-label="Primary"
    >
      <ul className="flex items-stretch justify-around px-2 py-2">
        {TABS.map((tab) => {
          const active =
            tab.path === '/profile/card'
              ? pathname.startsWith('/profile/card')
              : pathname === tab.path || pathname.startsWith(`${tab.path}/`)
          const TabIcon = tab.icon

          return (
            <li key={tab.path} className="flex flex-1 justify-center">
              <Link
                href={tab.path}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[48px] min-w-[64px] flex-col items-center justify-center gap-1 rounded-inner px-2 py-1.5 transition-colors duration-200 ease-abc abc-focus-ring ${
                  active ? 'bg-abc-raised' : ''
                }`}
              >
                <TabIcon
                  size={22}
                  stroke={1.75}
                  style={{ color: active ? 'var(--abc-gold-accent)' : 'var(--abc-text-muted)' }}
                />
                <span
                  className="text-[10.5px] font-medium leading-none"
                  style={{ color: active ? 'var(--abc-gold-accent)' : 'var(--abc-text-muted)' }}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
