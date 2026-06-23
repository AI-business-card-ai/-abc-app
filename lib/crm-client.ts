import type { ActivityType } from '@/lib/crm'

export function logCrmActivity(payload: {
  contactId: string
  activityType: ActivityType
  activityDetail?: string
  metadata?: Record<string, unknown>
}) {
  fetch('/api/crm/activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(console.error)
}
