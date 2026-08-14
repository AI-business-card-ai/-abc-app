'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { IconCamera, IconSearch, IconUsers, IconX } from '@tabler/icons-react'
import ContactRow from '@/components/contacts/ContactRow'
import Button from '@/components/ui/abc/Button'
import { EmptyState, SectionLabel } from '@/components/ui/abc/Bits'
import { createClientComponent } from '@/lib/supabase'
import {
  CONTACT_FILTERS,
  CONTACT_LIST_COLUMNS,
  eventOptions,
  matchesFilter,
  matchesQuery,
  toContactCard,
  type ContactCardData,
  type ContactFilter,
  type ContactListRow,
} from '@/lib/contacts-view'

const ALL_EVENTS = '__all__'

export default function ContactsView({
  userId,
  initialContacts,
  initialError,
}: {
  userId: string
  initialContacts: ContactListRow[]
  initialError: boolean
}) {
  const supabase = useMemo(() => createClientComponent(), [])

  const [rows, setRows] = useState<ContactListRow[]>(initialContacts)
  const [failed, setFailed] = useState(initialError)
  const [retrying, setRetrying] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ContactFilter>('all')
  const [eventFilter, setEventFilter] = useState<string>(ALL_EVENTS)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setRetrying(true)
    const { data, error } = await supabase
      .from('scanned_contacts')
      .select(CONTACT_LIST_COLUMNS)
      .eq('user_id', userId)
      .order('scanned_at', { ascending: false })

    if (error) {
      setFailed(true)
    } else {
      setRows((data as unknown as ContactListRow[]) ?? [])
      setFailed(false)
    }
    setRetrying(false)
  }, [supabase, userId])

  // Keep the list live: a scan saved on another screen appears here without
  // a reload. This behaviour existed before the redesign and is preserved.
  useEffect(() => {
    const channel = supabase
      .channel('contacts-list')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'scanned_contacts',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const inserted = payload.new as ContactListRow
          setRows((prev) =>
            prev.some((row) => row.id === inserted.id) ? prev : [inserted, ...prev]
          )
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'scanned_contacts',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new as ContactListRow
          setRows((prev) =>
            prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row))
          )
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, userId])

  const contacts = useMemo(() => rows.map((row) => toContactCard(row)), [rows])
  const events = useMemo(() => eventOptions(contacts), [contacts])

  const visible = useMemo(
    () =>
      contacts.filter(
        (contact) =>
          matchesFilter(contact, filter) &&
          matchesQuery(contact, query) &&
          (eventFilter === ALL_EVENTS || contact.event === eventFilter)
      ),
    [contacts, filter, query, eventFilter]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id)
      setNotice(null)
      const snapshot = rows

      try {
        const res = await fetch('/api/card/delete', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactId: id }),
        })
        if (!res.ok) throw new Error('delete failed')
        setRows((prev) => prev.filter((row) => row.id !== id))
        setNotice('Contact deleted.')
        setTimeout(() => setNotice(null), 2500)
      } catch {
        setRows(snapshot)
        setNotice('Could not delete that contact.')
        setTimeout(() => setNotice(null), 3000)
      } finally {
        setDeletingId(null)
      }
    },
    [rows]
  )

  const hasAnyContacts = contacts.length > 0
  const filtersActive = filter !== 'all' || eventFilter !== ALL_EVENTS || query.trim().length > 0

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <header className="min-w-0">
          <SectionLabel>Contacts</SectionLabel>
          <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-tight text-abc-text lg:text-[36px]">
            Your connections
          </h1>
          <p className="mt-1.5 text-[14px] text-abc-secondary lg:text-[16px]">
            People you met, with the context that matters.
          </p>
        </header>

        <Button href="/scan" size="md" className="shrink-0">
          <IconCamera size={18} stroke={1.9} />
          Scan new contact
        </Button>
      </div>

      {failed ? (
        <div className="abc-surface mt-6">
          <EmptyState
            icon={IconUsers}
            title="We couldn't load your contacts."
            description="Something went wrong on our side. Your data is safe."
            action={
              <Button onClick={() => void reload()} disabled={retrying}>
                {retrying ? 'Trying…' : 'Try again'}
              </Button>
            }
          />
        </div>
      ) : !hasAnyContacts ? (
        <div className="abc-surface mt-6">
          <EmptyState
            icon={IconUsers}
            title="Your next connection starts here."
            description="Scan a business card, badge or QR to save your first connection."
            action={
              <Button href="/scan" size="lg">
                <IconCamera size={18} stroke={1.9} />
                Scan your first contact
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {/* Search + filters */}
          <div className="mt-6 flex flex-col gap-3">
            <div className="relative">
              <IconSearch
                size={18}
                stroke={1.8}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-abc-muted"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search contacts..."
                aria-label="Search contacts"
                className="h-12 w-full rounded-inner border border-abc-border bg-abc-card pl-11 pr-10 text-[16px] text-abc-text outline-none transition-colors duration-200 ease-abc placeholder:text-abc-muted focus:border-abc-gold-accent sm:text-[15px]"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-abc-muted transition-colors hover:text-abc-text abc-focus-ring"
                >
                  <IconX size={16} stroke={1.9} />
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="abc-scroll-x -mx-1 flex-1 px-1">
                <div className="flex gap-2">
                  {CONTACT_FILTERS.map((item) => {
                    const active = filter === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setFilter(item.id)}
                        aria-pressed={active}
                        className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-[12.5px] font-medium transition-colors duration-200 ease-abc abc-focus-ring ${
                          active
                            ? 'border-transparent text-[#1a1205]'
                            : 'border-abc-border bg-abc-raised text-abc-secondary hover:border-abc-border-strong hover:text-abc-text'
                        }`}
                        style={active ? { background: 'var(--abc-gold)' } : undefined}
                      >
                        {item.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {events.length > 1 ? (
                <select
                  value={eventFilter}
                  onChange={(e) => setEventFilter(e.target.value)}
                  aria-label="Filter by event"
                  className="h-10 max-w-[220px] shrink-0 rounded-full border border-abc-border bg-abc-raised px-3 text-[12.5px] text-abc-secondary outline-none transition-colors duration-200 ease-abc focus:border-abc-gold-accent"
                >
                  <option value={ALL_EVENTS}>All events</option>
                  {events.map((event) => (
                    <option key={event} value={event}>
                      {event}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>

          {/* Count */}
          <p className="mt-4 text-[12.5px] text-abc-muted" aria-live="polite">
            {visible.length === contacts.length
              ? `${contacts.length} ${contacts.length === 1 ? 'connection' : 'connections'}`
              : `${visible.length} of ${contacts.length}`}
          </p>

          {/* List */}
          {visible.length === 0 ? (
            <div className="abc-surface mt-3">
              <EmptyState
                icon={IconSearch}
                title="No contacts match that."
                description={
                  filtersActive
                    ? 'Try a different search or clear the filters.'
                    : 'Nothing here yet.'
                }
                action={
                  filtersActive ? (
                    <Button
                      variant="surface"
                      onClick={() => {
                        setQuery('')
                        setFilter('all')
                        setEventFilter(ALL_EVENTS)
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <ul className="abc-surface mt-3 divide-y divide-abc-border overflow-hidden">
              {visible.map((contact) => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  onDelete={(id) => void handleDelete(id)}
                  deleting={deletingId === contact.id}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {notice ? (
        <p
          className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] left-1/2 z-[120] -translate-x-1/2 rounded-full border border-abc-border bg-abc-card px-4 py-2.5 text-[13px] text-abc-text shadow-abc-raised lg:bottom-8"
          role="status"
        >
          {notice}
        </p>
      ) : null}
    </div>
  )
}
