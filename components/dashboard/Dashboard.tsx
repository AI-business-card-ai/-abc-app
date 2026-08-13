'use client'

import Link from 'next/link'
import { IconBell, IconChevronDown } from '@tabler/icons-react'
import ContactsCard from '@/components/dashboard/ContactsCard'
import FollowUpsCard from '@/components/dashboard/FollowUpsCard'
import MyCardCard from '@/components/dashboard/MyCardCard'
import RecentActivityCard from '@/components/dashboard/RecentActivityCard'
import ScanActionCard from '@/components/dashboard/ScanActionCard'
import Avatar from '@/components/ui/abc/Avatar'
import { useAppProfile } from '@/lib/hooks/useAppProfile'
import { useFollowUpBadge } from '@/lib/hooks/useFollowUpBadge'
import type { DashboardData } from '@/lib/dashboard-data'

function greeting(now: Date = new Date()): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function Dashboard({ data }: { data: DashboardData }) {
  const { profile } = useAppProfile()
  const dueCount = useFollowUpBadge()

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
      <div className="flex items-start justify-between gap-6">
        <header className="min-w-0">
          <h1
            className="text-[28px] font-bold leading-tight tracking-tight text-abc-text lg:text-[38px]"
            suppressHydrationWarning
          >
            {greeting()}, {data.firstName}.
          </h1>
          <p className="mt-1.5 text-[14px] text-abc-secondary lg:text-[16px]">
            Everything you need after the handshake.
          </p>
        </header>

        {/* Desktop-only cluster — mobile uses the global app header */}
        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/follow-ups"
            className="relative flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-abc-raised abc-focus-ring"
            aria-label={dueCount > 0 ? `Follow-ups — ${dueCount} need attention` : 'Follow-ups'}
          >
            <IconBell size={21} stroke={1.75} className="text-abc-secondary" />
            {dueCount > 0 ? (
              <span
                className="absolute right-1 top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-[#1a1205]"
                style={{ background: 'var(--abc-gold)' }}
              >
                {dueCount > 9 ? '9+' : dueCount}
              </span>
            ) : null}
          </Link>

          <Link
            href="/profile"
            className="flex items-center gap-1.5 rounded-full abc-focus-ring"
            aria-label="Your profile"
          >
            <Avatar src={profile?.avatarUrl} name={profile?.fullName} size={38} ring />
            <IconChevronDown size={16} stroke={1.75} className="text-abc-muted" />
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 min-[430px]:grid-cols-2 lg:mt-8 lg:grid-cols-4 lg:gap-5">
        <div className="min-[430px]:col-span-2 lg:col-span-1">
          <ScanActionCard />
        </div>

        <ContactsCard contacts={data.contacts} total={data.contactsTotal} />

        <MyCardCard card={data.card} />

        <div className="min-[430px]:col-span-2 lg:col-span-1">
          <FollowUpsCard counts={data.followUps} />
        </div>
      </div>

      {data.activity.length > 0 ? (
        <div className="mt-4 lg:mt-5">
          <RecentActivityCard activity={data.activity} />
        </div>
      ) : null}
    </div>
  )
}
