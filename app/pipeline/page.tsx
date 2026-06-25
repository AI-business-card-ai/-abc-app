'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClientComponent } from '@/lib/supabase'
import { useDevice } from '@/lib/hooks/useDevice'
import { logCrmActivity } from '@/lib/crm-client'
import PipelineTable from '@/components/pipeline/PipelineTable'
import TagPills from '@/components/crm/TagPills'
import { formatDealValue } from '@/lib/tags'
import {
  computeDashboardMetrics,
  filterContacts,
  sortContacts,
  getAiNextStep,
  getScoreTier,
  getStatusColor,
  daysSinceActivity,
  actionButtonStyle,
  formatPipelineValue,
  type FilterTab,
} from '@/lib/pipeline-ai'
import type { PipelineStageId, ScannedContact } from '@/lib/types'

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'hot', label: '🔥 Hot Leads' },
  { id: 'action', label: '⚡ Action Needed' },
  { id: 'week', label: '📅 This Week' },
  { id: 'won', label: '✓ Won' },
  { id: 'closed', label: '✓ Closed' },
]

function ContactAvatar({ contact, size = 40 }: { contact: ScannedContact; size?: number }) {
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
        background: 'linear-gradient(135deg, #00d4d4, #8b5cf6)',
        border: '1px solid rgba(0, 212, 212, 0.2)',
        color: '#f0f0ff',
      }}
    >
      {initials}
    </div>
  )
}

