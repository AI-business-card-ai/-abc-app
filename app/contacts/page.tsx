'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { IconSearch, IconCreditCard, IconBrandLinkedin, IconMail, IconPhone, IconDeviceMobile } from '@tabler/icons-react'
import { createClientComponent } from '@/lib/supabase'
import { useDevice } from '@/lib/hooks/useDevice'
import CardStack from '@/components/ui/CardStack'
import PipelineStageBadge from '@/components/ui/PipelineStageBadge'
import EnrichmentIndicator from '@/components/ui/EnrichmentIndicator'
import EnrichingPulse from '@/components/ui/EnrichingPulse'
import MobileContactsList from '@/components/mobile/MobileContactsList'
import { isContactEnriching } from '@/lib/contact-enrichment-ui'
import ReminderSidebar from '@/components/crm/ReminderSidebar'
import { filterContacts, type FilterTab } from '@/lib/pipeline-ai'
import type { PipelineStageId, ScannedContact } from '@/lib/types'

const chipStyle = (active: boolean): React.CSSProperties =>
  active
    ? { border: '1px solid #00d4d4', color: '#00d4d4', background: 'rgba(0, 212, 212, 0.08)' }
    : { border: '1px solid #2a2a2a', color: '#555555', background: 'transparent' }

export default function ContactsPage() {
  const router = useRouter()
  const device = useDevice()
  const supabase = createClientComponent()

  const [contacts, setContacts] = useState<ScannedContact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('All')
  const [cur, setCur] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)
  const [crmStats, setCrmStats] = useState<{
    total: number
    byStatus: Record<string, number>
    avgLeadScore: number
    thisWeek: number
  } | null>(null)

  const toast = useCallback((msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 2500)
  }, [])

  const loadContacts = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }
    const { data, error: e } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('user_id', user.id)
      .order('scanned_at', { ascending: false })
    if (e) setError(e.message)
    else setContacts((data as ScannedContact[]) ?? [])
    setLoading(false)
  }, [router, supabase])

  useEffect(() => {
    loadContacts()
  }, [loadContacts, refreshKey])

  useEffect(() => {
    let mounted = true

    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !mounted) return

      const channel = supabase
        .channel('contacts-enrichment')
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
              return [inserted, ...prev]
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
              prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
            )
          }
        )
        .subscribe()

      return channel
    }

    let channelPromise = setupRealtime()

    return () => {
      mounted = false
      channelPromise.then((channel) => {
        if (channel) supabase.removeChannel(channel)
      })
    }
  }, [supabase, refreshKey])

  const handleRetryEnrichment = async (contactId: string) => {
    try {
      const res = await fetch(`/api/enrich/retry/${contactId}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Retry failed')
      toast('Retrying enrichment…')
    } catch {
      toast('Retry failed')
    }
  }

  useEffect(() => {
    fetch('/api/crm/stats')
      .then((r) => r.json())
      .then((json) => {
        if (json.total !== undefined) setCrmStats(json)
      })
      .catch(() => {})
  }, [refreshKey, contacts.length])

  const stats = useMemo(() => ({
    total: contacts.length,
    sent: contacts.filter((c) => c.status === 'sent' || c.status === 'replied').length,
    replied: contacts.filter((c) => c.status === 'replied').length,
  }), [contacts])

  const events = useMemo(() => {
    const set = new Set<string>()
    contacts.forEach((c) => c.event_name && set.add(c.event_name))
    return ['All', ...Array.from(set)]
  }, [contacts])

  const filtered = useMemo(() => (
    filter === 'All' ? contacts : contacts.filter((c) => c.event_name === filter)
  ), [contacts, filter])

  useEffect(() => { setCur(0) }, [filter])

  const active = filtered[cur] ?? null

  const exportToCSV = (exportContacts: ScannedContact[] = contacts) => {
    const headers = [
      'First Name', 'Last Name', 'Company', 'Job Title',
      'Email', 'Phone', 'Website', 'LinkedIn URL',
      'Match Score', 'Industry', 'Company Size',
      'Company Revenue', 'Event', 'Notes', 'Status',
      'LinkedIn Message', 'Email Subject',
      'Email Message', 'WhatsApp Message',
      'Scanned Date',
    ]

    const rows = exportContacts.map((c) => {
      const nameParts = (c.name || '').split(' ')
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || ''
      return [
        firstName,
        lastName,
        c.company || '',
        c.role || '',
        c.email || '',
        c.phone || '',
        c.website || '',
        c.linkedin_url || '',
        c.match_score ?? '',
        c.industry || '',
        c.company_size || '',
        c.company_revenue || '',
        c.event_name || '',
        c.notes || '',
        c.status || '',
        c.message_linkedin || '',
        c.email_subject || '',
        c.message_email || '',
        c.message_whatsapp || '',
        c.scanned_at ? new Date(c.scanned_at).toLocaleDateString() : '',
      ]
    })

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ABC_contacts_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const updatePipelineStage = async (contactId: string, stage: PipelineStageId) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, pipeline_stage: stage } : c))
    )
    try {
      const res = await fetch('/api/pipeline/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, stage }),
      })
      if (!res.ok) toast('Failed to update stage')
    } catch {
      toast('Failed to update stage')
    }
  }

  const handleDelete = async (contactId: string) => {
    if (!confirm('Delete this contact? This cannot be undone.')) return

    try {
      const res = await fetch('/api/card/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId }),
      })

      if (res.ok) {
        setContacts((prev) => prev.filter((c) => c.id !== contactId))
        setCur(0)
        toast('Contact deleted')
      } else {
        toast('Failed to delete')
      }
    } catch (err) {
      console.error(err)
      toast('Failed to delete')
    }
  }

  return (
    <div className="min-h-screen pb-8 page-shell">
      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0">
      <ReminderSidebar variant="banner" />
      <div className="flex items-center justify-between pb-1">
        <div>
          <h1 className="gradient-text page-heading font-black tracking-wide">CONTACTS</h1>
          {crmStats && (
            <p
              className="text-[10px] mt-1 whitespace-nowrap overflow-x-auto"
              style={{ color: '#3A2060' }}
            >
              Total: {crmStats.total}
              {' | '}
              New: {crmStats.byStatus.NEW ?? 0}
              {' | '}
              Contacted: {crmStats.byStatus.CONTACTED ?? 0}
              {' | '}
              Avg Score: {crmStats.avgLeadScore}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {contacts.length > 0 && (
            <button
              onClick={() => setShowExportModal(true)}
              style={{
                background: 'transparent',
                border: '1px solid #1A0E30',
                borderRadius: '10px',
                padding: '8px 12px',
                color: '#A78BFA',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              ↓ Export
            </button>
          )}
          <button aria-label="Search">
            <IconSearch size={20} style={{ color: '#2A1A4A' }} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 py-3 md:grid-cols-3 lg:grid-cols-3">
        {[
          { value: stats.total, label: 'Scanned', gradient: false },
          { value: stats.sent, label: 'Sent', gradient: false },
          { value: stats.replied, label: 'Replied', gradient: true },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl text-center p-3"
            style={{ background: '#0D0A18', border: '0.5px solid #1A0E30' }}
          >
            <span
              className={`block font-bold ${s.gradient ? 'gradient-text' : ''}`}
              style={{ fontSize: '18px', color: s.gradient ? undefined : '#F0EAFF' }}
            >
              {s.value}
            </span>
            <span className="block mt-0.5 uppercase tracking-wide" style={{ fontSize: '8px', color: '#3A2060' }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      <div className="pb-3 flex gap-2 flex-wrap">
        {events.map((ev) => (
          <button
            key={ev}
            onClick={() => setFilter(ev)}
            className="px-3 py-1.5 rounded-full text-xs"
            style={chipStyle(filter === ev)}
          >
            {ev}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 flex justify-center">
          <div className="w-7 h-7 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#7C3AED', borderRightColor: '#0EA5E9' }} />
        </div>
      ) : error ? (
        <p className="mx-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-14 px-6 text-center">
          <IconCreditCard size={48} style={{ color: '#2A1A4A' }} stroke={1.2} />
          <p className="text-sm" style={{ color: '#3A2060' }}>No business cards yet</p>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => router.push('/scan')}
            className="glow-btn rounded-xl text-white px-5 py-2.5 flex items-center gap-2"
          >
            📷 Scan your first card
          </motion.button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-14 px-6 text-center">
          <p className="text-sm" style={{ color: '#3A2060' }}>No contacts for this filter.</p>
        </div>
      ) : (
        <>
          {device === 'mobile' ? (
            <MobileContactsList
              contacts={contacts}
              onRefresh={() => setRefreshKey((k) => k + 1)}
              toast={toast}
              onContactsChange={setContacts}
            />
          ) : (
            <div className={`grid gap-3 ${device === 'tablet' ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {filtered.map((c) => {
                const score = c.ai_lead_score ?? c.match_score ?? 0
                const enriching = isContactEnriching(c)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => router.push('/contact/' + c.id)}
                    className="text-left rounded-2xl p-4 transition-colors hover:bg-[#1a1a2e]"
                    style={{ background: '#12121a', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <p className="font-bold truncate" style={{ color: '#F0EAFF' }}>
                      {c.name || 'Unknown'}
                    </p>
                    <p className="text-sm truncate mt-1" style={{ color: '#8B7AA8' }}>
                      {[c.company, c.role].filter(Boolean).join(' · ') || 'No company'}
                    </p>
                    <div className="flex items-center justify-between mt-3 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <EnrichmentIndicator
                          contact={c}
                          compact
                          onRetry={() => handleRetryEnrichment(c.id)}
                        />
                        <span className="text-[10px] uppercase font-bold truncate" style={{ color: '#a78bfa' }}>
                          {c.crm_status || 'NEW'}
                        </span>
                      </div>
                      {enriching ? (
                        <EnrichingPulse compact />
                      ) : (
                        <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: '#f0f0ff' }}>
                          {score}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {showExportModal && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(7,5,14,0.95)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
          onClick={() => setShowExportModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0D0A18',
              border: '1px solid #1A0E30',
              borderRadius: '20px',
              padding: '24px',
              width: '100%',
              maxWidth: '360px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h2 style={{ color: '#F0EAFF', fontSize: '18px', fontWeight: 700 }}>Export to CRM</h2>
                <p style={{ color: '#6B7280', fontSize: '13px' }}>{contacts.length} contacts ready</p>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                style={{ color: '#6B7280', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            <button
              onClick={() => {
                exportToCSV()
                setTimeout(() => window.open('https://login.salesforce.com', '_blank'), 1000)
              }}
              style={{ width: '100%', padding: '12px 16px', background: '#00A1E0', color: 'white', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              ☁️ Export to Salesforce
              <span style={{ fontSize: '11px', opacity: 0.8, marginLeft: 'auto' }}>CSV + Open Salesforce</span>
            </button>

            <button
              onClick={() => {
                exportToCSV()
                setTimeout(() => window.open('https://app.hubspot.com', '_blank'), 1000)
              }}
              style={{ width: '100%', padding: '12px 16px', background: '#FF7A59', color: 'white', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              🧡 Export to HubSpot
              <span style={{ fontSize: '11px', opacity: 0.8, marginLeft: 'auto' }}>CSV + Open HubSpot</span>
            </button>

            <button
              onClick={() => {
                exportToCSV()
                setTimeout(() => window.open('https://app.pipedrive.com', '_blank'), 1000)
              }}
              style={{ width: '100%', padding: '12px 16px', background: '#267558', color: 'white', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              🟢 Export to Pipedrive
              <span style={{ fontSize: '11px', opacity: 0.8, marginLeft: 'auto' }}>CSV + Open Pipedrive</span>
            </button>

            <button
              onClick={() => exportToCSV()}
              style={{ width: '100%', padding: '12px 16px', background: '#1D6F42', color: 'white', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              📊 Export to Excel / Sheets
              <span style={{ fontSize: '11px', opacity: 0.8, marginLeft: 'auto' }}>Download CSV</span>
            </button>

            <button
              onClick={() => exportToCSV()}
              style={{ width: '100%', padding: '12px 16px', background: 'linear-gradient(135deg, #7C3AED, #0EA5E9)', color: 'white', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              ↓ Download CSV
              <span style={{ fontSize: '11px', opacity: 0.8, marginLeft: 'auto' }}>Works with any CRM</span>
            </button>

            <p style={{ color: '#3A2060', fontSize: '11px', textAlign: 'center', lineHeight: 1.5 }}>
              After downloading CSV, go to your CRM → Contacts → Import → Upload the CSV file
            </p>
          </div>
        </div>
      )}

        </div>
        <ReminderSidebar variant="sidebar" />
      </div>

      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 rounded-full px-5 py-2.5 text-sm font-medium text-white"
            style={{ background: '#16A34A', boxShadow: '0 4px 16px rgba(22,163,74,0.4)' }}
          >
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
