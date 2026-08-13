'use client'

import Link from 'next/link'
import { IconChevronRight, IconUsers } from '@tabler/icons-react'
import Avatar from '@/components/ui/abc/Avatar'
import { EmptyState, EventChip } from '@/components/ui/abc/Bits'
import Button from '@/components/ui/abc/Button'
import type { DashboardContact } from '@/lib/dashboard-data'
import { relativeDay } from '@/lib/format-date'

export default function ContactsCard({
  contacts,
  total,
}: {
  contacts: DashboardContact[]
  total: number
}) {
  return (
    <section className="abc-surface abc-surface-interactive flex flex-col p-5">
      <header className="flex items-start justify-between">
        <IconUsers size={30} stroke={1.5} style={{ color: 'var(--abc-violet)' }} />
        <Link
          href="/contacts"
          aria-label="View all contacts"
          className="flex h-8 w-8 items-center justify-center rounded-full text-abc-muted transition-colors hover:text-abc-text abc-focus-ring"
        >
          <IconChevronRight size={20} stroke={1.75} />
        </Link>
      </header>

      <h2 className="mt-3.5 text-[19px] font-bold tracking-tight text-abc-text">CONTACTS</h2>
      <p className="mt-1 text-[13.5px] leading-[1.5] text-abc-secondary">
        People you met, with context.
      </p>

      {contacts.length === 0 ? (
        <EmptyState
          title="Your next connection starts here."
          description="Scanned contacts show up here with the event and date you met."
          action={
            <Button href="/scan" size="md">
              Scan your first contact
            </Button>
          }
        />
      ) : (
        <>
          <ul className="mt-4 flex-1 divide-y divide-abc-border border-t border-abc-border">
            {contacts.map((contact) => (
              <li key={contact.id}>
                <Link
                  href={`/contacts/${contact.id}`}
                  className="flex items-start gap-3 py-3 transition-colors duration-200 ease-abc hover:bg-abc-raised/60 abc-focus-ring rounded-inner"
                >
                  <Avatar src={contact.photoUrl} name={contact.name} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[14px] font-semibold text-abc-text">
                        {contact.name}
                      </span>
                      <span className="shrink-0 text-[11.5px] text-abc-muted">
                        {relativeDay(contact.scannedAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-abc-secondary">
                      {[contact.role, contact.company].filter(Boolean).join(' • ') || '—'}
                    </span>
                    {contact.eventName ? (
                      <span className="mt-1.5 block">
                        <EventChip>{contact.eventName}</EventChip>
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <Link
            href="/contacts"
            className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold transition-opacity hover:opacity-80 abc-focus-ring rounded"
            style={{ color: 'var(--abc-link)' }}
          >
            View all contacts
            {total > contacts.length ? (
              <span className="text-abc-muted">({total})</span>
            ) : null}
            <IconChevronRight size={15} stroke={2} />
          </Link>
        </>
      )}
    </section>
  )
}
