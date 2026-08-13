'use client'

import Link from 'next/link'
import {
  IconChevronRight,
  IconDatabaseExport,
  IconDeviceFloppy,
  IconMail,
  IconMessage,
  IconScan,
  IconSparkles,
  IconArrowsExchange,
} from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'
import Avatar from '@/components/ui/abc/Avatar'
import { EventChip, SectionLabel } from '@/components/ui/abc/Bits'
import type { DashboardActivity } from '@/lib/dashboard-data'
import { timeLabel } from '@/lib/format-date'

const ACTIVITY: Record<string, { icon: TablerIcon; label: string }> = {
  CARD_SCANNED: { icon: IconScan, label: 'Card scanned' },
  EMAIL_SENT: { icon: IconMail, label: 'Sent email' },
  LINKEDIN_SENT: { icon: IconMessage, label: 'Sent LinkedIn message' },
  WHATSAPP_SENT: { icon: IconMessage, label: 'Sent WhatsApp message' },
  MESSAGE_GENERATED: { icon: IconSparkles, label: 'Message generated' },
  RESPONSE_RECEIVED: { icon: IconMessage, label: 'Reply received' },
  NOTE_ADDED: { icon: IconMessage, label: 'Note added' },
  STAGE_CHANGED: { icon: IconArrowsExchange, label: 'Stage changed' },
  VCARD_SAVED: { icon: IconDeviceFloppy, label: 'Saved to phone' },
  EXPORTED_CSV: { icon: IconDatabaseExport, label: 'Exported' },
  DEAL_WON: { icon: IconSparkles, label: 'Deal won' },
}

function describe(item: DashboardActivity) {
  const known = ACTIVITY[item.type]
  if (known) return known
  return { icon: IconMessage, label: item.type.replace(/_/g, ' ').toLowerCase() }
}

export default function RecentActivityCard({ activity }: { activity: DashboardActivity[] }) {
  if (activity.length === 0) return null

  return (
    <section className="abc-surface p-5">
      <SectionLabel>Recent activity</SectionLabel>

      <ul className="mt-3 divide-y divide-abc-border">
        {activity.map((item) => {
          const { icon: ActivityIcon, label } = describe(item)
          const row = (
            <>
              <Avatar src={item.contactPhoto} name={item.contactName} size={34} />
              <span className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
                <span className="flex min-w-0 items-center gap-2 sm:w-[42%]">
                  <span className="truncate text-[13.5px] font-semibold text-abc-text">
                    {item.contactName || 'Contact'}
                  </span>
                  {item.eventName ? <EventChip>{item.eventName}</EventChip> : null}
                </span>
                <span className="mt-1 flex min-w-0 items-center gap-2 sm:mt-0 sm:flex-1">
                  <ActivityIcon size={15} stroke={1.75} className="shrink-0 text-abc-muted" />
                  <span className="truncate text-[13px] text-abc-secondary">
                    {item.detail || label}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-[11.5px] text-abc-muted">
                {timeLabel(item.createdAt)}
              </span>
              <IconChevronRight size={16} stroke={1.75} className="shrink-0 text-abc-muted" />
            </>
          )

          return (
            <li key={item.id}>
              {item.contactId ? (
                <Link
                  href={`/contacts/${item.contactId}`}
                  className="flex items-center gap-3 rounded-inner py-3 transition-colors duration-200 ease-abc hover:bg-abc-raised/60 abc-focus-ring"
                >
                  {row}
                </Link>
              ) : (
                <span className="flex items-center gap-3 py-3">{row}</span>
              )}
            </li>
          )
        })}
      </ul>

      <Link
        href="/contacts"
        className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold transition-opacity hover:opacity-80 abc-focus-ring rounded"
        style={{ color: 'var(--abc-link)' }}
      >
        View all activity
        <IconChevronRight size={15} stroke={2} />
      </Link>
    </section>
  )
}
