'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { IconMail, IconPhone } from '@tabler/icons-react'
import { createClientComponent } from '@/lib/supabase'
import BottomNav from '@/components/ui/BottomNav'
import { PIPELINE_STAGES, daysSinceScan, isActionOverdue } from '@/lib/pipeline'
import { logCrmActivity } from '@/lib/crm-client'
import type { CrmStatus, PipelineStageId, ScannedContact } from '@/lib/types'

const EMPTY_HINTS: Record<PipelineStageId, string> = {
  new: 'New scans land here',
  'follow-up': 'Drag contacts needing follow-up',
  meeting: 'Schedule meetings here',
  deal: 'Active deals in progress',
  won: 'Closed-won contacts',
}

const CRM_STATUS_COLORS: Record<CrmStatus, string> = {
  NEW: '#A78BFA',
  ENRICHED: '#38BDF8',
  CONTACTED: '#FACC15',
  IN_CONVERSATION: '#FB923C',
  CLOSED: '#22C55E',
}

function leadScoreStyle(score: number) {
  if (score <= 40) return { color: '#EF4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)' }
  if (score <= 70) return { color: '#FACC15', bg: 'rgba(250,204,21,0.12)', border: 'rgba(250,204,21,0.35)' }
  return { color: '#22C55E', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.35)' }
}

function resolveDropStage(x: number, y: number, columnRefs: Record<string, HTMLDivElement | null>) {
  for (const stage of PIPELINE_STAGES) {
    const el = columnRefs[stage.id]
    if (!el) continue
    const rect = el.getBoundingClientRect()
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return stage.id
    }
  }
  const hit = document.elementFromPoint(x, y)?.closest('[data-pipeline-stage]') as HTMLElement | null
  return (hit?.dataset.pipelineStage as PipelineStageId) || null
}

