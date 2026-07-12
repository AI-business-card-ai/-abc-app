'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClientComponent } from '@/lib/supabase'
import PipelineKanban from '@/components/pipeline/PipelineKanban'
import { formatDealValue } from '@/lib/tags'
import { computeDashboardMetrics, formatPipelineValue } from '@/lib/pipeline-ai'
import { downloadContactsListCsv } from '@/lib/contacts-csv-export'
import { contactsToCsv, downloadCsv } from '@/lib/crm-export'
import type { PipelineStageId, ScannedContact } from '@/lib/types'

function isInPipeline(contact: ScannedContact): boolean {
  return contact.pipeline_stage != null
}

export default function PipelinePage() {
  const router = useRouter()
  const supabase = createClientComponent()
  const [contacts, setContacts] = useState<ScannedContact[]>([])
  const [loading, setLoading] = useState(true)
  const [exportOpen, setExportOpen] = useState(false)

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

  useEffect(() => {
    let mounted = true

    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !mounted) return

      const channel = supabase
        .channel('pipeline-enrichment')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'scanned_contacts',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const inserted = payload.new as ScannedContact
            setContacts((prev) => {
              if (prev.some((c) => c.id === inserted.id)) return prev
              return [
                { ...inserted, pipeline_stage: (inserted.pipeline_stage as PipelineStageId) || 'new' },
                ...prev,
              ]
            })
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'scanned_contacts',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const updated = payload.new as ScannedContact
            setContacts((prev) =>
              prev.map((c) =>
                c.id === updated.id
                  ? { ...updated, pipeline_stage: (updated.pipeline_stage as PipelineStageId) || c.pipeline_stage || 'new' }
                  : c
              )
            )
          }
        )
        .subscribe()

      return channel
    }

    let channel: ReturnType<typeof supabase.channel> | undefined
    void setupRealtime().then((ch) => {
      channel = ch
    })

    return () => {
      mounted = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [supabase])

  const metrics = useMemo(() => computeDashboardMetrics(contacts), [contacts])

  const boardMetrics = useMemo(() => {
    const active = contacts.filter((c) => c.pipeline_stage !== 'lost')
    const withValue = active.filter((c) => Number(c.deal_value) > 0)
    const avgDealSize = withValue.length
      ? withValue.reduce((sum, c) => sum + (Number(c.deal_value) || 0), 0) / withValue.length
      : 0
    const wonCount = active.filter((c) => c.pipeline_stage === 'won').length
    const conversionRate = active.length > 0 ? Math.round((wonCount / active.length) * 100) : 0

    return {
      totalPipelineValue: metrics.pipelineValue,
      wonThisMonth: metrics.wonThisMonth,
      avgDealSize,
      conversionRate,
    }
  }, [contacts, metrics])

  const handleMoveStage = useCallback(
    async (contactId: string, stage: PipelineStageId) => {
      setContacts((prev) =>
        prev.map((c) => (c.id === contactId ? { ...c, pipeline_stage: stage } : c))
      )

      try {
        const res = await fetch('/api/pipeline/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactId, stage }),
        })
        if (!res.ok) {
          await loadContacts()
        }
      } catch {
        await loadContacts()
      }
    },
    [loadContacts]
  )

  const pipelineContacts = useMemo(
    () => contacts.filter(isInPipeline),
    [contacts]
  )

  const handleExportFormat = useCallback((format: 'general' | 'salesforce' | 'hubspot') => {
    if (pipelineContacts.length === 0) return
    setExportOpen(false)
    if (format === 'general') {
      downloadContactsListCsv(pipelineContacts, 'ABC_pipeline')
      return
    }
    const csv = contactsToCsv(pipelineContacts, format)
    const date = new Date().toISOString().split('T')[0]
    downloadCsv(csv, `ABC_${format}_${date}.csv`)
  }, [pipelineContacts])

  const summaryCards = [
    { label: 'Total pipeline value', value: formatPipelineValue(boardMetrics.totalPipelineValue) },
    { label: 'Won this month', value: formatPipelineValue(boardMetrics.wonThisMonth) },
    { label: 'Avg deal size', value: formatDealValue(boardMetrics.avgDealSize, 'USD') || '$0' },
    { label: 'Conversion rate', value: `${boardMetrics.conversionRate}%` },
  ]

  return (
    <div className="min-h-screen page-shell page-shell--wide pb-8">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="gradient-text page-heading font-black tracking-wide">PIPELINE</h1>
          <p className="text-xs mt-1" style={{ color: '#999999' }}>
            Sales board — drag deals through your funnel
          </p>
        </div>
        {pipelineContacts.length > 0 && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setExportOpen((v) => !v)}
              className="rounded-xl px-3 py-2 text-xs font-semibold min-h-[40px] flex items-center gap-2"
              style={{
                background: 'transparent',
                border: '1px solid #2a2a2a',
                color: '#999999',
              }}
            >
              Export
              <span style={{ fontSize: 10 }}>{exportOpen ? '▲' : '▼'}</span>
            </button>
            {exportOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setExportOpen(false)}
                />
                <div
                  className="absolute right-0 top-full mt-1 z-20 rounded-xl overflow-hidden"
                  style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', minWidth: 180 }}
                >
                  {[
                    { key: 'general', label: '📋 General CSV', sub: 'All fields' },
                    { key: 'salesforce', label: '☁️ Salesforce', sub: 'SF field names + custom fields' },
                    { key: 'hubspot', label: '🟠 HubSpot', sub: 'HS field names + properties' },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => handleExportFormat(opt.key as 'general' | 'salesforce' | 'hubspot')}
                      className="w-full text-left px-4 py-3 flex flex-col gap-0.5 transition-colors"
                      style={{ borderBottom: '1px solid #2a2a2a' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#2a2a2a')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span className="text-xs font-semibold" style={{ color: '#ffffff' }}>{opt.label}</span>
                      <span className="text-[10px]" style={{ color: '#666' }}>{opt.sub}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6"
      >
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl px-4 py-3"
            style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <p className="text-xl lg:text-2xl font-black tabular-nums" style={{ color: '#ffffff' }}>
              {card.value}
            </p>
            <p className="text-[10px] mt-1 uppercase tracking-wide" style={{ color: '#999999' }}>
              {card.label}
            </p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <div
            className="w-7 h-7 rounded-full border-2 border-transparent animate-spin"
            style={{ borderTopColor: '#00d4d4', borderRightColor: '#f0197d' }}
          />
        </div>
      ) : contacts.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm mb-4" style={{ color: '#999999' }}>No deals in your pipeline yet</p>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => router.push('/scan')}
            className="touch-target rounded-xl px-5 text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #f0197d, #00d4d4)' }}
          >
            Scan your first card
          </motion.button>
        </div>
      ) : (
        <PipelineKanban contacts={contacts} onMoveStage={handleMoveStage} />
      )}
    </div>
  )
}
