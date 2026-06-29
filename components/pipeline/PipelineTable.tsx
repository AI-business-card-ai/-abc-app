'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DealOutcomeModal from '@/components/crm/DealOutcomeModal'
import TagPills from '@/components/crm/TagPills'
import TagSelector from '@/components/crm/TagSelector'
import { updateContact, logReplyReceived } from '@/lib/crm-client'
import { formatDealValue } from '@/lib/tags'
import {
  actionButtonStyle,
  daysSinceActivity,
  getAiNextStep,
  getScoreTier,
  getStatusColor,
} from '@/lib/pipeline-ai'
import type { ScannedContact } from '@/lib/types'

function ContactAvatar({ contact, size = 32 }: { contact: ScannedContact; size?: number }) {
  const initials =
    contact.name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() || '?'

  if (contact.photo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={contact.photo_url}
        alt=""
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size, border: '1px solid rgba(255,255,255,0.12)' }}
      />
    )
  }

  return (
    <div
      className="rounded-full flex items-center justify-center font-bold shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.35,
        background: 'linear-gradient(135deg, #f0197d, #00d4d4)',
        color: '#ffffff',
      }}
    >
      {initials}
    </div>
  )
}

type RowProps = {
  contact: ScannedContact
  onAction: (contact: ScannedContact, step: ReturnType<typeof getAiNextStep>) => void
  onUpdate: (contact: ScannedContact) => void
  showWonBadge?: boolean
  onDealOutcome: (contact: ScannedContact, mode: 'won' | 'lost') => void
}

function PipelineRow({ contact, onAction, onUpdate, showWonBadge, onDealOutcome }: RowProps) {
  const router = useRouter()
  const [editingDeal, setEditingDeal] = useState(false)
  const [dealValue, setDealValue] = useState(String(contact.deal_value || ''))
  const [closeDate, setCloseDate] = useState(contact.expected_close_date || '')
  const [showTags, setShowTags] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [note, setNote] = useState(contact.pipeline_notes || '')
  const [showDealPanel, setShowDealPanel] = useState(false)
  const [saving, setSaving] = useState(false)

  const score = contact.ai_lead_score ?? contact.match_score ?? 0
  const scoreTier = getScoreTier(score)
  const status = contact.crm_status || 'NEW'
  const statusColor = getStatusColor(contact.crm_status)
  const days = daysSinceActivity(contact)
  const step = getAiNextStep(contact)
  const btnStyle = actionButtonStyle(step.color, step.urgent)
  const dealNum = Number(contact.deal_value) || 0
  const currency = contact.deal_currency || 'USD'

  async function saveDeal() {
    setSaving(true)
    try {
      const { contact: updated } = await updateContact({
        contactId: contact.id,
        deal_value: Number(dealValue) || 0,
        expected_close_date: closeDate || null,
      })
      onUpdate(updated as ScannedContact)
      setEditingDeal(false)
      setShowDealPanel(false)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function saveTags(tags: string[]) {
    setSaving(true)
    try {
      const { contact: updated } = await updateContact({ contactId: contact.id, tags })
      onUpdate(updated as ScannedContact)
      setShowTags(false)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function saveNote() {
    setSaving(true)
    try {
      const { contact: updated } = await updateContact({
        contactId: contact.id,
        pipeline_notes: note,
      })
      onUpdate(updated as ScannedContact)
      setShowNote(false)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function toggleResponse() {
    setSaving(true)
    try {
      if (contact.response_received) {
        const { contact: updated } = await updateContact({
          contactId: contact.id,
          response_received: false,
        })
        onUpdate(updated as ScannedContact)
      } else {
        const { contact: updated } = await logReplyReceived(contact.id)
        onUpdate(updated as ScannedContact)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div
        className="grid grid-cols-[1.4fr_1fr_0.7fr_0.8fr_0.7fr_1.4fr_1fr] gap-3 items-start px-4 py-3 transition-colors relative cursor-pointer"
        style={{ borderBottom: '1px solid #2a2a2a', background: '#1a1a1a' }}
        onClick={() => router.push(`/contacts/${contact.id}`)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && router.push(`/contacts/${contact.id}`)}
      >
        <div className="flex items-start gap-2 min-w-0 pt-0.5">
          <ContactAvatar contact={contact} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold truncate" style={{ color: '#ffffff' }}>
                {contact.name?.trim() || 'Unknown'}
              </span>
              {showWonBadge && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b' }}>
                  🏆 Won
                </span>
              )}
            </div>
            <TagPills tags={contact.tags || []} compact />
            {showWonBadge && contact.expected_close_date && (
              <p className="text-[10px] mt-1" style={{ color: '#999999' }}>
                Closed {new Date(contact.expected_close_date).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
        <span className="text-xs truncate pt-1" style={{ color: '#999999' }}>
          {[contact.company, contact.role].filter(Boolean).join(' · ') || '—'}
        </span>
        <span
          className="inline-flex w-fit rounded-md px-2 py-0.5 text-xs font-bold text-white mt-0.5"
          style={{ background: scoreTier.bg }}
        >
          {score}
        </span>
        <span
          className="inline-flex w-fit rounded-full px-2 py-0.5 text-[9px] font-bold uppercase mt-0.5"
          style={{ background: 'transparent', color: statusColor, border: `1px solid ${statusColor}` }}
        >
          {status.replace(/_/g, ' ')}
        </span>
        <span className="text-xs pt-1" style={{ color: '#4a5168' }}>
          {days === 0 ? 'Today' : `${days}d`}
        </span>
        <span className="text-xs truncate italic pt-1" style={{ color: '#999999' }}>
          ⚡ {step.text}
        </span>
        <div className="flex flex-col gap-1.5 items-start" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onAction(contact, step)
            }}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap hover:opacity-90"
            style={btnStyle}
          >
            {step.action}
          </button>
          {editingDeal || showDealPanel ? (
            <div className="flex flex-col gap-1 w-full">
              <input
                type="number"
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
                className="abc-input px-2 py-1 text-xs w-full"
                placeholder="Deal value"
              />
              <input
                type="date"
                value={closeDate}
                onChange={(e) => setCloseDate(e.target.value)}
                className="abc-input px-2 py-1 text-xs w-full"
              />
              <button
                type="button"
                disabled={saving}
                onClick={(e) => {
                  e.stopPropagation()
                  saveDeal()
                }}
                className="text-[10px] font-semibold"
                style={{ color: '#00d4d4' }}
              >
                Save
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setDealValue(String(contact.deal_value || ''))
                setCloseDate(contact.expected_close_date || '')
                setEditingDeal(true)
              }}
              className="text-[10px] hover:opacity-80"
              style={{ color: dealNum > 0 ? '#f59e0b' : '#999999' }}
            >
              {dealNum > 0 ? `💰 ${formatDealValue(dealNum, currency)}` : '💰 Add deal value'}
            </button>
          )}
          {contact.pipeline_stage === 'deal' && (
            <div className="flex flex-wrap gap-1 mt-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDealOutcome(contact, 'won')
                }}
                className="text-[10px] px-2 py-1 rounded font-semibold min-h-[32px]"
                style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}
              >
                🏆 Won
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDealOutcome(contact, 'lost')
                }}
                className="text-[10px] px-2 py-1 rounded font-semibold min-h-[32px]"
                style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}
              >
                ✗ Lost
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-1">
              <button type="button" onClick={(e) => { e.stopPropagation(); setShowNote(true) }} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#242424', color: '#999999' }}>📝 Note</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); setShowDealPanel(true) }} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>💰 Deal</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); setShowTags(true) }} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,212,212,0.12)', color: '#00d4d4' }}>🏷 Tag</button>
              <button type="button" disabled={saving} onClick={(e) => { e.stopPropagation(); toggleResponse() }} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>✓ Response</button>
            </div>
        </div>
      </div>

      {showNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 frosted-overlay">
          <div className="w-full max-w-md rounded-2xl p-4 flex flex-col gap-3" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            <p className="text-sm font-semibold" style={{ color: '#ffffff' }}>Add Note — {contact.name}</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="abc-input px-3 py-2 text-sm min-h-[100px] resize-none"
              placeholder="Pipeline note…"
            />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowNote(false)} className="text-xs px-3 py-1.5" style={{ color: '#999999' }}>Cancel</button>
              <button type="button" disabled={saving} onClick={saveNote} className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white" style={{ background: 'linear-gradient(135deg, #f0197d, #00d4d4)' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showTags && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-md">
            <TagSelector
              selected={contact.tags || []}
              onSave={saveTags}
              onClose={() => setShowTags(false)}
            />
          </div>
        </div>
      )}
    </>
  )
}

