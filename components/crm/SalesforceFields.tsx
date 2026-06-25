'use client'

import { useEffect, useState } from 'react'
import { updateContact } from '@/lib/crm-client'
import {
  LEAD_RATINGS,
  LEAD_STATUSES,
  OPPORTUNITY_STAGES,
  scoreToCloseProbability,
  type LeadRating,
  type LeadStatus,
  type OpportunityStage,
} from '@/lib/data-model'
import type { ScannedContact } from '@/lib/types'

type Props = {
  contact: ScannedContact
  onUpdated: (contact: ScannedContact) => void
}

export default function SalesforceFields({ contact, onUpdated }: Props) {
  const [rating, setRating] = useState<LeadRating>((contact.rating as LeadRating) || 'Warm')
  const [leadStatus, setLeadStatus] = useState<LeadStatus>((contact.lead_status as LeadStatus) || 'New')
  const [oppStage, setOppStage] = useState(contact.opportunity_stage || 'Prospecting')
  const [closeProb, setCloseProb] = useState(
    String(contact.close_probability ?? scoreToCloseProbability(contact.ai_lead_score ?? contact.match_score ?? 0))
  )
  const [nextStep, setNextStep] = useState(contact.next_step || contact.next_action || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setRating((contact.rating as LeadRating) || 'Warm')
    setLeadStatus((contact.lead_status as LeadStatus) || 'New')
    setOppStage(contact.opportunity_stage || 'Prospecting')
    setCloseProb(
      String(contact.close_probability ?? scoreToCloseProbability(contact.ai_lead_score ?? contact.match_score ?? 0))
    )
    setNextStep(contact.next_step || contact.next_action || '')
  }, [contact])

  async function save(fields: {
    rating?: string
    lead_status?: string
    opportunity_stage?: string
    close_probability?: number
    next_step?: string
  }) {
    setSaving(true)
    try {
      const { contact: updated } = await updateContact({
        contactId: contact.id,
        ...fields,
      })
      onUpdated(updated)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function saveRating(r: LeadRating) {
    setRating(r)
    await save({ rating: r })
  }

  async function saveLeadStatus(v: LeadStatus) {
    setLeadStatus(v)
    await save({ lead_status: v })
  }

  async function saveOppStage(v: string) {
    setOppStage(v)
    await save({ opportunity_stage: v })
  }

  async function saveCloseProb() {
    await save({ close_probability: Number(closeProb) || 0 })
  }

  async function saveNextStep() {
    await save({ next_step: nextStep })
  }

  const ratingStyle = (r: LeadRating, active: boolean) => {
    const colors: Record<LeadRating, string> = {
      Hot: '#ef4444',
      Warm: '#f59e0b',
      Cold: '#6b7280',
    }
    return active
      ? { background: colors[r], color: '#fff', border: `1px solid ${colors[r]}` }
      : { background: 'transparent', color: colors[r], border: `1px solid ${colors[r]}66` }
  }

  return (
    <div className="abc-card p-4 flex flex-col gap-4">
      <span className="abc-label">Salesforce Fields</span>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: '#8892b0' }}>
          Rating
        </label>
        <div className="flex gap-2">
          {LEAD_RATINGS.map((r) => (
            <button
              key={r}
              type="button"
              disabled={saving}
              onClick={() => saveRating(r)}
              className="flex-1 rounded-lg py-2 text-xs font-semibold disabled:opacity-40"
              style={ratingStyle(r, rating === r)}
            >
              {r === 'Hot' ? 'Hot 🔥' : r}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: '#8892b0' }}>
          Lead Status
        </label>
        <select
          value={leadStatus}
          onChange={(e) => saveLeadStatus(e.target.value as LeadStatus)}
          disabled={saving}
          className="abc-input px-3 py-2 text-sm"
        >
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: '#8892b0' }}>
          Opportunity Stage
        </label>
        <select
          value={oppStage}
          onChange={(e) => saveOppStage(e.target.value)}
          disabled={saving}
          className="abc-input px-3 py-2 text-sm"
        >
          {OPPORTUNITY_STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: '#8892b0' }}>
          Close Probability
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            max={100}
            value={closeProb}
            onChange={(e) => setCloseProb(e.target.value)}
            className="abc-input px-3 py-2 text-sm flex-1"
          />
          <span className="self-center text-sm" style={{ color: '#8892b0' }}>
            %
          </span>
          <button
            type="button"
            disabled={saving}
            onClick={saveCloseProb}
            className="text-xs px-3 py-2 rounded-lg font-semibold"
            style={{ border: '1px solid rgba(0,212,212,0.4)', color: '#00d4d4' }}
          >
            Save
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: '#8892b0' }}>
          Next Step
        </label>
        <input
          type="text"
          value={nextStep}
          onChange={(e) => setNextStep(e.target.value)}
          onBlur={saveNextStep}
          placeholder="What to do next…"
          className="abc-input px-3 py-2 text-sm"
        />
      </div>

      {contact.opportunity_name && (
        <p className="text-xs" style={{ color: '#8892b0' }}>
          Opportunity: <span style={{ color: '#f0f0ff' }}>{contact.opportunity_name}</span>
        </p>
      )}
    </div>
  )
}
