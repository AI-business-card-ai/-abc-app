'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { contactHasEventTag } from '@/lib/event-tag'
import type { ScannedContact } from '@/lib/types'

type Props = {
  contact: ScannedContact
  onContactUpdated: (contact: ScannedContact) => void
}

export default function EventTagPrompt({ contact, onContactUpdated }: Props) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [rescoring, setRescoring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const visible = !contactHasEventTag(contact)

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  async function saveEventTag(text: string) {
    const trimmed = text.trim()
    if (!trimmed || saving) return

    setSaving(true)
    setRescoring(true)
    setError(null)

    try {
      const res = await fetch('/api/card/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: contact.id,
          eventName: trimmed,
          note: trimmed,
          recalculateScore: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')

      onContactUpdated(data.contact as ScannedContact)
      setValue('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
      setRescoring(false)
    }
  }

  function scheduleSave(text: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void saveEventTag(text)
    }, 700)
  }

  function handleChange(next: string) {
    setValue(next)
    if (next.trim().length >= 3) {
      scheduleSave(next)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (debounceRef.current) clearTimeout(debounceRef.current)
      void saveEventTag(value)
    }
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="rounded-2xl p-4 mb-1"
          style={{
            background: 'linear-gradient(135deg, rgba(240,25,125,0.14), rgba(0,212,212,0.12))',
            border: '2px solid rgba(0, 212, 212, 0.45)',
            boxShadow: '0 0 32px rgba(0, 212, 212, 0.12)',
          }}
        >
          <p className="text-sm font-bold mb-1" style={{ color: '#ffffff' }}>
            📍 Kde jste se potkali? Doplň pro lepší match score
          </p>
          <p className="text-xs mb-3" style={{ color: '#b8c5d6' }}>
            Např. ISE 2026, networking večer, intro od kolegy… Uloží se automaticky a přepočítá AI score.
          </p>
          <input
            id="crm-event-input"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (value.trim().length >= 3) {
                if (debounceRef.current) clearTimeout(debounceRef.current)
                void saveEventTag(value)
              }
            }}
            disabled={saving}
            placeholder="Veletrh, schůzka, intro…"
            className="w-full abc-input px-3 py-3 text-base min-h-[48px]"
            autoComplete="off"
          />
          <div className="flex items-center justify-between mt-2 gap-2">
            <span className="text-[11px]" style={{ color: rescoring ? '#00d4d4' : '#8892b0' }}>
              {rescoring ? 'Přepočítávám match score…' : saving ? 'Ukládám…' : 'Enter nebo 0.7s po psaní'}
            </span>
          </div>
          {error && (
            <p className="text-xs mt-2" style={{ color: '#fca5a5' }}>
              {error}
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
