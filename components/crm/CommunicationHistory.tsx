'use client'

import { useState } from 'react'
import { updateContact } from '@/lib/crm-client'
import ActivityTimeline from '@/components/crm/ActivityTimeline'
import type { ScannedContact } from '@/lib/types'

function formatLastMessage(contact: ScannedContact): string {
  if (!contact.last_message_type || !contact.last_message_date) return '—'
  const d = new Date(contact.last_message_date)
  const now = Date.now()
  const diffDays = Math.floor((now - d.getTime()) / 86400000)
  const when =
    diffDays === 0 ? 'today' : diffDays === 1 ? '1 day ago' : `${diffDays} days ago`
  return `${contact.last_message_type} · ${when}`
}

type Props = {
  contact: ScannedContact
  onUpdated: (contact: ScannedContact) => void
}

export default function CommunicationHistory({ contact, onUpdated }: Props) {
  const [saving, setSaving] = useState(false)
  const [timelineKey, setTimelineKey] = useState(0)

  async function setResponse(received: boolean) {
    setSaving(true)
    try {
      const { contact: updated } = await updateContact({
        contactId: contact.id,
        response_received: received,
      })
      onUpdated(updated as ScannedContact)
      setTimelineKey((k) => k + 1)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="abc-card p-4 flex flex-col gap-4">
      <span className="abc-label">Communication History</span>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-wide font-bold mb-1" style={{ color: '#8892b0' }}>
            Messages sent
          </p>
          <p style={{ color: '#f0f0ff' }}>{contact.messages_sent ?? 0}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide font-bold mb-1" style={{ color: '#8892b0' }}>
            Last message
          </p>
          <p style={{ color: '#f0f0ff' }}>{formatLastMessage(contact)}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[10px] uppercase tracking-wide font-bold" style={{ color: '#8892b0' }}>
          Response
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => setResponse(true)}
            className="flex-1 rounded-lg py-2 text-xs font-semibold disabled:opacity-40"
            style={
              contact.response_received
                ? { background: 'rgba(34,197,94,0.2)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.4)' }
                : { background: '#141628', color: '#8892b0', border: '1px solid rgba(139,92,246,0.15)' }
            }
          >
            ✓ Yes
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => setResponse(false)}
            className="flex-1 rounded-lg py-2 text-xs font-semibold disabled:opacity-40"
            style={
              contact.response_received === false && !contact.response_date
                ? { background: '#141628', color: '#8892b0', border: '1px solid rgba(139,92,246,0.15)' }
                : !contact.response_received
                  ? { background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.35)' }
                  : { background: '#141628', color: '#8892b0', border: '1px solid rgba(139,92,246,0.15)' }
            }
          >
            ✗ No
          </button>
        </div>
      </div>

      <div className="border-t pt-3" style={{ borderColor: 'rgba(139,92,246,0.12)' }}>
        <ActivityTimeline key={timelineKey} contactId={contact.id} />
      </div>
    </div>
  )
}
