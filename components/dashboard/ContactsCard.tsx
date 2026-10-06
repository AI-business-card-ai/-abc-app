'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconChevronRight, IconSearch, IconUsers } from '@tabler/icons-react'
import GoldTrace from '@/components/dashboard/GoldTrace'
import Avatar from '@/components/ui/abc/Avatar'
import { EventChip } from '@/components/ui/abc/Bits'
import type { DashboardContact } from '@/lib/dashboard-data'
import { relativeDay } from '@/lib/format-date'

/**
 * CONTACTS: the last three people met, with where — from real rows only.
 *
 * The search field is the Contacts search, not a lookalike: it opens
 * /contacts with the query already applied, and that screen matches on name,
 * role, company, email, event and notes. A field that only looked searchable
 * would be the first thing on Home to lie.
 */
export default function ContactsCard({
  contacts,
  total,
}: {
  contacts: DashboardContact[]
  total: number
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')

  function search(e: FormEvent) {
    e.preventDefault()
    const q = query.trim()
    router.push(q ? `/contacts?q=${encodeURIComponent(q)}` : '/contacts')
  }

  return (
    <section className="abc-dash-card flex h-full flex-col" aria-labelledby="home-contacts-title">
      <GoldTrace phase={0.36} />

      <div className="relative flex h-full flex-col p-5 sm:px-6 sm:pb-4 sm:pt-6">
        <header className="flex items-start justify-between">
          <IconUsers size={32} stroke={1.5} style={{ color: 'var(--abc-gold)' }} aria-hidden="true" />
          <Link href="/contacts" aria-label="View all contacts" className="abc-dash-chevron abc-focus-ring">
            <IconChevronRight size={22} stroke={1.75} />
          </Link>
        </header>

        <h2 id="home-contacts-title" className="abc-dash-title mt-3.5">
          CONTACTS
        </h2>
        <p className="abc-dash-sub mt-1.5">People you met, with context.</p>

        {contacts.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-2 py-8 text-center">
            <p className="text-[15px] font-semibold text-abc-text">Your next connection starts here.</p>
            <p className="mt-1.5 max-w-[30ch] text-[13px] leading-[1.55] text-abc-secondary">
              Scanned contacts show up here with the event and date you met.
            </p>
            <Link href="/scan" className="abc-dash-link abc-focus-ring mt-3 inline-flex">
              Scan your first contact
              <IconChevronRight size={16} stroke={2} />
            </Link>
          </div>
        ) : (
          <>
            <form role="search" onSubmit={search} className="abc-dash-search mt-4 flex h-[46px] items-center gap-2.5 rounded-full px-4">
              <IconSearch size={18} stroke={1.75} className="shrink-0 text-[#4a453e]" aria-hidden="true" />
              <input
                type="search"
                name="q"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search contacts..."
                aria-label="Search contacts"
                enterKeyHint="search"
                className="h-full min-w-0 flex-1 text-[14px] text-abc-text"
              />
            </form>

            <ul className="mt-1.5 flex-1 divide-y divide-[rgba(201,150,40,0.16)]">
              {contacts.map((contact) => (
                <li key={contact.id}>
                  <Link
                    href={`/contacts/${contact.id}`}
                    className="-mx-2 flex items-start gap-3 rounded-[14px] px-2 py-2.5 transition-colors duration-200 ease-abc hover:bg-[rgba(201,150,40,0.07)] abc-focus-ring"
                  >
                    <Avatar src={contact.photoUrl} name={contact.name} size={42} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[14.5px] font-semibold leading-tight text-[#161412]">
                          {contact.name}
                        </span>
                        <span className="shrink-0 text-[11.5px] text-[#756d63]">
                          {relativeDay(contact.scannedAt)}
                        </span>
                      </span>
                      <span className="mt-1 block truncate text-[12.5px] leading-[1.3] text-[#6a645b]">
                        {[contact.role, contact.company].filter(Boolean).join(' • ') || '—'}
                      </span>
                      {contact.eventName ? (
                        <span className="mt-1.5 block leading-none">
                          <EventChip>{contact.eventName}</EventChip>
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-1 flex items-center justify-between gap-3">
              <Link href="/contacts" className="abc-dash-link abc-focus-ring inline-flex">
                View all contacts
                <IconChevronRight size={16} stroke={2} />
              </Link>
              <span
                className="rounded-full px-3 py-1 text-[13px] font-semibold tabular-nums text-[#8a6410]"
                style={{ background: 'rgba(201, 150, 40, 0.12)' }}
                aria-label={`${total} contacts in total`}
              >
                {total}
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
