'use client'

import Link from 'next/link'
import { IconChevronRight, IconSend } from '@tabler/icons-react'
import type { FollowUpBuckets } from '@/lib/followups'

const TILES = [
  {
    key: 'today' as const,
    label: 'Today',
    caption: 'Follow-ups due today',
    color: 'var(--abc-today)',
  },
  {
    key: 'upcoming' as const,
    label: 'Upcoming',
    caption: 'Next 7 days',
    color: 'var(--abc-upcoming)',
  },
  {
    key: 'overdue' as const,
    label: 'Overdue',
    caption: 'Needs your attention',
    color: 'var(--abc-overdue)',
  },
]

export default function FollowUpsCard({ counts }: { counts: FollowUpBuckets }) {
  return (
    <section className="abc-surface abc-surface-interactive flex h-full flex-col p-5">
      <header className="flex items-start justify-between">
        <IconSend size={30} stroke={1.5} style={{ color: 'var(--abc-orange)' }} />
        <Link
          href="/follow-ups"
          aria-label="Open follow-ups"
          className="flex h-8 w-8 items-center justify-center rounded-full text-abc-muted transition-colors hover:text-abc-text abc-focus-ring"
        >
          <IconChevronRight size={20} stroke={1.75} />
        </Link>
      </header>

      <h2 className="mt-3.5 text-[19px] font-bold tracking-tight text-abc-text">FOLLOW-UPS</h2>
      <p className="mt-1 text-[13.5px] leading-[1.5] text-abc-secondary">
        Stay on top of every meaningful connection.
      </p>

      <ul className="mt-4 grid flex-1 grid-cols-3 gap-2.5 lg:grid-cols-1">
        {TILES.map((tile) => (
          <li key={tile.key}>
            <Link
              href={`/follow-ups#${tile.key}`}
              className="flex h-full flex-col items-start gap-2 rounded-inner border border-abc-border bg-abc-raised p-3 transition-colors duration-200 ease-abc hover:border-abc-border-strong abc-focus-ring lg:flex-row lg:items-center lg:gap-3"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-[#141005]"
                style={{ background: tile.color }}
              >
                {counts[tile.key]}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-abc-text">{tile.label}</span>
                <span className="block text-[11.5px] leading-[1.4] text-abc-secondary">
                  {tile.caption}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href="/follow-ups"
        className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-abc-gold-accent transition-opacity hover:opacity-80 abc-focus-ring rounded"
      >
        Open follow-ups
        <IconChevronRight size={15} stroke={2} />
      </Link>
    </section>
  )
}
