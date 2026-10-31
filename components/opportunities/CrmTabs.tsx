'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconLayoutKanban, IconListCheck, IconUsers } from '@tabler/icons-react'

const TABS = [
  { href: '/crm', label: 'Pipeline', icon: IconLayoutKanban },
  { href: '/crm/people', label: 'People', icon: IconUsers },
  { href: '/crm/next', label: 'Next', icon: IconListCheck },
]

/**
 * Pipeline, People, Next — three views of one CRM. Links, not state, so each
 * tab has an address, prefetches, and keeps the header still while it loads.
 */
export default function CrmTabs() {
  const pathname = usePathname()

  return (
    <nav aria-label="CRM" className="mt-5">
      <ul className="inline-flex w-full rounded-full border border-abc-border bg-abc-raised p-1 sm:w-auto">
        {TABS.map((tab) => {
          const active = tab.href === '/crm' ? pathname === '/crm' : pathname.startsWith(tab.href)
          const Icon = tab.icon
          return (
            <li key={tab.href} className="flex-1 sm:flex-none">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-full px-4 text-[14px] transition-colors duration-200 ease-abc abc-focus-ring sm:px-5 ${
                  active
                    ? 'bg-abc-card font-semibold text-abc-text'
                    : 'font-medium text-abc-secondary hover:text-abc-text'
                }`}
                style={active ? { boxShadow: 'var(--abc-shadow)' } : undefined}
              >
                <Icon
                  size={17}
                  stroke={1.8}
                  aria-hidden="true"
                  style={{ color: active ? 'var(--abc-gold-accent)' : undefined }}
                />
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
