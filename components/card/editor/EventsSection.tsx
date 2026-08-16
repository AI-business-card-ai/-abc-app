'use client'

import { IconPlus, IconTrash } from '@tabler/icons-react'
import type { CardEvent } from '@/lib/card/types'

/**
 * "Where to find me" — the trade-fair use case. Events are entirely
 * user-entered; the old build shipped a hardcoded list of specific fairs,
 * which made every user's card advertise the same five events.
 */
export default function EventsSection({
  events,
  onChange,
}: {
  events: CardEvent[]
  onChange: (events: CardEvent[]) => void
}) {
  function add() {
    onChange([
      ...events,
      {
        id: crypto.randomUUID(),
        user_id: '',
        name: '',
        city: '',
        date_from: null,
        date_to: null,
        booth: '',
      },
    ])
  }

  function update(id: string, patch: Partial<CardEvent>) {
    onChange(events.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }

  function remove(id: string) {
    onChange(events.filter((e) => e.id !== id))
  }

  return (
    <div className="flex flex-col gap-4">
      {events.length === 0 ? (
        <p className="text-[13px] leading-[1.5] text-abc-muted">
          Add a fair or conference you are attending, and it shows on your card while it runs.
        </p>
      ) : null}

      {events.map((event) => (
        <div key={event.id} className="rounded-inner border border-abc-border bg-abc-raised p-3.5">
          <label className="sr-only" htmlFor={`event-name-${event.id}`}>
            Event name
          </label>
          <input
            id={`event-name-${event.id}`}
            value={event.name}
            onChange={(e) => update(event.id, { name: e.target.value })}
            placeholder="Event name"
            className="h-[48px] w-full rounded-inner border border-abc-border bg-abc-card px-3 text-[16px] text-abc-text outline-none placeholder:text-abc-muted focus:border-abc-gold-border"
          />

          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className="sr-only" htmlFor={`event-city-${event.id}`}>
                City
              </label>
              <input
                id={`event-city-${event.id}`}
                value={event.city || ''}
                onChange={(e) => update(event.id, { city: e.target.value })}
                placeholder="City"
                className="h-[48px] w-full rounded-inner border border-abc-border bg-abc-card px-3 text-[16px] text-abc-text outline-none placeholder:text-abc-muted focus:border-abc-gold-border"
              />
            </div>
            <div>
              <label className="sr-only" htmlFor={`event-booth-${event.id}`}>
                Stand
              </label>
              <input
                id={`event-booth-${event.id}`}
                value={event.booth || ''}
                onChange={(e) => update(event.id, { booth: e.target.value })}
                placeholder="Stand"
                className="h-[48px] w-full rounded-inner border border-abc-border bg-abc-card px-3 text-[16px] text-abc-text outline-none placeholder:text-abc-muted focus:border-abc-gold-border"
              />
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor={`event-from-${event.id}`}
                className="block text-[11.5px] text-abc-muted"
              >
                From
              </label>
              <input
                id={`event-from-${event.id}`}
                type="date"
                value={event.date_from || ''}
                onChange={(e) => update(event.id, { date_from: e.target.value || null })}
                className="mt-1 h-[48px] w-full rounded-inner border border-abc-border bg-abc-card px-3 text-[16px] text-abc-text outline-none focus:border-abc-gold-border"
              />
            </div>
            <div>
              <label htmlFor={`event-to-${event.id}`} className="block text-[11.5px] text-abc-muted">
                To
              </label>
              <input
                id={`event-to-${event.id}`}
                type="date"
                value={event.date_to || ''}
                onChange={(e) => update(event.id, { date_to: e.target.value || null })}
                className="mt-1 h-[48px] w-full rounded-inner border border-abc-border bg-abc-card px-3 text-[16px] text-abc-text outline-none focus:border-abc-gold-border"
              />
            </div>
          </div>

          <div className="mt-2.5 flex justify-end">
            <button
              type="button"
              onClick={() => remove(event.id)}
              className="inline-flex h-[44px] items-center gap-1.5 rounded-btn px-3 text-[13px] font-medium text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
            >
              <IconTrash size={16} stroke={1.8} />
              Remove
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="inline-flex h-[48px] items-center justify-center gap-2 rounded-btn border border-abc-border bg-abc-raised px-4 text-[14px] font-medium text-abc-text transition-colors duration-200 ease-abc hover:border-abc-border-strong abc-focus-ring"
      >
        <IconPlus size={17} stroke={1.9} />
        Add event
      </button>

      <p className="text-[12px] leading-[1.5] text-abc-muted">
        Events disappear from your card automatically once the end date passes.
      </p>
    </div>
  )
}
