'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  IconCheck,
  IconChevronRight,
  IconMapPin,
  IconMessage2,
  IconSend,
  IconTargetArrow,
} from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'
import FollowUpSheet from '@/components/follow-ups/FollowUpSheet'
import Avatar from '@/components/ui/abc/Avatar'
import Button from '@/components/ui/abc/Button'
import { EmptyState, EventChip, SectionLabel } from '@/components/ui/abc/Bits'
import { followUpLabel, relativeDay } from '@/lib/format-date'
import type { CompletedFollowUp, FollowUpItem, FollowUpsData } from '@/lib/follow-ups-data'

const SECTIONS: { key: 'overdue' | 'today' | 'upcoming'; title: string; color: string }[] = [
  { key: 'overdue', title: 'Overdue', color: 'var(--abc-overdue)' },
  { key: 'today', title: 'Today', color: 'var(--abc-today)' },
  { key: 'upcoming', title: 'Upcoming', color: 'var(--abc-upcoming)' },
]

export default function FollowUpsView({ data }: { data: FollowUpsData }) {
  const router = useRouter()
  const [items, setItems] = useState(data)
  const [openId, setOpenId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const openItem = useMemo(() => {
    if (!openId) return null
    return (
      [...items.overdue, ...items.today, ...items.upcoming].find((item) => item.id === openId) ??
      null
    )
  }, [openId, items])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => ({
      ...prev,
      overdue: prev.overdue.filter((item) => item.id !== id),
      today: prev.today.filter((item) => item.id !== id),
      upcoming: prev.upcoming.filter((item) => item.id !== id),
    }))
  }, [])

  function flash(text: string) {
    setToast(text)
    setTimeout(() => setToast(null), 2500)
  }

  const pending = items.overdue.length + items.today.length + items.upcoming.length

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-8">
      <header>
        <SectionLabel>Follow-ups</SectionLabel>
        <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-tight text-abc-text lg:text-[36px]">
          Follow-ups
        </h1>
        <p className="mt-1.5 text-[14px] text-abc-secondary lg:text-[16px]">
          Stay on top of every meaningful connection.
        </p>
      </header>

      {pending === 0 ? (
        <div className="abc-surface mt-6">
          <EmptyState
            icon={IconSend}
            title="You're all caught up."
            description="Your scheduled follow-ups will appear here."
            action={
              <Button href="/contacts" variant="surface">
                View contacts
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-6 space-y-7">
          {SECTIONS.map((section) => {
            const list = items[section.key]
            if (list.length === 0) return null

            return (
              <section key={section.key} id={section.key} className="scroll-mt-20">
                <div className="flex items-center gap-2.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: section.color }}
                    aria-hidden="true"
                  />
                  <SectionLabel>
                    {section.title} · {list.length}
                  </SectionLabel>
                </div>

                <ul className="mt-3 flex flex-col gap-3">
                  {list.map((item) => (
                    <FollowUpCard
                      key={item.id}
                      item={item}
                      accent={section.color}
                      onOpen={() => setOpenId(item.id)}
                    />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      {items.completed.length > 0 ? (
        <section className="mt-8">
          <SectionLabel>Completed</SectionLabel>
          <ul className="abc-surface mt-3 divide-y divide-abc-border">
            {items.completed.map((entry) => (
              <CompletedRow key={entry.id} entry={entry} />
            ))}
          </ul>
        </section>
      ) : null}

      {openItem ? (
        <FollowUpSheet
          item={openItem}
          onClose={() => setOpenId(null)}
          onDone={(id) => {
            removeItem(id)
            setOpenId(null)
            flash('Follow-up marked done')
            router.refresh()
          }}
          onSnoozed={(id) => {
            removeItem(id)
            setOpenId(null)
            flash('Follow-up moved')
            router.refresh()
          }}
        />
      ) : null}

      {toast ? (
        <p
          className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] left-1/2 z-[130] -translate-x-1/2 rounded-full border border-abc-border bg-abc-card px-4 py-2.5 text-[13px] text-abc-text shadow-abc-raised lg:bottom-8"
          role="status"
        >
          {toast}
        </p>
      ) : null}
    </div>
  )
}

function FollowUpCard({
  item,
  accent,
  onOpen,
}: {
  item: FollowUpItem
  accent: string
  onOpen: () => void
}) {
  const meta = [item.role, item.company].filter(Boolean).join(' · ')
  const { primary, detail } = followUpLabel(item.dueAt)

  return (
    <li className="abc-surface abc-surface-interactive p-4 sm:p-5">
      <div className="flex gap-3.5">
        <Avatar src={item.photoUrl} name={item.name} size={44} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <Link
                href={`/contacts/${item.id}`}
                className="truncate rounded text-[16px] font-semibold text-abc-text transition-colors hover:text-abc-gold-accent abc-focus-ring"
              >
                {item.name}
              </Link>
              {meta ? (
                <p className="mt-0.5 truncate text-[13px] text-abc-secondary">{meta}</p>
              ) : null}
            </div>

            <span
              className="shrink-0 whitespace-nowrap text-[12.5px] font-medium"
              style={{ color: accent }}
            >
              {primary}
              {detail && primary !== detail ? (
                <span className="ml-1.5 font-normal text-abc-muted">{detail}</span>
              ) : null}
            </span>
          </div>

          {item.event ? (
            <div className="mt-2.5 flex items-center gap-1.5">
              <IconMapPin size={13} stroke={1.8} className="shrink-0 text-abc-muted" />
              <EventChip>{item.event}</EventChip>
            </div>
          ) : null}

          {item.discussed ? (
            <Detail icon={IconMessage2} label="Discussed" clamp>
              {item.discussed}
            </Detail>
          ) : null}

          {item.nextStep ? (
            <Detail icon={IconTargetArrow} label="Next" gold>
              {item.nextStep}
            </Detail>
          ) : null}
        </div>
      </div>

      <div className="mt-3.5 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button href={`/contacts/${item.id}`} variant="ghost" className="sm:w-auto">
          View contact
        </Button>
        <Button onClick={onOpen} fullWidth className="sm:w-auto">
          <IconSend size={17} stroke={1.9} />
          Follow up now
        </Button>
      </div>
    </li>
  )
}

function Detail({
  icon: DetailIcon,
  label,
  children,
  clamp = false,
  gold = false,
}: {
  icon: TablerIcon
  label: string
  children: React.ReactNode
  clamp?: boolean
  gold?: boolean
}) {
  return (
    <div className="mt-2 flex gap-1.5">
      <DetailIcon
        size={13}
        stroke={1.8}
        className="mt-[4px] shrink-0"
        style={{ color: gold ? 'var(--abc-gold-accent)' : 'var(--abc-text-muted)' }}
      />
      <p
        className={`min-w-0 text-[13px] leading-[1.5] ${clamp ? 'abc-clamp-2' : ''} ${
          gold ? 'text-abc-text' : 'text-abc-secondary'
        }`}
      >
        <span className="text-abc-muted">{label}: </span>
        {children}
      </p>
    </div>
  )
}

function CompletedRow({ entry }: { entry: CompletedFollowUp }) {
  const body = (
    <>
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{ background: 'rgba(74, 222, 128, 0.12)' }}
      >
        <IconCheck size={16} stroke={2.2} style={{ color: 'var(--abc-green)' }} />
      </span>
      <Avatar src={entry.photoUrl} name={entry.name} size={32} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-[14px] font-medium text-abc-secondary">
            {entry.name || 'Contact'}
          </span>
          {entry.event ? <EventChip>{entry.event}</EventChip> : null}
        </span>
        {entry.detail ? (
          <span className="mt-0.5 block truncate text-[12.5px] text-abc-muted">
            {entry.detail}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-[11.5px] text-abc-muted">
        {relativeDay(entry.completedAt)}
      </span>
    </>
  )

  return (
    <li>
      {entry.contactId ? (
        <Link
          href={`/contacts/${entry.contactId}`}
          className="flex items-center gap-3 px-4 py-3 transition-colors duration-200 ease-abc hover:bg-abc-raised/50 abc-focus-ring"
        >
          {body}
          <IconChevronRight size={16} stroke={1.75} className="shrink-0 text-abc-muted" />
        </Link>
      ) : (
        <span className="flex items-center gap-3 px-4 py-3">{body}</span>
      )}
    </li>
  )
}
