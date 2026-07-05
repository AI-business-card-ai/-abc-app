import type { ScannedContact } from '@/lib/types'

/** Bonus applied when user confirms an in-person meeting / event context. */
export const PERSONAL_MEETING_SCORE_BONUS = 8

const DEFAULT_LEAD_SOURCE = 'abc ai business card'

export function contactHasEventTag(
  contact: Pick<ScannedContact, 'event_name' | 'notes' | 'meeting_event_name' | 'lead_source'> | null | undefined
): boolean {
  if (!contact) return false

  const eventName = contact.event_name?.trim()
  if (eventName && eventName.toLowerCase() !== DEFAULT_LEAD_SOURCE) return true

  const meetingName = contact.meeting_event_name?.trim()
  if (meetingName && meetingName.toLowerCase() !== DEFAULT_LEAD_SOURCE) return true

  if (contact.notes?.trim()) return true

  const leadSource = contact.lead_source?.trim()
  if (leadSource && leadSource.toLowerCase() !== DEFAULT_LEAD_SOURCE) return true

  return false
}

export function getContactMeetingContext(
  contact: Pick<ScannedContact, 'event_name' | 'notes' | 'meeting_event_name'>
): string {
  return (contact.event_name || contact.meeting_event_name || contact.notes || '').trim()
}
