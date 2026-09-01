'use client'

import Link from 'next/link'
import { IconBell } from '@tabler/icons-react'
import AbcLogo from '@/components/brand/AbcLogo'
import { SAFE_TOP } from '@/lib/ui/layout'
import Avatar from '@/components/ui/abc/Avatar'
import { useAppProfile } from '@/lib/hooks/useAppProfile'
import { useFollowUpBadge } from '@/lib/hooks/useFollowUpBadge'

/**
 * Mobile-only top bar. The ABC Card lockup is the route back to Home —
 * Home has no bottom-nav tab by design.
 *
 * The bell badge is the real number of follow-ups overdue or due today.
 * When it is zero the badge is not rendered at all.
 */
export default function AppHeader() {
  const { profile } = useAppProfile()
  const dueCount = useFollowUpBadge()

  return (
    <header
      className="sticky top-0 z-50 border-b border-abc-border backdrop-blur-xl lg:hidden"
      style={{ background: 'rgba(10, 10, 11, 0.88)', paddingTop: SAFE_TOP }}
    >
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/home" className="rounded-inner abc-focus-ring" aria-label="ABC Card — home">
          <AbcLogo size={30} />
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/follow-ups"
            className="relative flex h-10 w-10 items-center justify-center rounded-full abc-focus-ring"
            aria-label={
              dueCount > 0 ? `Follow-ups — ${dueCount} need attention` : 'Follow-ups'
            }
          >
            <IconBell size={22} stroke={1.75} className="text-abc-secondary" />
            {dueCount > 0 ? (
              <span
                className="absolute right-1 top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-[#1a1205]"
                style={{ background: 'var(--abc-gold)' }}
              >
                {dueCount > 9 ? '9+' : dueCount}
              </span>
            ) : null}
          </Link>

          <Link href="/settings" className="rounded-full abc-focus-ring" aria-label="Your profile">
            <Avatar src={profile?.avatarUrl} name={profile?.fullName} size={34} ring />
          </Link>
        </div>
      </div>
    </header>
  )
}
