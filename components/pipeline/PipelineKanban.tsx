'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { formatDealValue } from '@/lib/tags'
import { getAiNextStep, daysSinceActivity } from '@/lib/pipeline-ai'
import type { PipelineStageId, ScannedContact } from '@/lib/types'

const KANBAN_STAGES: {
  id: PipelineStageId
  label: string
  color: string
  bg: string
  border: string
}[] = [
  { id: 'new', label: 'NEW', color: '#9ca3af', bg: 'rgba(156,163,175,0.08)', border: 'rgba(156,163,175,0.35)' },
  { id: 'follow-up', label: 'FOLLOW-UP', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.35)' },
  { id: 'meeting', label: 'MEETING', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.35)' },
  { id: 'deal', label: 'DEAL', color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.35)' },
  { id: 'won', label: 'WON', color: '#22c55e', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.35)' },
]

const NEXT_STAGE: Partial<Record<PipelineStageId, PipelineStageId>> = {
  new: 'follow-up',
  'follow-up': 'meeting',
  meeting: 'deal',
  deal: 'won',
}

function ContactAvatar({ contact, size = 28 }: { contact: ScannedContact; size?: number }) {
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
        fontSize: size * 0.38,
        background: 'linear-gradient(135deg, #f0197d, #00d4d4)',
        color: '#ffffff',
      }}
    >
      {initials}
    </div>
  )
}

function daysInStage(contact: ScannedContact): number {
  const ref = contact.last_activity_at || contact.scanned_at || contact.created_at
  if (!ref) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(ref).getTime()) / 86400000))
}

function PipelineKanbanCard({
  contact,
  stageColor,
  onMoveNext,
}: {
  contact: ScannedContact
  stageColor: string
  onMoveNext: (contact: ScannedContact, nextStage: PipelineStageId) => void
}) {
  const router = useRouter()
  const step = getAiNextStep(contact)
  const days = daysInStage(contact)
  const dealVal = formatDealValue(contact.deal_value, contact.deal_currency || 'USD')
  const nextStage = NEXT_STAGE[contact.pipeline_stage || 'new']
  const nameLine = [contact.name?.trim() || 'Unknown', contact.company?.trim()].filter(Boolean).join(' · ')

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/contacts/${contact.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && router.push(`/contacts/${contact.id}`)}
      className="rounded-xl p-3 cursor-pointer transition-transform hover:scale-[1.01] active:scale-[0.99]"
      style={{
        background: '#242424',
        border: `1px solid ${stageColor}33`,
      }}
    >
      <div className="flex items-center gap-2 mb-2 min-w-0">
        <ContactAvatar contact={contact} />
        <p className="text-[13px] font-semibold truncate flex-1 min-w-0" style={{ color: '#ffffff' }}>
          {nameLine}
        </p>
      </div>

      {dealVal && (
        <p className="text-xs font-bold mb-1.5 tabular-nums" style={{ color: '#f59e0b' }}>
          {dealVal}
        </p>
      )}

      <p className="text-[11px] leading-snug truncate mb-2" style={{ color: '#00d4d4' }} title={step.text}>
        {step.text}
      </p>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px]" style={{ color: '#666666' }}>
          {days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`}
        </span>
        {nextStage && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onMoveNext(contact, nextStage)
            }}
            className="text-[10px] font-semibold px-2 py-1 rounded-md shrink-0"
            style={{
              background: `${stageColor}18`,
              color: stageColor,
              border: `1px solid ${stageColor}44`,
            }}
          >
            → Move to next
          </button>
        )}
      </div>
    </div>
  )
}

type Props = {
  contacts: ScannedContact[]
  onMoveStage: (contactId: string, stage: PipelineStageId) => Promise<void>
}

export default function PipelineKanban({ contacts, onMoveStage }: Props) {
  const boardContacts = useMemo(
    () =>
      contacts.filter((c) => {
        const stage = c.pipeline_stage || 'new'
        return stage !== 'lost'
      }),
    [contacts]
  )

  const columns = useMemo(() => {
    return KANBAN_STAGES.map((stage) => {
      const items = boardContacts.filter((c) => (c.pipeline_stage || 'new') === stage.id)
      const totalValue = items.reduce((sum, c) => sum + (Number(c.deal_value) || 0), 0)
      return { ...stage, items, count: items.length, totalValue }
    })
  }, [boardContacts])

  return (
    <div
      className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:grid md:grid-cols-5 md:overflow-visible md:snap-none"
      style={{ scrollbarWidth: 'thin' }}
    >
      {columns.map((col) => (
        <div
          key={col.id}
          className="flex flex-col min-w-[260px] md:min-w-0 snap-center shrink-0 md:shrink"
          style={{ maxHeight: 'calc(100vh - 280px)' }}
        >
          <div
            className="rounded-t-xl px-3 py-2.5 mb-2 shrink-0"
            style={{
              background: col.bg,
              borderTop: `3px solid ${col.color}`,
              borderLeft: `1px solid ${col.border}`,
              borderRight: `1px solid ${col.border}`,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-black tracking-wider" style={{ color: col.color }}>
                {col.label}
              </span>
              <span
                className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded"
                style={{ background: `${col.color}22`, color: col.color }}
              >
                {col.count}
              </span>
            </div>
            <p className="text-[10px] mt-1 tabular-nums" style={{ color: '#999999' }}>
              {col.totalValue > 0 ? formatDealValue(col.totalValue, 'USD') : '$0'} total
            </p>
          </div>

          <div
            className="flex-1 flex flex-col gap-2 overflow-y-auto rounded-b-xl p-2 min-h-[120px]"
            style={{
              background: '#1a1a1a',
              border: `1px solid ${col.border}`,
              borderTop: 'none',
            }}
          >
            {col.items.length === 0 ? (
              <p className="text-center text-[11px] py-6" style={{ color: '#555555' }}>
                No deals
              </p>
            ) : (
              col.items.map((contact) => (
                <PipelineKanbanCard
                  key={contact.id}
                  contact={contact}
                  stageColor={col.color}
                  onMoveNext={(c, next) => onMoveStage(c.id, next)}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export { KANBAN_STAGES }