function PipelineCard({
  contact,
  stageColor,
  stageBorder,
  onNavigate,
  onDragStart,
  onDragEnd,
  onQuickAction,
}: {
  contact: ScannedContact
  stageColor: string
  stageBorder: string
  onNavigate: () => void
  onDragStart: (x: number, y: number) => void
  onDragEnd: (contactId: string, x: number, y: number) => void
  onQuickAction: (type: 'chat' | 'email' | 'phone') => void
}) {
  const overdue = isActionOverdue(contact.next_action_date)
  const days = daysSinceScan(contact.scanned_at)
  const score = contact.ai_lead_score ?? contact.match_score ?? 0
  const scoreVisual = leadScoreStyle(score)
  const crmStatus = (contact.crm_status as CrmStatus) || 'NEW'
  const crmColor = CRM_STATUS_COLORS[crmStatus] || '#A78BFA'
  const contactLine = contact.email || contact.phone

  return (
    <motion.div
      layout
      drag
      dragElastic={0.12}
      dragMomentum={false}
      dragSnapToOrigin
      whileDrag={{
        scale: 1.04,
        zIndex: 60,
        boxShadow: `0 16px 48px ${stageColor}44`,
        cursor: 'grabbing',
      }}
      onDragStart={(_, info) => onDragStart(info.point.x, info.point.y)}
      onDragEnd={(_, info) => onDragEnd(contact.id, info.point.x, info.point.y)}
      onClick={onNavigate}
      className="rounded-2xl p-3.5 cursor-grab active:cursor-grabbing relative select-none"
      style={{
        background: 'linear-gradient(145deg, #0D0A18 0%, #080610 100%)',
        border: `1px solid ${stageBorder}`,
        boxShadow: `inset 0 1px 0 ${stageColor}18`,
        touchAction: 'none',
      }}
    >
      {overdue && (
        <span
          className="absolute top-3 right-3 w-2 h-2 rounded-full"
          style={{ background: '#EF4444', boxShadow: '0 0 8px #EF4444' }}
          title="Action overdue"
        />
      )}

      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1 pr-1">
          <p className="font-bold text-[15px] leading-tight truncate" style={{ color: '#F0EAFF' }}>
            {contact.name?.trim() || 'Unknown contact'}
          </p>
          <p className="text-xs truncate mt-1" style={{ color: '#8B7AA8' }}>
            {contact.company?.trim() || 'No company'}
          </p>
          {contact.role && (
            <p className="text-[11px] truncate mt-0.5" style={{ color: '#5A3A8A' }}>
              {contact.role}
            </p>
          )}
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-1 text-[11px] font-bold tabular-nums"
          style={{
            background: scoreVisual.bg,
            color: scoreVisual.color,
            border: `1px solid ${scoreVisual.border}`,
          }}
        >
          {score}
        </span>
      </div>

      {contactLine && (
        <div className="flex items-center gap-1.5 mb-2 min-w-0">
          {contact.email ? (
            <IconMail size={13} style={{ color: '#3A2060', flexShrink: 0 }} />
          ) : (
            <IconPhone size={13} style={{ color: '#3A2060', flexShrink: 0 }} />
          )}
          <span className="text-[11px] truncate" style={{ color: '#8B7AA8' }}>
            {contact.email || contact.phone}
          </span>
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <span
          className="rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide"
          style={{
            background: `${crmColor}18`,
            color: crmColor,
            border: `1px solid ${crmColor}44`,
          }}
        >
          {crmStatus.replace(/_/g, ' ')}
        </span>
        <span className="text-[10px]" style={{ color: '#3A2060' }}>
          {days === 0 ? 'Scanned today' : `${days}d ago`}
        </span>
      </div>

      {contact.next_action && (
        <p
          className="text-[10px] mb-2 truncate"
          style={{ color: overdue ? '#FCA5A5' : '#6B5A8A' }}
          title={overdue ? 'Action overdue' : contact.next_action}
        >
          → {contact.next_action}
        </p>
      )}

      <div
        className="flex items-center gap-1 pt-2 border-t"
        style={{ borderColor: '#1A0E30' }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {[
          { key: 'chat' as const, label: '💬 Chat' },
          { key: 'email' as const, label: '✉ Email' },
          { key: 'phone' as const, label: '📱 Phone' },
        ].map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onQuickAction(action.key)
            }}
            className="flex-1 rounded-lg py-1.5 text-[10px] font-semibold transition-colors"
            style={{
              background: '#0A0812',
              border: '0.5px solid #1A0E30',
              color: '#A78BFA',
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    </motion.div>
  )
}

export default function PipelinePage() {
  const router = useRouter()
  const supabase = createClientComponent()
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [contacts, setContacts] = useState<ScannedContact[]>([])
  const [loading, setLoading] = useState(true)
  const dragMoved = useRef(false)
  const dragStartPos = useRef({ x: 0, y: 0 })

  const loadContacts = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data, error } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('user_id', user.id)
      .order('scanned_at', { ascending: false })

    if (!error && data) {
      setContacts(
        (data as ScannedContact[]).map((c) => ({
          ...c,
          pipeline_stage: (c.pipeline_stage as PipelineStageId) || 'new',
        }))
      )
    }
    setLoading(false)
  }, [router, supabase])

  useEffect(() => {
    loadContacts()
  }, [loadContacts])

  const updateStage = useCallback(async (contactId: string, stage: PipelineStageId) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, pipeline_stage: stage } : c))
    )

    try {
      const res = await fetch('/api/pipeline/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, stage }),
      })
      if (!res.ok) loadContacts()
    } catch {
      loadContacts()
    }
  }, [loadContacts])

  const handleDragEnd = useCallback(
    (contactId: string, x: number, y: number) => {
      const dx = Math.abs(x - dragStartPos.current.x)
      const dy = Math.abs(y - dragStartPos.current.y)
      if (dx > 8 || dy > 8) dragMoved.current = true

      window.setTimeout(() => {
        dragMoved.current = false
      }, 200)

      const targetStage = resolveDropStage(x, y, columnRefs.current)
      if (!targetStage) return

      const contact = contacts.find((c) => c.id === contactId)
      if (contact && contact.pipeline_stage !== targetStage) {
        updateStage(contactId, targetStage)
      }
    },
    [contacts, updateStage]
  )

  const handleQuickAction = useCallback(
    (contact: ScannedContact, type: 'chat' | 'email' | 'phone') => {
      if (type === 'chat') {
        router.push('/chat/' + contact.id)
        return
      }
      if (type === 'email') {
        if (contact.email) {
          window.open(`mailto:${contact.email}`, '_self')
        }
        logCrmActivity({
          contactId: contact.id,
          activityType: 'EMAIL_SENT',
          activityDetail: `Email opened from pipeline for ${contact.name}`,
          metadata: { email: contact.email },
        })
        return
      }
      if (contact.phone) {
        window.open(`tel:${contact.phone}`, '_self')
      } else {
        window.open(`/api/contact/vcard/${contact.id}`, '_self')
      }
      logCrmActivity({
        contactId: contact.id,
        activityType: contact.phone ? 'WHATSAPP_OPENED' : 'VCARD_SAVED',
        activityDetail: contact.phone
          ? `Phone action from pipeline for ${contact.name}`
          : `vCard saved from pipeline for ${contact.name}`,
        metadata: { phone: contact.phone },
      })
    },
    [router]
  )

  const grouped = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    items: contacts.filter((c) => (c.pipeline_stage || 'new') === stage.id),
  }))

  const total = contacts.length

  return (
    <div className="min-h-screen pb-28" style={{ background: '#07050E' }}>
      <div className="px-4 pt-6 pb-4">
        <h1 className="gradient-text text-xl font-black tracking-wide">PIPELINE</h1>
        <p className="text-xs mt-1.5" style={{ color: '#5A3A8A' }}>
          {total} contact{total !== 1 ? 's' : ''} · drag cards between stages
        </p>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <div
            className="w-7 h-7 rounded-full border-2 border-transparent animate-spin"
            style={{ borderTopColor: '#7C3AED', borderRightColor: '#0EA5E9' }}
          />
        </div>
      ) : total === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 px-6 text-center">
          <p className="text-sm" style={{ color: '#3A2060' }}>No contacts in pipeline yet</p>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => router.push('/scan')}
            className="glow-btn rounded-xl text-white px-5 py-2.5"
          >
            📷 Scan a card
          </motion.button>
        </div>
      ) : (
        <div
          className="flex gap-3 px-4 pb-6 overflow-x-auto snap-x snap-mandatory md:grid md:grid-cols-5 md:overflow-visible md:snap-none"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {grouped.map((column) => (
            <div
              key={column.id}
              data-pipeline-stage={column.id}
              ref={(el) => {
                columnRefs.current[column.id] = el
              }}
              className="snap-center shrink-0 w-[85vw] md:w-auto flex flex-col rounded-2xl overflow-hidden"
              style={{
                background: '#06040C',
                border: `1px solid ${column.border}`,
                minHeight: 460,
                boxShadow: `0 4px 24px ${column.color}0A`,
              }}
            >
              <div
                className="px-4 py-3.5 flex items-center justify-between shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${column.bg} 0%, #06040C 100%)`,
                  borderBottom: `1px solid ${column.border}`,
                }}
              >
                <span
                  className="text-xs font-black tracking-widest uppercase"
                  style={{ color: column.color }}
                >
                  {column.label}
                </span>
                <span
                  className="text-xs font-bold tabular-nums rounded-full min-w-[26px] h-[26px] flex items-center justify-center px-2"
                  style={{ background: `${column.color}22`, color: column.color, border: `1px solid ${column.border}` }}
                >
                  {column.items.length}
                </span>
              </div>

              <div className="flex-1 p-2.5 flex flex-col gap-2.5 overflow-y-auto max-h-[calc(100vh-240px)]">
                <AnimatePresence mode="popLayout">
                  {column.items.map((contact) => (
                    <PipelineCard
                      key={contact.id}
                      contact={contact}
                      stageColor={column.color}
                      stageBorder={column.border}
                      onNavigate={() => {
                        if (dragMoved.current) return
                        router.push('/contact/' + contact.id)
                      }}
                      onDragStart={(x, y) => {
                        dragMoved.current = false
                        dragStartPos.current = { x, y }
                      }}
                      onDragEnd={handleDragEnd}
                      onQuickAction={(type) => handleQuickAction(contact, type)}
                    />
                  ))}
                </AnimatePresence>

                {column.items.length === 0 && (
                  <div
                    className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-xl mx-1"
                    style={{
                      border: `1px dashed ${column.border}`,
                      background: `${column.color}08`,
                    }}
                  >
                    <span className="text-2xl mb-2 opacity-40">◎</span>
                    <p className="text-[11px] leading-relaxed" style={{ color: '#4A3868' }}>
                      {EMPTY_HINTS[column.id]}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <BottomNav />
    </div>
  )
}
