'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClientComponent } from '@/lib/supabase'
import BottomNav from '@/components/ui/BottomNav'
import { logCrmActivity } from '@/lib/crm-client'
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
  { id: 'closed', label: '✓ Closed' },
]

function ContactAvatar({ contact }: { contact: ScannedContact }) {
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
        className="w-10 h-10 rounded-full object-cover shrink-0"
        style={{ border: '1px solid rgba(255,255,255,0.12)' }}
      />
    )
  }

  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
      style={{
        background: 'linear-gradient(135deg, #1E0A3C, #0A1A2E)',
        border: '1px solid rgba(255,255,255,0.12)',
        color: '#F0EAFF',
      }}
    >
      {initials}
    </div>
  )
}

function ContactRow({
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
    <>
      {/* Desktop row */}
      <div
        className="hidden md:grid md:grid-cols-[minmax(220px,1.2fr)_minmax(280px,1fr)_minmax(320px,1.2fr)] md:items-center md:gap-6 px-5 py-4 rounded-xl transition-colors cursor-default"
        style={{
          background: '#12121a',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#1a1a2e'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#12121a'
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <ContactAvatar contact={contact} />
          <div className="min-w-0">
            <p className="font-bold text-base truncate" style={{ color: '#F0EAFF' }}>
              {contact.name?.trim() || 'Unknown contact'}
            </p>
            <p className="text-sm truncate" style={{ color: '#8B7AA8' }}>
              {[contact.company, contact.role].filter(Boolean).join(' · ') || 'No company'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="rounded-lg px-3 py-1.5 text-sm font-bold text-white min-w-[72px] text-center"
            style={{ background: scoreTier.bg }}
          >
            {score} {scoreTier.label}
          </span>
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase"
            style={{
              background: `${statusColor}18`,
              color: statusColor,
              border: `1px solid ${statusColor}44`,
            }}
          >
            {status.replace(/_/g, ' ')}
          </span>
          <span className="text-xs" style={{ color: '#6B7280' }}>
            {days === 0 ? 'Today' : `${days}d ago`}
          </span>
        </div>

        <div className="flex items-center gap-4 min-w-0">
          <p className="flex-1 text-sm leading-snug min-w-0" style={{ color: '#a78bfa' }}>
            <span className="mr-1.5">⚡</span>
            {step.text}
          </p>
          <button
            type="button"
            onClick={() => onAction(contact, step)}
            className="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
            style={btnStyle}
          >
            {step.action}
          </button>
        </div>
      </div>

      {/* Mobile card */}
      <div
        className="md:hidden rounded-xl p-4 flex flex-col gap-3"
        style={{
          background: '#12121a',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div className="flex items-center gap-3">
          <ContactAvatar contact={contact} />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-base truncate" style={{ color: '#F0EAFF' }}>
              {contact.name?.trim() || 'Unknown contact'}
            </p>
            <p className="text-sm truncate" style={{ color: '#8B7AA8' }}>
              {[contact.company, contact.role].filter(Boolean).join(' · ') || 'No company'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="rounded-lg px-2.5 py-1 text-xs font-bold text-white"
            style={{ background: scoreTier.bg }}
          >
            {score} {scoreTier.label}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
            style={{
              background: `${statusColor}18`,
              color: statusColor,
              border: `1px solid ${statusColor}44`,
            }}
          >
            {status.replace(/_/g, ' ')}
          </span>
          <span className="text-xs" style={{ color: '#6B7280' }}>
            {days === 0 ? 'Today' : `${days} days ago`}
          </span>
        </div>

        <p className="text-sm leading-snug" style={{ color: '#a78bfa' }}>
          <span className="mr-1">⚡</span>
          {step.text}
        </p>

        <button
          type="button"
          onClick={() => onAction(contact, step)}
          className="w-full rounded-lg py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
          style={btnStyle}
        >
          {step.action}
        </button>
      </div>
    </>
  )
}

export default function PipelinePage() {
  const router = useRouter()
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

  const visibleContacts = useMemo(() => {
    const filtered = filterContacts(contacts, filter)
    return sortContacts(filtered)
  }, [contacts, filter])

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

  const metricCards = [
    { label: 'Contacts', value: String(metrics.total), filter: 'all' as FilterTab },
    { label: 'Hot Leads', value: String(metrics.hotLeads), filter: 'hot' as FilterTab },
    { label: 'Need Follow-up', value: String(metrics.needFollowUp), filter: 'action' as FilterTab },
    { label: 'Avg Score', value: String(metrics.avgScore), filter: 'all' as FilterTab },
    { label: 'Pipeline', value: formatPipelineValue(metrics.pipelineValue), filter: 'all' as FilterTab },
  ]

  return (
    <div className="min-h-screen pb-28" style={{ background: '#0a0a0f' }}>
      <div className="px-4 pt-6 pb-4">
        <h1 className="gradient-text text-xl font-black tracking-wide">PIPELINE</h1>
        <p className="text-xs mt-1" style={{ color: '#6B7280' }}>
          AI-powered sales intelligence
        </p>
      </div>

      {/* AI Summary Dashboard */}
      <div className="mx-4 mb-4 rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
        <div
          className="px-4 py-5"
          style={{
            background: 'linear-gradient(135deg, #1a0a2e 0%, #0a1628 50%, #0a0a0f 100%)',
          }}
        >
          <p className="text-[10px] font-bold tracking-widest uppercase mb-3" style={{ color: '#a78bfa' }}>
            AI Summary
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {metricCards.map((m) => (
              <button
                key={m.label}
                type="button"
                onClick={() => setFilter(m.filter)}
                className="text-left rounded-xl px-3 py-2.5 transition-colors"
                style={{
                  background: filter === m.filter && m.filter !== 'all' ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <p className="text-xl font-black tabular-nums" style={{ color: '#F0EAFF' }}>
                  {m.value}
                </p>
                <p className="text-[10px] mt-0.5 uppercase tracking-wide" style={{ color: '#8B7AA8' }}>
                  {m.label}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="px-4 mb-4 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors"
            style={
              filter === tab.id
                ? { background: '#6366f1', color: '#fff', border: '1px solid #6366f1' }
                : { background: '#12121a', color: '#8B7AA8', border: '1px solid rgba(255,255,255,0.08)' }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contact list */}
      <div className="px-4 flex flex-col gap-2">
        {loading ? (
          <div className="py-20 flex justify-center">
            <div
              className="w-7 h-7 rounded-full border-2 border-transparent animate-spin"
              style={{ borderTopColor: '#6366f1', borderRightColor: '#a78bfa' }}
            />
          </div>
        ) : contacts.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm mb-4" style={{ color: '#6B7280' }}>No contacts yet</p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => router.push('/scan')}
              className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
              style={{ background: '#6366f1' }}
            >
              Scan your first card
            </motion.button>
          </div>
        ) : visibleContacts.length === 0 ? (
          <p className="py-12 text-center text-sm" style={{ color: '#6B7280' }}>
            No contacts match this filter.
          </p>
        ) : (
          visibleContacts.map((contact) => (
            <ContactRow key={contact.id} contact={contact} onAction={handleAction} />
          ))
        )}
      </div>

      <BottomNav />
    </div>
  )
}
