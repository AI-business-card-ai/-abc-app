'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  IconCalendarCheck,
  IconChartBar,
  IconChevronRight,
  IconHome,
  IconId,
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
  { icon: IconId, label: 'My Card', path: '/my-card' },
  { icon: IconSend, label: 'Follow-ups', path: '/follow-ups' },
]

/*
  Events is not a destination of its own any more. The event workspaces are
  what Event & Expo Intelligence does today, so the item carries the family
  name and opens them. The features still to come live inside that family on
  Home, not as items of their own here.

  Integrations is not listed here either. It is a settings subsection, at
  /settings/integrations, reached through the Settings hub — the nav lists
  destinations, not the categories inside one. Pipeline is preserved but
  demoted.
*/
const SECONDARY: NavItem[] = [
  { icon: IconCalendarCheck, label: 'Event & Expo Intelligence', path: '/events' },
  { icon: IconChartBar, label: 'Pipeline', path: '/pipeline' },
  { icon: IconSettings, label: 'Settings', path: '/settings' },
]

function isActive(pathname: string, item: NavItem) {
  /*
    The card editor is a settings subsection now, so /settings/card lights up
    Settings rather than My Card. It used to light up My Card because it lived
    at /profile/card, which belonged to neither — and every settings page under
    the old rule matched both items at once.

    /profile is still matched because it redirects into /settings.
  */
  if (item.path === '/settings') return pathname.startsWith('/settings') || pathname.startsWith('/profile')
  return pathname === item.path || pathname.startsWith(`${item.path}/`)
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const ItemIcon = item.icon
  // The family name is the one long label; it steps down a size to stay on one line.
  const long = item.label.length > 16
  return (
    <Link
      href={item.path}
      aria-current={active ? 'page' : undefined}
      className={`relative flex min-h-[50px] items-center gap-3 rounded-[14px] px-4 transition-colors duration-200 ease-abc abc-focus-ring ${
        long ? 'text-[14px]' : 'text-[16px]'
      } ${
        active
          ? 'abc-nav-active font-semibold text-[#7a5810]'
          : 'font-medium text-[#2b2722] hover:bg-[rgba(201,150,40,0.08)] hover:text-abc-text'
      }`}
    >
      {active ? (
        <span
          className="absolute -left-[3px] top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-full"
          style={{ background: 'linear-gradient(180deg, #e2b64e, #a97d1c)' }}
          aria-hidden="true"
        />
      ) : null}
      <ItemIcon
        size={23}
        stroke={1.6}
        className="shrink-0"
        style={{ color: active ? 'var(--abc-gold-accent)' : '#3a352d' }}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

export default function DesktopSidebar() {
  const pathname = usePathname()
  const { profile, loading } = useAppProfile()

  return (
    <aside className="abc-sidebar fixed bottom-2 left-2 top-2 z-40 flex w-[268px] flex-col overflow-hidden rounded-[26px]">
      <SidebarWaves />

      <div className="relative px-6 pb-7 pt-7">
        <Link href="/home" className="inline-flex abc-focus-ring rounded-inner" aria-label="ABC Card — home">
          <AbcLogo size={52} />
        </Link>
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <nav className="flex flex-col gap-[7px]" aria-label="Primary">
          {PRIMARY.map((item) => (
            <NavLink key={item.path} item={item} active={isActive(pathname, item)} />
          ))}
        </nav>

        <div className="mx-5 my-5 h-px" style={{ background: 'rgba(201, 150, 40, 0.22)' }} />

        <nav className="flex flex-col gap-[7px]" aria-label="Secondary">
          {SECONDARY.map((item) => (
            <NavLink key={item.path} item={item} active={isActive(pathname, item)} />
          ))}
        </nav>
      </div>

      <div className="relative p-2.5">
        <Link
          href="/settings"
          className="abc-dash-well flex items-center gap-3 rounded-[18px] p-3 abc-focus-ring"
        >
          {loading ? (
            <Skeleton className="h-12 w-12" radius={999} />
          ) : (
            <Avatar src={profile?.avatarUrl} name={profile?.fullName} size={48} ring />
          )}
          <span className="min-w-0 flex-1">
            {loading ? (
              <>
                <Skeleton className="mb-1.5 h-3 w-24" />
                <Skeleton className="h-2.5 w-16" />
              </>
            ) : (
              <>
                <span className="block truncate text-[14px] font-bold text-abc-text">
                  {profile?.fullName || 'ABC'}
                </span>
                {profile?.jobTitle ? (
                  <span className="mt-0.5 block truncate text-[12.5px] font-medium text-[#8f6812]">
                    {profile.jobTitle}
                  </span>
                ) : null}
                {profile?.companyName ? (
                  <span className="mt-0.5 block truncate text-[12px] text-abc-secondary">
                    {profile.companyName}
                  </span>
                ) : null}
              </>
            )}
          </span>
          <IconChevronRight size={18} stroke={1.75} className="shrink-0 text-[#3a352d]" />
        </Link>
      </div>
    </aside>
  )
}

/** The gold threads that run across the foot of the sidebar in the reference. */
function SidebarWaves() {
  return (
    <svg
      className="pointer-events-none absolute bottom-[96px] left-0 h-[230px] w-full"
      viewBox="0 0 268 230"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="abc-side-wave" x1="0" y1="0" x2="264" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#c99628" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#e2b64e" stopOpacity="0.28" />
          <stop offset="1" stopColor="#e2b64e" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g stroke="url(#abc-side-wave)" strokeWidth="1">
        <path d="M-10 214C50 196 92 150 150 128S238 92 280 60" />
        <path d="M-10 224C58 206 104 166 160 146S242 112 280 86" opacity="0.8" />
        <path d="M-10 200C40 186 82 136 138 112S226 70 280 34" opacity="0.6" />
        <path d="M-10 230C66 218 118 184 172 166S248 136 280 116" opacity="0.5" />
      </g>
    </svg>
  )
}
