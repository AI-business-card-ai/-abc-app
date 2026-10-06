'use client'

import Link from 'next/link'
import { IconChevronRight, IconSend } from '@tabler/icons-react'
import GoldTrace from '@/components/dashboard/GoldTrace'
import type { FollowUpBuckets } from '@/lib/followups'

/*
  The three counts sit on solid status discs with the number in white at 19px
  bold — large text, so 3:1 is the bar, and each disc clears it.
*/
const ROWS = [
  {
    key: 'today' as const,
    label: 'Today',
    caption: 'Follow-ups due today',
    color: 'var(--abc-today)',
    halo: 'rgba(194, 96, 15, 0.14)',
  },
  {
    key: 'upcoming' as const,
    label: 'Upcoming',
    caption: 'Next 7 days',
    color: 'var(--abc-upcoming)',
    halo: 'rgba(138, 109, 8, 0.14)',
  },
  {
    key: 'overdue' as const,
    label: 'Overdue',
    caption: 'Needs your attention',
    color: 'var(--abc-overdue)',
    halo: 'rgba(192, 39, 31, 0.13)',
  },
]

export default function FollowUpsCard({ counts }: { counts: FollowUpBuckets }) {
  return (
    <section className="abc-dash-card flex h-full flex-col" aria-labelledby="home-followups-title">
      <GoldTrace phase={0.84} />

      <div className="relative flex h-full flex-col p-5 sm:px-6 sm:pb-4 sm:pt-6">
        <header className="flex items-start justify-between">
          <IconSend size={32} stroke={1.5} style={{ color: 'var(--abc-gold)' }} aria-hidden="true" />
          <Link href="/follow-ups" aria-label="Open follow-ups" className="abc-dash-chevron abc-focus-ring">
            <IconChevronRight size={22} stroke={1.75} />
          </Link>
        </header>

        <h2 id="home-followups-title" className="abc-dash-title mt-3.5">
          FOLLOW-UPS
        </h2>
        <p className="abc-dash-sub mt-1.5">Stay on top of every meaningful connection.</p>

        <ul className="mt-6 flex flex-1 flex-col gap-3">
          {ROWS.map((row) => (
            <li key={row.key}>
              <Link
                href={`/follow-ups#${row.key}`}
                className="abc-dash-well flex min-h-[76px] items-center gap-2.5 rounded-[15px] py-3 pl-3 pr-2 abc-focus-ring min-[1360px]:min-h-[84px]"
              >
                <span
                  className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-[19px] font-bold tabular-nums text-white"
                  style={{
                    background: row.color,
                    boxShadow: `0 0 0 4px ${row.halo}, inset 0 1px 0 rgba(255, 255, 255, 0.28)`,
                  }}
                >
                  {counts[row.key]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-tight text-[#161412]">{row.label}</span>
                  <span className="abc-clamp-2 mt-0.5 text-[12px] leading-[1.3] text-[#6a645b] min-[1360px]:text-[11.5px]">
                    {row.caption}
                  </span>
                </span>
                <IconChevronRight size={18} stroke={1.75} className="shrink-0 text-[#4a453e]" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>

        <Link href="/follow-ups" className="abc-dash-link abc-focus-ring mt-1 inline-flex self-start">
          Open follow-ups
          <IconChevronRight size={16} stroke={2} />
        </Link>
      </div>
    </section>
  )
}
