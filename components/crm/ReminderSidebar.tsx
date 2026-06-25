'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponent } from '@/lib/supabase'
import type { ScannedContact } from '@/lib/types'

function daysOverdue(dateStr: string | null | undefined): number {
  if (!dateStr) return 0
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return 0
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

type Props = {
  variant?: 'sidebar' | 'banner'
}

export default function ReminderSidebar({ variant = 'sidebar' }: Props) {
  const router = useRouter()
  const supabase = createClientComponent()
  const [contacts, setContacts] = useState<ScannedContact[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !active) {
        setLoading(false)
        return
      }

      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(23, 59, 59, 999)

      const { data } = await supabase
        .from('scanned_contacts')
        .select('*')
        .eq('user_id', user.id)
        .not('next_action_date', 'is', null)
        .lte('next_action_date', tomorrow.toISOString())
        .not('pipeline_stage', 'eq', 'won')
        .not('pipeline_stage', 'eq', 'lost')
        .order('next_action_date', { ascending: true })
        .limit(8)

      if (active) {
        setContacts((data as ScannedContact[]) || [])
        setLoading(false)
      }
    })()
    return () => { active = false }
  }, [supabase])

  const items = useMemo(() => contacts.slice(0, variant === 'banner' ? 3 : 5), [contacts, variant])

  if (loading || items.length === 0) return null

  const inner = (
    <>
      <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#00d4d4' }}>
        ⚡ Action needed ({contacts.length})
      </p>
      <div className="flex flex-col gap-3">
        {items.map((c) => {
          const overdue = daysOverdue(c.next_action_date)
          const urgency = overdue >= 3 ? '🔴' : overdue >= 1 ? '🟡' : '🟢'
          return (
            <div
              key={c.id}
              className="rounded-xl p-3 flex flex-col gap-2"
              style={{ background: '#1c1f35', border: '1px solid rgba(139,92,246,0.12)' }}
            >
              <div className="flex items-start gap-2">
                <span>{urgency}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate" style={{ color: '#f0f0ff' }}>
                    {c.name || 'Unknown'}
                  </p>
                  <p className="text-xs truncate" style={{ color: '#8892b0' }}>
                    {c.next_action || 'Follow up'}
                    {overdue > 0 ? ` — ${overdue} day${overdue === 1 ? '' : 's'} ago` : ' — today'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push('/contact/' + c.id)}
                className="text-xs font-semibold text-left min-h-[44px] rounded-lg px-3 py-2"
                style={{ background: 'rgba(0,212,212,0.1)', color: '#00d4d4', border: '1px solid rgba(0,212,212,0.25)' }}
              >
                Send now →
              </button>
            </div>
          )
        })}
      </div>
    </>
  )

  if (variant === 'banner') {
    return (
      <div
        className="mb-4 rounded-xl p-4 lg:hidden"
        style={{ background: '#141628', border: '1px solid rgba(245,158,11,0.25)' }}
      >
        {inner}
      </div>
    )
  }

  return (
    <aside
      className="hidden xl:block w-[280px] shrink-0 sticky top-6 self-start rounded-2xl p-4 max-h-[calc(100vh-120px)] overflow-y-auto"
      style={{ background: '#141628', border: '1px solid rgba(139,92,246,0.12)' }}
    >
      {inner}
    </aside>
  )
}
