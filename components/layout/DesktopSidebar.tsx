'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  IconAddressBook,
  IconChevronRight,
  IconHome,
  IconLayoutKanban,
  IconPlugConnected,
  IconScan,
  IconSend,
  IconSettings,
  IconUsers,
} from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'
import AbcLogo from '@/components/brand/AbcLogo'
import Avatar from '@/components/ui/abc/Avatar'
import { Skeleton } from '@/components/ui/abc/Bits'
import { useAppProfile } from '@/lib/hooks/useAppProfile'

type NavItem = { icon: TablerIcon; label: string; path: string }

const PRIMARY: NavItem[] = [
  { icon: IconHome, label: 'Home', path: '/home' },
  { icon: IconScan, label: 'Scan', path: '/scan' },
  { icon: IconUsers, label: 'Contacts', path: '/contacts' },
  { icon: IconAddressBook, label: 'My Card', path: '/my-card' },
  { icon: IconSend, label: 'Follow-ups', path: '/follow-ups' },
]

// Integrations points at Settings, where the live HubSpot / Salesforce
// connection panel already lives. Pipeline is preserved but demoted.
const SECONDARY: NavItem[] = [
  { icon: IconPlugConnected, label: 'Integrations', path: '/settings' },
  { icon: IconLayoutKanban, label: 'Pipeline', path: '/pipeline' },
  { icon: IconSettings, label: 'Settings', path: '/profile' },
]

function isActive(pathname: string, item: NavItem) {
  // The card editor lives under /profile/card but belongs to the My Card item.
  if (item.path === '/my-card') {
    return pathname.startsWith('/my-card') || pathname.startsWith('/profile/card')
  }
  if (item.path === '/profile') return pathname === '/profile'
  if (item.path === '/settings') return pathname.startsWith('/settings')
  return pathname === item.path || pathname.startsWith(`${item.path}/`)
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const ItemIcon = item.icon
  return (
    <Link
      href={item.path}
      aria-current={active ? 'page' : undefined}
      className={`relative flex items-center gap-3 rounded-inner px-3 py-2.5 text-[14px] transition-colors duration-200 ease-abc abc-focus-ring ${
        active
          ? 'bg-abc-raised font-semibold text-abc-gold-accent'
          : 'font-medium text-abc-secondary hover:bg-abc-raised hover:text-abc-text'
      }`}
    >
      {active ? (
        <span
          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full"
          style={{ background: 'var(--abc-gold-accent)' }}
          aria-hidden="true"
        />
      ) : null}
      <ItemIcon
        size={20}
        stroke={1.75}
        style={{ color: active ? 'var(--abc-gold-accent)' : 'currentColor' }}
      />
      {item.label}
    </Link>
  )
}

export default function DesktopSidebar() {
  const pathname = usePathname()
  const { profile, loading } = useAppProfile()

  return (
    <aside
      className="fixed left-0 top-0 z-40 flex h-screen w-[260px] flex-col border-r border-abc-border"
      style={{ background: '#0c0c0e' }}
    >
      <div className="px-5 pb-7 pt-6">
        <Link href="/home" className="inline-flex abc-focus-ring rounded-inner" aria-label="ABC Card — home">
          <AbcLogo size={34} />
        </Link>
      </div>

      <nav className="flex flex-col gap-1 px-3" aria-label="Primary">
        {PRIMARY.map((item) => (
          <NavLink key={item.path} item={item} active={isActive(pathname, item)} />
        ))}
      </nav>

      <div className="mx-5 my-4 border-t border-abc-border" />

      <nav className="flex flex-col gap-1 px-3" aria-label="Secondary">
        {SECONDARY.map((item) => (
          <NavLink key={item.path} item={item} active={isActive(pathname, item)} />
        ))}
      </nav>

      <div className="mt-auto border-t border-abc-border p-3">
        <Link
          href="/profile"
          className="flex items-center gap-3 rounded-inner p-2 transition-colors duration-200 ease-abc hover:bg-abc-raised abc-focus-ring"
        >
          {loading ? (
            <Skeleton className="h-10 w-10" radius={999} />
          ) : (
            <Avatar src={profile?.avatarUrl} name={profile?.fullName} size={40} ring />
          )}
          <span className="min-w-0 flex-1">
            {loading ? (
              <>
                <Skeleton className="mb-1.5 h-3 w-24" />
                <Skeleton className="h-2.5 w-16" />
              </>
            ) : (
              <>
                <span className="block truncate text-[13.5px] font-semibold text-abc-text">
                  {profile?.fullName || 'ABC'}
                </span>
                {profile?.jobTitle ? (
                  <span className="block truncate text-[12px] text-abc-gold-accent">
                    {profile.jobTitle}
                  </span>
                ) : null}
                {profile?.companyName ? (
                  <span className="block truncate text-[12px] text-abc-secondary">
                    {profile.companyName}
                  </span>
                ) : null}
              </>
            )}
          </span>
          <IconChevronRight size={16} stroke={1.75} className="shrink-0 text-abc-muted" />
        </Link>
      </div>
    </aside>
  )
}
