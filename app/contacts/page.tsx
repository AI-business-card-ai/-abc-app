'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { IconSearch, IconCreditCard, IconBrandLinkedin, IconMail, IconPhone, IconDeviceMobile } from '@tabler/icons-react'
import { createClientComponent } from '@/lib/supabase'
import BottomNav from '@/components/ui/BottomNav'
import CardStack from '@/components/ui/CardStack'
import PipelineStageBadge from '@/components/ui/PipelineStageBadge'
import type { PipelineStageId, ScannedContact } from '@/lib/types'

const chipStyle = (active: boolean): React.CSSProperties =>
  active
    ? { border: '0.5px solid #7C3AED', color: '#A78BFA', background: '#1A0A2E' }
    : { border: '0.5px solid #1A0E30', color: '#3A2060', background: 'transparent' }

export default function ContactsPage() {
  const router = useRouter()
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
    if (!confirm('Delete this contact?')) return

    try {
      const { data: { user } } = await supabase.auth.getUser()

      const res = await fetch('/api/card/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, userId: user?.id }),
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
    <div className="min-h-screen pb-28" style={{ background: '#07050E' }}>
      <div className="flex items-center justify-between px-4 pt-6 pb-1">
        <div>
          <h1 className="gradient-text text-xl font-black tracking-wide">CONTACTS</h1>
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

      <div className="grid grid-cols-3 gap-2 px-4 py-3">
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

      <div className="px-4 pb-3 flex gap-2 flex-wrap">
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
          <CardStack
            contacts={filtered}
            cur={cur}
            onCurChange={setCur}
            onSelect={(id) => router.push('/contact/' + id)}
          />

          <div className="flex justify-center gap-1 py-2">
            {filtered.map((c, i) => (
              <button
                key={c.id}
                onClick={() => setCur(i)}
                aria-label={`Karta ${i + 1}`}
                className="rounded-full transition-all"
                style={
                  i === cur
                    ? { width: 14, height: 4, background: '#A78BFA' }
                    : { width: 4, height: 4, background: '#1A0E30' }
                }
              />
            ))}
          </div>

          <AnimatePresence mode="wait">
            {active && (
              <motion.div
                key={active.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="mx-4 rounded-xl p-3 mt-1 flex flex-col gap-2.5"
                style={{ background: '#06040C', border: '0.5px solid #1A0E30' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: '#A78BFA', boxShadow: '0 0 6px #A78BFA' }}
                    />
                    <span className="text-xs font-medium truncate" style={{ color: '#A78BFA' }}>
                      {active.event_name ?? 'No event'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <PipelineStageBadge
                      stage={active.pipeline_stage}
                      onChange={(stage) => updatePipelineStage(active.id, stage)}
                    />
                    <span className="text-xs" style={{ color: '#3A2060' }}>
                      {new Date(active.scanned_at).toLocaleDateString('en-US')}
                    </span>
                  </div>
                </div>

                {active.notes ? (
                  <p className="text-sm italic leading-relaxed" style={{ color: '#3A2060' }}>
                    {active.notes}
                  </p>
                ) : (
                  <p className="text-sm italic" style={{ color: '#2A1A4A' }}>
                    No notes
                  </p>
                )}

                <div className="flex gap-1.5">
                  {active.linkedin_url && (
                    <a href={active.linkedin_url} target="_blank" rel="noreferrer" className="icon-btn w-9 h-9">
                      <IconBrandLinkedin size={17} />
                    </a>
                  )}
                  {active.email && (
                    <a href={`mailto:${active.email}`} className="icon-btn w-9 h-9">
                      <IconMail size={17} />
                    </a>
                  )}
                  {active.phone && (
                    <a href={`tel:${active.phone}`} className="icon-btn w-9 h-9">
                      <IconPhone size={17} />
                    </a>
                  )}
                  <a
                    href={`/api/contact/vcard/${active.id}`}
                    className="icon-btn w-9 h-9"
                    aria-label="Save to Phone"
                  >
                    <IconDeviceMobile size={17} />
                  </a>
                </div>

                <div className="flex gap-1.5 items-stretch flex-wrap">
                  <button
                    onClick={() => router.push('/chat/' + active.id)}
                    className="flex-1 min-w-[72px] py-2 text-xs rounded-lg"
                    style={{ border: '0.5px solid #1A0E30', color: '#F0EAFF' }}
                  >
                    💬 Chat
                  </button>
                  <button
                    onClick={() => router.push('/contact/' + active.id)}
                    className="flex-1 min-w-[72px] py-2 text-xs rounded-lg"
                    style={{ border: '0.5px solid #1A0E30', color: '#F0EAFF' }}
                  >
                    ✉ Message
                  </button>
                  <button
                    onClick={() => router.push('/contact/' + active.id)}
                    className="flex-1 min-w-[72px] py-2 text-xs rounded-lg glow-btn text-white font-medium"
                  >
                    ✦ Detail
                  </button>
                  <button
                    onClick={() => handleDelete(active.id)}
                    className="flex-1 min-w-[72px] py-2 text-xs rounded-lg font-medium"
                    style={{ border: '0.5px solid rgba(239,68,68,0.35)', color: '#EF4444' }}
                  >
                    🗑 Delete
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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

      <BottomNav />

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
