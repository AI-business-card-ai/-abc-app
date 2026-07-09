'use client'

import { useState } from 'react'
import type { ScannedContact } from '@/lib/types'

type ExportTarget = 'salesforce' | 'hubspot'

type Props = {
  open: boolean
  target: ExportTarget | null
  contact: ScannedContact
  onClose: () => void
  onExport: (contact: ScannedContact, target: ExportTarget) => void
}

export default function CrmExportEventModal({ open, target, contact, onClose, onExport }: Props) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open || !target) return null

  async function handleConfirm() {
    const trimmed = value.trim()
    if (!trimmed) {
      setError('Add where you met.')
      return
    }

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

      const updated = data.contact as ScannedContact
      onExport(updated, target as ExportTarget)
      setValue('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const targetLabel = target === 'salesforce' ? 'Salesforce' : 'HubSpot'

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(7, 5, 14, 0.92)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-5"
        style={{ background: '#1a1a1a', border: '2px solid rgba(0, 212, 212, 0.35)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-lg font-bold mb-2" style={{ color: '#ffffff' }}>
          Add where you met before CRM export
        </p>
        <p className="text-sm mb-4" style={{ color: '#999999' }}>
          {targetLabel} export requires meeting context. Fill it in below and export will start right after.
        </p>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleConfirm()}
          placeholder="Trade show, meeting, intro…"
          className="w-full abc-input px-3 py-3 text-base mb-3 min-h-[48px]"
          autoFocus
          disabled={saving}
        />
        {error && (
          <p className="text-sm mb-3" style={{ color: '#fca5a5' }}>
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleConfirm()}
            className="flex-1 rounded-xl py-3 font-bold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #f0197d, #00d4d4)' }}
          >
            {saving ? 'Saving…' : `Save & export → ${targetLabel}`}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-3 text-sm"
            style={{ border: '1px solid #2a2a2a', color: '#999999' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
