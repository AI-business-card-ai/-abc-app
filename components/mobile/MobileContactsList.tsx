'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import ContactMobileCard from '@/components/mobile/ContactMobileCard'
import { updateContact } from '@/lib/crm-client'
import { logCrmActivity } from '@/lib/crm-client'
import { filterContacts, type FilterTab } from '@/lib/pipeline-ai'
import type { ScannedContact } from '@/lib/types'

const FILTER_CHIPS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'hot', label: '🔥 Hot' },
  { id: 'action', label: '⚡ Action' },
  { id: 'week', label: '📅 This Week' },
  { id: 'closed', label: '✓ Done' },
]

type Props = {
  contacts: ScannedContact[]
  onRefresh: () => void
  toast: (msg: string) => void
  onContactsChange: (updater: (prev: ScannedContact[]) => ScannedContact[]) => void
}

export default function MobileContactsList({ contacts, onRefresh, toast, onContactsChange }: Props) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<FilterTab>('all')
  const pullStart = useRef(0)

  const visible = useMemo(() => {
    let list = filterContacts(contacts, filter)
    const q = searchQuery.trim().toLowerCase()
    if (!q) return list
    return list.filter((c) => {
      const hay = [c.name, c.company, c.role, ...(c.tags || [])].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [contacts, filter, searchQuery])

  async function markContacted(id: string) {
    onContactsChange((prev) =>
      prev.map((c) => (c.id === id ? { ...c, crm_status: 'CONTACTED' as const } : c))
    )
    logCrmActivity({
      contactId: id,
      activityType: 'LINKEDIN_COPIED',
      activityDetail: 'Marked as contacted (swipe)',
    })
    toast('Marked as contacted')
  }

  async function markFollowUp(id: string) {
    onContactsChange((prev) =>
      prev.map((c) => (c.id === id ? { ...c, pipeline_stage: 'follow-up' } : c))
    )
    try {
      await updateContact({ contactId: id, pipeline_stage: 'follow-up' })
      toast('Added to follow-up')
    } catch {
      toast('Update failed')
    }
  }

  async function handleDeleteContact(contactId: string) {
    try {
      const res = await fetch('/api/card/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId }),
      })
      const json = (await res.json()) as { success?: boolean; error?: string }
      if (!res.ok || !json.success) throw new Error(json.error || 'Delete failed')
      onContactsChange((prev) => prev.filter((c) => c.id !== contactId))
      toast('Contact deleted')
    } catch {
      toast('Failed to delete')
    }
  }

  return (
    <div className="flex flex-col gap-3 pb-24">
      <input
        type="search"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search name, company, tags…"
        className="w-full abc-input px-4 py-3 text-base min-h-[52px]"
      />

      <div
        className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {FILTER_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setFilter(chip.id)}
            className="shrink-0 snap-start rounded-full px-4 py-2 text-xs font-semibold min-h-[44px]"
            style={
              filter === chip.id
                ? { background: 'linear-gradient(135deg, rgba(0,212,212,0.2), rgba(139,92,246,0.2))', color: '#00d4d4', border: '1px solid rgba(0,212,212,0.4)' }
                : { background: '#141628', color: '#8892b0', border: '1px solid rgba(139,92,246,0.12)' }
            }
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div
        onTouchStart={(e) => { pullStart.current = e.touches[0].clientY }}
        onTouchEnd={(e) => {
          if (e.changedTouches[0].clientY - pullStart.current > 100) onRefresh()
        }}
        className="flex flex-col gap-3"
      >
        {visible.length === 0 ? (
          <p className="text-center py-12 text-sm" style={{ color: '#8892b0' }}>
            No contacts match
          </p>
        ) : (
          visible.map((c) => (
            <ContactMobileCard
              key={c.id}
              contact={c}
              onContacted={() => markContacted(c.id)}
              onFollowUp={() => markFollowUp(c.id)}
              onDelete={handleDeleteContact}
            />
          ))
        )}
      </div>

      <motion.button
        type="button"
        whileTap={{ scale: 0.92 }}
        onClick={() => router.push('/scan')}
        className="fixed right-4 z-20 w-14 h-14 rounded-full flex items-center justify-center text-xl shadow-lg lg:hidden"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom) + 80px)',
          background: 'linear-gradient(135deg, #00d4d4, #f0197d)',
          boxShadow: '0 4px 24px rgba(0, 212, 212, 0.35)',
        }}
        aria-label="Scan card"
      >
        📷
      </motion.button>
    </div>
  )
}
