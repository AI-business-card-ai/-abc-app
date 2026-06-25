'use client'

import { useEffect, useState } from 'react'
import { PIPELINE_STAGES } from '@/lib/pipeline'
import { updateContact } from '@/lib/crm-client'
import TagPills from '@/components/crm/TagPills'
import TagSelector from '@/components/crm/TagSelector'
import type { PipelineStageId, ScannedContact } from '@/lib/types'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CZK']

type Props = {
  contact: ScannedContact
  onUpdated: (contact: ScannedContact) => void
}

export default function DealInformation({ contact, onUpdated }: Props) {
  const [stage, setStage] = useState<PipelineStageId>((contact.pipeline_stage as PipelineStageId) || 'new')
  const [dealValue, setDealValue] = useState(String(contact.deal_value || ''))
  const [currency, setCurrency] = useState(contact.deal_currency || 'USD')
  const [closeDate, setCloseDate] = useState(contact.expected_close_date || '')
  const [tags, setTags] = useState<string[]>(contact.tags || [])
  const [showTagSelector, setShowTagSelector] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setStage((contact.pipeline_stage as PipelineStageId) || 'new')
    setDealValue(String(contact.deal_value || ''))
    setCurrency(contact.deal_currency || 'USD')
    setCloseDate(contact.expected_close_date || '')
    setTags(contact.tags || [])
  }, [contact])

  async function handleSave() {
    setSaving(true)
    try {
      const { contact: updated } = await updateContact({
        contactId: contact.id,
        pipeline_stage: stage,
        deal_value: Number(dealValue) || 0,
        deal_currency: currency,
        expected_close_date: closeDate || null,
        tags,
      })
      onUpdated(updated as ScannedContact)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="abc-card p-4 flex flex-col gap-4">
      <span className="abc-label">Deal Information</span>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: '#8892b0' }}>
          Pipeline Stage
        </label>
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value as PipelineStageId)}
          className="abc-input px-3 py-2 text-sm"
        >
          {PIPELINE_STAGES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: '#8892b0' }}>
            Deal Value
          </label>
          <input
            type="number"
            min="0"
            value={dealValue}
            onChange={(e) => setDealValue(e.target.value)}
            placeholder="0"
            className="abc-input px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: '#8892b0' }}>
            Currency
          </label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="abc-input px-3 py-2 text-sm"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: '#8892b0' }}>
          Expected Close
        </label>
        <input
          type="date"
          value={closeDate}
          onChange={(e) => setCloseDate(e.target.value)}
          className="abc-input px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: '#8892b0' }}>
          Lead Source
        </label>
        <p className="text-sm" style={{ color: '#f0f0ff' }}>
          {contact.lead_source || 'ABC AI Business Card'}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: '#8892b0' }}>
          Tags
        </label>
        <TagPills
          tags={tags}
          onRemove={(tag) => setTags((prev) => prev.filter((t) => t !== tag))}
          onAdd={() => setShowTagSelector(true)}
        />
        {showTagSelector && (
          <TagSelector
            selected={tags}
            onSave={(next) => {
              setTags(next)
              setShowTagSelector(false)
            }}
            onClose={() => setShowTagSelector(false)}
          />
        )}
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="glow-btn rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  )
}
