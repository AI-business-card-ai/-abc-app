'use client'

import { useEffect, useState } from 'react'
import type { ActivityType } from '@/lib/crm'

type CrmActivity = {
  id: string
  activity_type: ActivityType
  activity_detail: string | null
  created_at: string
}

const ACTIVITY_ICONS: Record<ActivityType, string> = {
  CARD_SCANNED: '📷',
  AI_ENRICHED: '✨',
  EMAIL_SENT: '✉️',
  WHATSAPP_OPENED: '💬',
  LINKEDIN_COPIED: '🔗',
  STAGE_CHANGED: '📊',
  VCARD_SAVED: '📱',
  NOTE_ADDED: '📝',
  EXPORTED_CSV: '⬇️',
  WEBHOOK_SENT: '🔌',
  MESSAGE_GENERATED: '💡',
}

function formatWhen(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ActivityTimeline({ contactId }: { contactId: string }) {
  const [activities, setActivities] = useState<CrmActivity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/crm/activities?contactId=${contactId}`)
        const json = await res.json()
        if (active && res.ok) setActivities(json.activities ?? [])
      } catch {
        if (active) setActivities([])
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [contactId])

  if (loading) {
    return (
      <div className="py-4 flex justify-center">
        <div
          className="w-5 h-5 rounded-full border-2 border-transparent animate-spin"
          style={{ borderTopColor: '#7C3AED' }}
        />
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <p className="text-xs py-2" style={{ color: '#3A2060' }}>
        No activity logged yet.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-0">
      {activities.map((activity, i) => (
        <div key={activity.id} className="flex gap-3 relative">
          {i < activities.length - 1 && (
            <span
              className="absolute left-[11px] top-7 bottom-0 w-px"
              style={{ background: '#1A0E30' }}
            />
          )}
          <span
            className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs z-10"
            style={{ background: '#1A0A2E', border: '0.5px solid #1A0E30' }}
          >
            {ACTIVITY_ICONS[activity.activity_type] || '•'}
          </span>
          <div className="pb-4 min-w-0 flex-1">
            <p className="text-sm leading-snug" style={{ color: '#C9BEDE' }}>
              {activity.activity_detail || activity.activity_type.replace(/_/g, ' ')}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: '#3A2060' }}>
              {formatWhen(activity.created_at)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