export default function PipelineTable({
  contacts,
  onAction,
  onUpdate,
  showWonBadge,
}: {
  contacts: ScannedContact[]
  onAction: (contact: ScannedContact, step: ReturnType<typeof getAiNextStep>) => void
  onUpdate: (contact: ScannedContact) => void
  showWonBadge?: boolean
}) {
  const [dealModal, setDealModal] = useState<{
    contact: ScannedContact
    mode: 'won' | 'lost'
  } | null>(null)

  return (
    <>
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #2a2a2a' }}>
      <div
        className="grid grid-cols-[1.4fr_1fr_0.7fr_0.8fr_0.7fr_1.4fr_1fr] gap-3 px-4 py-3 text-[10px] font-bold uppercase tracking-wider"
        style={{ background: '#1a1a1a', color: '#999999', borderBottom: '1px solid #2a2a2a' }}
      >
        <span>Contact</span>
        <span>Company</span>
        <span>Score</span>
        <span>Status</span>
        <span>Last Activity</span>
        <span>AI Next Step</span>
        <span>Action</span>
      </div>
      {contacts.map((contact) => (
        <PipelineRow
          key={contact.id}
          contact={contact}
          onAction={onAction}
          onUpdate={onUpdate}
          showWonBadge={showWonBadge}
          onDealOutcome={(c, mode) => setDealModal({ contact: c, mode })}
        />
      ))}
      </div>
      <DealOutcomeModal
        contact={dealModal?.contact ?? null}
        mode={dealModal?.mode ?? null}
        onClose={() => setDealModal(null)}
        onUpdated={(c) => {
          onUpdate(c)
          setDealModal(null)
        }}
      />
    </>
  )
}
