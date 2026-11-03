'use client'

import { useEffect, useState } from 'react'
import { eventDateLabel } from '@/lib/events/planned'

type Option = { id: string; name: string; startsOn: string | null; endsOn: string | null }

/**
 * Link a meeting to a planned event, when the owner chooses to.
 *
 * "None" is the default and nothing here guesses: no event text, date or place
 * preselects an option. With no planned events there is nothing to choose, so the
 * field does not appear at all.
 */
export default function PlannedEventSelect({
  value,
  onChange,
  disabled = false,
  labelClassName = 'mb-1.5 block text-[12px] text-abc-muted',
  selectClassName = 'h-11 w-full rounded-inner border border-abc-border bg-abc-raised px-3 text-[16px] text-abc-text outline-none transition-colors duration-200 ease-abc focus:border-abc-gold-accent sm:text-[15px]',
}: {
  value: string | null
  onChange: (id: string | null) => void
  disabled?: boolean
  labelClassName?: string
  selectClassName?: string
}) {
  const [options, setOptions] = useState<Option[]>([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/events/planned')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.events)) setOptions(data.events as Option[])
      })
      // The field is optional, so failing to load it must not get in the way of a save.
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (options.length === 0) return null

  return (
    <label className="block">
      <span className={labelClassName}>Associate with planned event</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        className={selectClassName}
      >
        <option value="">None</option>
        {options.map((option) => {
          const day = eventDateLabel(option)
          return (
            <option key={option.id} value={option.id}>
              {day ? `${option.name} · ${day}` : option.name}
            </option>
          )
        })}
      </select>
    </label>
  )
}
