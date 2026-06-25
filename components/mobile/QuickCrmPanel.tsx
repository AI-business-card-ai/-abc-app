'use client'

import { useState } from 'react'
import { PIPELINE_STAGES } from '@/lib/pipeline'
import { updateContact, logReplyReceived } from '@/lib/crm-client'
import { hapticLight } from '@/lib/hooks/useHaptic'
import type { PipelineStageId, ScannedContact } from '@/lib/types'

type Props = {
  contact: ScannedContact
  onUpdated: (c: ScannedContact) => void
  onNotify?: (msg: string) => void
}

export default function QuickCrmPanel({ contact, onUpdated, onNotify }: Props) {
  const [dealValue, setDealValue] = useState(String(contact.deal_value || ''))
  const [saving, setSaving] = useState(false)

  async function setStage(stage: PipelineStageId) {
    if (contact.pipeline_stage === stage) return
    hapticLight()
    setSaving(true)
    try {
      const { contact: updated } = await updateContact({ contactId: contact.id, pipeline_stage: stage })
      onUpdated(updated)
      onNotify?.('✓ CRM updated automatically')
    } finally {
      setSaving(false)
    }
  }

  async function toggleReply() {
    hapticLight()
    setSaving(true)
    try {
      if (contact.response_received) {
        const { contact: updated } = await updateContact({
          contactId: contact.id,
          response_received: false,
        })
        onUpdated(updated)
      } else {
        const { contact: updated } = await logReplyReceived(contact.id)
        onUpdated(updated)
        onNotify?.('🎉 Great! Schedule a meeting now')
      }
    } finally {
      setSaving(false)
    }
  }

  async function saveDeal() {
    const { contact: updated } = await updateContact({
      contactId: contact.id,
      deal_value: Number(dealValue) || 0,
    })
    onUpdated(updated)
  }

  return (
    <div className="abc-card p-4 flex flex-col gap-4">
      <span className="abc-label">Quick CRM</span>
      <p className="text-[11px]" style={{ color: '#4a5168' }}>
        Status updates automatically when you send messages or mark replies.
      </p>

      <div className="flex flex-wrap gap-2">
        {PIPELINE_STAGES.filter((s) => s.id !== 'lost').map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={saving}
            onClick={() => setStage(s.id)}
            className="rounded-full px-3 py-2 text-[11px] font-bold uppercase min-h-[44px] disabled:opacity-40"
            style={
              contact.pipeline_stage === s.id
                ? { background: s.color, color: '#0d0f1a', border: `1px solid ${s.color}` }
                : { background: 'transparent', color: s.color, border: `1px solid ${s.color}66` }
            }
          >
            {s.label.replace(' ✓', '')}
          </button>
        ))}
      </div>

      {contact.pipeline_stage === 'meeting' && contact.response_received && (
        <button
          type="button"
          onClick={() => onNotify?.('Open calendar to schedule a meeting')}
          className="w-full rounded-xl py-3 text-sm font-semibold min-h-[44px]"
          style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}
        >
          📅 Schedule Meeting
        </button>
      )}

      <div className="flex gap-2 items-center">
        <span className="text-xs shrink-0" style={{ color: '#8892b0' }}>
          💰 Deal
        </span>
        <input
          type="number"
          value={dealValue}
          onChange={(e) => setDealValue(e.target.value)}
          onBlur={saveDeal}
          placeholder="0"
          className="abc-input flex-1 px-3 py-2.5 text-base min-h-[44px]"
        />
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={toggleReply}
        className="w-full rounded-xl py-3 text-sm font-semibold min-h-[44px] disabled:opacity-40"
        style={
          contact.response_received
            ? { background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.35)' }
            : { background: '#141628', color: '#8892b0', border: '1px solid rgba(139,92,246,0.15)' }
        }
      >
        {contact.response_received ? '✓ Got reply' : 'Mark reply received'}
      </button>
    </div>
  )
}
