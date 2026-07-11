'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  contactReadyForCrmExport,
  getCrmFieldLabel,
  getMissingCrmFields,
} from '@/lib/crm-mandatory-fields'
import type { ScannedContact } from '@/lib/types'

type Props = {
  contact: ScannedContact
  onContactUpdated: (contact: ScannedContact) => void
}

export default function CrmMissingFieldsBanner({ contact, onContactUpdated }: Props) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const missing = getMissingCrmFields(contact).filter((f) => f === 'event_context')
  const visible = missing.length > 0

  async function saveEvent() {
    const trimmed = value.trim()
    if (!trimmed || saving) return

    setSaving(true)
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
    }
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="rounded-2xl p-4 mb-2"
          style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '2px solid rgba(245, 158, 11, 0.45)',
            boxShadow: '0 0 24px rgba(245, 158, 11, 0.08)',
          }}
        >
          <p className="text-sm font-bold mb-1" style={{ color: '#fbbf24' }}>
            ⚠ Missing data for CRM export
          </p>
          <p className="text-xs mb-3" style={{ color: '#fcd34d' }}>
            Add: {missing.map(getCrmFieldLabel).join(' · ')}
          </p>
          <input
            id="crm-event-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void saveEvent()
              }
            }}
            disabled={saving}
            placeholder="Where did you meet? Trade show, meeting, intro…"
            className="w-full abc-input px-3 py-3 text-base min-h-[48px] mb-2"
            autoComplete="off"
          />
          <button
            type="button"
            disabled={saving || !value.trim()}
            onClick={() => void saveEvent()}
            className="rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #f0197d, #00d4d4)', color: '#ffffff' }}
          >
            {saving ? 'Saving…' : 'Save meeting context'}
          </button>
          {error && (
            <p className="text-xs mt-2" style={{ color: '#fca5a5' }}>
              {error}
            </p>
          )}
          {!contactReadyForCrmExport(contact) && (
            <p className="text-[10px] mt-2" style={{ color: '#a3a3a3' }}>
              Export to Salesforce/HubSpot will be available once all fields are filled.
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
