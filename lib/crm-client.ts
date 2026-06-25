import type { ActivityType } from '@/lib/crm'
import type { ScannedContact } from '@/lib/types'

export function logCrmActivity(payload: {
  contactId: string
  activityType: ActivityType
  activityDetail?: string
  metadata?: Record<string, unknown>
}) {
  return fetch('/api/crm/activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(console.error)
}

export async function updateContact(payload: {
  contactId: string
  pipeline_stage?: string
  deal_value?: number
  deal_currency?: string
  expected_close_date?: string | null
  tags?: string[]
  response_received?: boolean
  pipeline_notes?: string
  lead_status?: string
  rating?: string
  opportunity_stage?: string
  close_probability?: number
  next_step?: string
}) {
  const res = await fetch('/api/contact/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Update failed')
  return json as { success: boolean; contact: ScannedContact }
}
