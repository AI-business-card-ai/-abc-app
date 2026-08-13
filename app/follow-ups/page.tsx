import Link from 'next/link'
import { redirect } from 'next/navigation'
import { IconChevronRight, IconSend } from '@tabler/icons-react'
import Avatar from '@/components/ui/abc/Avatar'
import { EmptyState, EventChip, SectionLabel } from '@/components/ui/abc/Bits'
import Button from '@/components/ui/abc/Button'
import { bucketFor, type FollowUpBucket } from '@/lib/followups'
import { dueDateLabel } from '@/lib/format-date'
import { createServerComponentClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type Row = {
  id: string
  name: string | null
  role: string | null
  company: string | null
  photo_url: string | null
  event_name: string | null
  meeting_event_name: string | null
  meeting_topic: string | null
  next_action: string | null
  next_step: string | null
  next_action_date: string | null
}

const SECTIONS: { key: FollowUpBucket; title: string; color: string }[] = [
  { key: 'overdue', title: 'Overdue', color: 'var(--abc-overdue)' },
  { key: 'today', title: 'Today', color: 'var(--abc-today)' },
  { key: 'upcoming', title: 'Upcoming', color: 'var(--abc-upcoming)' },
]

export default async function FollowUpsPage() {
  const supabase = createServerComponentClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('scanned_contacts')
    .select(
      'id, name, role, company, photo_url, event_name, meeting_event_name, meeting_topic, next_action, next_step, next_action_date'
    )
    .eq('user_id', user.id)
    .not('next_action_date', 'is', null)
    .order('next_action_date', { ascending: true })

  const rows = (data ?? []) as Row[]
  const grouped: Record<FollowUpBucket, Row[]> = { overdue: [], today: [], upcoming: [] }
  for (const row of rows) {
    const bucket = bucketFor(row.next_action_date)
    if (bucket) grouped[bucket].push(row)
  }

  const total = grouped.overdue.length + grouped.today.length + grouped.upcoming.length

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-8">
      <header>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-abc-text lg:text-[34px]">
          Follow-ups
        </h1>
        <p className="mt-1.5 text-[14px] text-abc-secondary lg:text-[15px]">
          Stay on top of every meaningful connection.
        </p>
      </header>

      {total === 0 ? (
        <div className="abc-surface mt-6">
          <EmptyState
            icon={IconSend}
            title="You're all caught up."
            description="Follow-ups appear here once you set a next step on a contact."
            action={<Button href="/contacts">Open contacts</Button>}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-7">
          {SECTIONS.map((section) =>
            grouped[section.key].length === 0 ? null : (
              <section key={section.key} id={section.key} className="scroll-mt-20">
                <div className="flex items-center gap-2.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: section.color }}
                    aria-hidden="true"
                  />
                  <SectionLabel>
                    {section.title} · {grouped[section.key].length}
                  </SectionLabel>
                </div>

                <ul className="abc-surface mt-3 divide-y divide-abc-border">
                  {grouped[section.key].map((row) => {
                    const event = row.meeting_event_name || row.event_name
                    const next = row.next_action || row.next_step

                    return (
                      <li key={row.id}>
                        <Link
                          href={`/contacts/${row.id}`}
                          className="flex items-start gap-3 p-4 transition-colors duration-200 ease-abc hover:bg-abc-raised/60 abc-focus-ring"
                        >
                          <Avatar src={row.photo_url} name={row.name} size={40} />

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                              <p className="truncate text-[15px] font-semibold text-abc-text">
                                {row.name || 'Unnamed contact'}
                              </p>
                              {event ? <EventChip>{event}</EventChip> : null}
                            </div>

                            <p className="mt-0.5 truncate text-[13px] text-abc-secondary">
                              {[row.role, row.company].filter(Boolean).join(' • ') || '—'}
                            </p>

                            {row.meeting_topic ? (
                              <p className="mt-2 text-[13px] leading-[1.5] text-abc-secondary abc-clamp-2">
                                <span className="text-abc-muted">Discussed: </span>
                                {row.meeting_topic}
                              </p>
                            ) : null}

                            {next ? (
                              <p className="mt-1 text-[13px] leading-[1.5] text-abc-text abc-clamp-2">
                                <span className="text-abc-muted">Next: </span>
                                {next}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                            <span className="text-[12px] font-medium" style={{ color: section.color }}>
                              {dueDateLabel(row.next_action_date)}
                            </span>
                            <IconChevronRight size={16} stroke={1.75} className="text-abc-muted" />
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          )}
        </div>
      )}
    </div>
  )
}
