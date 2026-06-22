'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { createClientComponent } from '@/lib/supabase'
import BottomNav from '@/components/ui/BottomNav'
import {
  PIPELINE_STAGES,
  daysSinceScan,
  isActionOverdue,
} from '@/lib/pipeline'
import type { PipelineStageId, ScannedContact } from '@/lib/types'

function PipelineCard({
  contact,
  stageColor,
  onNavigate,
  onDragStart,
  onDragEnd,
}: {
  contact: ScannedContact
  stageColor: string
  onNavigate: () => void
  onDragStart: () => void
  onDragEnd: (contactId: string, point: { x: number; y: number }) => void
}) {
  const overdue = isActionOverdue(contact.next_action_date)
  const days = daysSinceScan(contact.scanned_at)
  const score = contact.match_score ?? 0

  return (
    <motion.div
      layout
      drag
      dragElastic={0.08}
      dragMomentum={false}
      whileDrag={{ scale: 1.03, zIndex: 50, boxShadow: '0 12px 40px rgba(124,58,237,0.35)' }}
      onDragStart={onDragStart}
      onDragEnd={(_, info) => onDragEnd(contact.id, info.point)}
      onClick={() => onNavigate()}
      className="rounded-xl p-3 cursor-grab active:cursor-grabbing relative"
      style={{
        background: '#0D0A18',
        border: '0.5px solid #1A0E30',
      }}
    >
      {overdue && (
        <span
          className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full"
          style={{ background: '#EF4444', boxShadow: '0 0 6px #EF4444' }}
          title="Action overdue"
        />
      )}

      <div className="flex items-start justify-between gap-2 pr-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate" style={{ color: '#F0EAFF' }}>
            {contact.name ?? 'Unknown'}
          </p>
          <p className="text-xs truncate mt-0.5" style={{ color: '#5A3A8A' }}>
            {contact.company ?? '—'}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
          style={{
            background: `${stageColor}22`,
            color: stageColor,
            border: `0.5px solid ${stageColor}44`,
          }}
        >
          {score}
        </span>
      </div>

      <p className="text-[10px] mt-2" style={{ color: '#3A2060' }}>
        {days === 0 ? 'Scanned today' : `${days}d since scan`}
      </p>

      {contact.next_action && (
        <p
          className="text-[11px] mt-1.5 truncate"
          style={{ color: overdue ? '#FCA5A5' : '#8B7AA8' }}
          title={overdue ? 'Action overdue' : contact.next_action}
        >
          → {contact.next_action}
        </p>
      )}
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
    (contactId: string, point: { x: number; y: number }) => {
      dragMoved.current = true
      window.setTimeout(() => {
        dragMoved.current = false
      }, 150)
      for (const stage of PIPELINE_STAGES) {
        const el = columnRefs.current[stage.id]
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (
          point.x >= rect.left &&
          point.x <= rect.right &&
          point.y >= rect.top &&
          point.y <= rect.bottom
        ) {
          const contact = contacts.find((c) => c.id === contactId)
          if (contact?.pipeline_stage !== stage.id) {
            updateStage(contactId, stage.id)
          }
          return
        }
      }
    },
    [contacts, updateStage]
  )

  const grouped = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    items: contacts.filter((c) => (c.pipeline_stage || 'new') === stage.id),
  }))

  const total = contacts.length

  return (
    <div className="min-h-screen pb-28" style={{ background: '#07050E' }}>
      <div className="px-4 pt-6 pb-3">
        <h1 className="gradient-text text-xl font-black tracking-wide">PIPELINE</h1>
        <p className="text-xs mt-1" style={{ color: '#5A3A8A' }}>
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
          className="flex gap-3 px-4 pb-4 overflow-x-auto snap-x snap-mandatory md:grid md:grid-cols-5 md:overflow-visible md:snap-none"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {grouped.map((column) => (
            <div
              key={column.id}
              ref={(el) => {
                columnRefs.current[column.id] = el
              }}
              className="snap-center shrink-0 w-[78vw] max-w-[280px] md:w-auto md:max-w-none flex flex-col rounded-xl overflow-hidden"
              style={{
                background: '#06040C',
                border: `0.5px solid ${column.border}`,
                minHeight: 420,
              }}
            >
              <div
                className="px-3 py-2.5 flex items-center justify-between shrink-0"
                style={{ background: column.bg, borderBottom: `0.5px solid ${column.border}` }}
              >
                <span
                  className="text-[11px] font-bold tracking-wider"
                  style={{ color: column.color }}
                >
                  {column.label}
                </span>
                <span
                  className="text-[10px] font-semibold tabular-nums rounded-full px-2 py-0.5"
                  style={{ background: `${column.color}18`, color: column.color }}
                >
                  {column.items.length}
                </span>
              </div>

              <div className="flex-1 p-2 flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-220px)]">
                <AnimatePresence mode="popLayout">
                  {column.items.map((contact) => (
                    <PipelineCard
                      key={contact.id}
                      contact={contact}
                      stageColor={column.color}
                      onNavigate={() => {
                        if (dragMoved.current) return
                        router.push('/contact/' + contact.id)
                      }}
                      onDragStart={() => {
                        dragMoved.current = false
                      }}
                      onDragEnd={handleDragEnd}
                    />
                  ))}
                </AnimatePresence>

                {column.items.length === 0 && (
                  <p className="text-center text-[11px] py-8" style={{ color: '#2A1A4A' }}>
                    Drop here
                  </p>
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