function MobilePipelineCard({
  contact,
  onAction,
}: {
  contact: ScannedContact
  onAction: (contact: ScannedContact, step: ReturnType<typeof getAiNextStep>) => void
}) {
  const score = contact.ai_lead_score ?? contact.match_score ?? 0
  const scoreTier = getScoreTier(score)
  const status = contact.crm_status || 'NEW'
  const statusColor = getStatusColor(contact.crm_status)
  const days = daysSinceActivity(contact)
  const step = getAiNextStep(contact)
  const btnStyle = actionButtonStyle(step.color, step.urgent)

  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-2.5"
      style={{ background: '#141628', border: '1px solid rgba(139, 92, 246, 0.12)' }}
    >
      <div className="flex items-center gap-3">
        <ContactAvatar contact={contact} size={32} />
        <p className="flex-1 font-bold text-base truncate" style={{ color: '#f0f0ff' }}>
          {contact.name?.trim() || 'Unknown'}
        </p>
        <span
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-white"
          style={{ background: scoreTier.bg }}
        >
          {score} {scoreTier.label}
        </span>
      </div>

      <p className="text-[13px] truncate" style={{ color: '#8892b0' }}>
        {[contact.company, contact.role].filter(Boolean).join(' · ') || 'No company'}
      </p>

      <TagPills tags={contact.tags || []} compact />

      {(Number(contact.deal_value) || 0) > 0 && (
        <p className="text-xs font-semibold" style={{ color: '#f59e0b' }}>
          💰 {formatDealValue(contact.deal_value, contact.deal_currency || 'USD')}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
          style={{
            background: 'transparent',
            color: statusColor,
            border: `1px solid ${statusColor}`,
          }}
        >
          {status.replace(/_/g, ' ')}
        </span>
        <span className="text-xs" style={{ color: '#4a5168' }}>
          {days === 0 ? 'Today' : `${days} days ago`}
        </span>
      </div>

      <p className="text-[13px] italic leading-snug" style={{ color: '#8b5cf6' }}>
        ⚡ {step.text}
      </p>

      <button
        type="button"
        onClick={() => onAction(contact, step)}
        className="touch-target w-full rounded-xl text-sm font-semibold mt-1"
        style={{ ...btnStyle, height: 44 }}
      >
        {step.action}
      </button>
    </div>
  )
}

function DesktopPipelineTable({
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
  return (
    <PipelineTable
      contacts={contacts}
      onAction={onAction}
      onUpdate={onUpdate}
      showWonBadge={showWonBadge}
    />
  )
}

export default function PipelinePage() {
  const router = useRouter()
  const device = useDevice()
  const supabase = createClientComponent()
  const [contacts, setContacts] = useState<ScannedContact[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterTab>('all')

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

  const metrics = useMemo(() => computeDashboardMetrics(contacts), [contacts])
  const visibleContacts = useMemo(() => sortContacts(filterContacts(contacts, filter)), [contacts, filter])

  const handleAction = useCallback(
    (contact: ScannedContact, step: ReturnType<typeof getAiNextStep>) => {
      logCrmActivity({
        contactId: contact.id,
        activityType: 'MESSAGE_GENERATED',
        activityDetail: `Pipeline: ${step.action} — ${contact.name}`,
        metadata: { nextStep: step.text, action: step.action, urgent: step.urgent },
      })
      router.push('/contact/' + contact.id)
    },
    [router]
  )

  const handleContactUpdate = useCallback((updated: ScannedContact) => {
    setContacts((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)))
  }, [])

  const metricCards = [
    { label: 'Contacts', value: String(metrics.total), filter: 'all' as FilterTab },
    { label: 'Hot Leads', value: String(metrics.hotLeads), filter: 'hot' as FilterTab },
    { label: 'Need Follow-up', value: String(metrics.needFollowUp), filter: 'action' as FilterTab },
    { label: 'Avg Score', value: String(metrics.avgScore), filter: 'all' as FilterTab },
    { label: 'Pipeline Value', value: formatPipelineValue(metrics.pipelineValue), filter: 'all' as FilterTab },
    { label: 'Expected This Month', value: formatPipelineValue(metrics.expectedThisMonth), filter: 'all' as FilterTab },
    { label: 'Won This Month', value: formatPipelineValue(metrics.wonThisMonth), filter: 'won' as FilterTab },
  ]

  const metricsGridClass =
    device === 'mobile'
      ? 'grid grid-cols-2 gap-3'
      : device === 'tablet'
        ? 'grid grid-cols-3 gap-3'
        : 'grid grid-cols-4 lg:grid-cols-7 gap-3'

  return (
    <div className="min-h-screen page-shell page-shell--wide pb-8">
      <div className="mb-5">
        <h1 className="gradient-text page-heading font-black tracking-wide">PIPELINE</h1>
        <p className="text-xs mt-1" style={{ color: '#8892b0' }}>
          AI-powered sales intelligence
        </p>
      </div>

      <div className="mb-5 rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
        <div
          className="px-4 py-5"
          style={{ background: 'linear-gradient(135deg, rgba(20,22,40,0.95) 0%, rgba(13,15,26,0.98) 50%, #0d0f1a 100%)' }}
        >
          <p className="text-[10px] font-bold tracking-widest uppercase mb-3" style={{ color: '#8b5cf6' }}>
            AI Summary
          </p>
          <div className={metricsGridClass}>
            {metricCards.map((m) => (
              <button
                key={m.label}
                type="button"
                onClick={() => setFilter(m.filter)}
                className="touch-target text-left rounded-xl px-3 py-2.5 transition-colors"
                style={{
                  background:
                    filter === m.filter && m.filter !== 'all'
                      ? 'rgba(0, 212, 212, 0.1)'
                      : 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(139, 92, 246, 0.12)',
                }}
              >
                <p
                  className={`font-black tabular-nums ${device === 'desktop' ? 'text-2xl' : device === 'tablet' ? 'text-xl' : 'text-lg'}`}
                  style={{ color: '#f0f0ff' }}
                >
                  {m.value}
                </p>
                <p className="text-[10px] mt-0.5 uppercase tracking-wide" style={{ color: '#8892b0' }}>
                  {m.label}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className="mb-5 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
        style={{ scrollbarWidth: 'none' }}
      >
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className="touch-target shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors"
            style={
              filter === tab.id
                ? { background: 'linear-gradient(135deg, #00d4d4, #8b5cf6)', color: '#fff', border: '1px solid transparent' }
                : { background: '#141628', color: '#8892b0', border: '1px solid rgba(139, 92, 246, 0.12)' }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <div
            className="w-7 h-7 rounded-full border-2 border-transparent animate-spin"
            style={{ borderTopColor: '#6366f1', borderRightColor: '#a78bfa' }}
          />
        </div>
      ) : contacts.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm mb-4" style={{ color: '#8892b0' }}>No contacts yet</p>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => router.push('/scan')}
            className="touch-target rounded-xl px-5 text-sm font-semibold text-white"
            style={{ background: '#6366f1' }}
          >
            Scan your first card
          </motion.button>
        </div>
      ) : visibleContacts.length === 0 ? (
        <p className="py-12 text-center text-sm" style={{ color: '#8892b0' }}>
          No contacts match this filter.
        </p>
      ) : filter === 'won' && visibleContacts.length > 0 ? (
        <>
          <div
            className="mb-4 rounded-xl px-4 py-3 flex items-center justify-between"
            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}
          >
            <span className="text-sm font-semibold" style={{ color: '#f59e0b' }}>
              🏆 Won Deals — {formatPipelineValue(
                visibleContacts.reduce((sum, c) => sum + (Number(c.deal_value) || 0), 0)
              )}
            </span>
            <span className="text-xs" style={{ color: '#8892b0' }}>
              {visibleContacts.length} deal{visibleContacts.length !== 1 ? 's' : ''}
            </span>
          </div>
          {device === 'desktop' ? (
            <DesktopPipelineTable
              contacts={visibleContacts}
              onAction={handleAction}
              onUpdate={handleContactUpdate}
              showWonBadge
            />
          ) : (
            <div className={device === 'tablet' ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-3'}>
              {visibleContacts.map((contact) => (
                <MobilePipelineCard key={contact.id} contact={contact} onAction={handleAction} />
              ))}
            </div>
          )}
        </>
      ) : device === 'desktop' ? (
        <DesktopPipelineTable
          contacts={visibleContacts}
          onAction={handleAction}
          onUpdate={handleContactUpdate}
        />
      ) : (
        <div className={device === 'tablet' ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-3'}>
          {visibleContacts.map((contact) => (
            <MobilePipelineCard key={contact.id} contact={contact} onAction={handleAction} />
          ))}
        </div>
      )}
    </div>
  )
}
