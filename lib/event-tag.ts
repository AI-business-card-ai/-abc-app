import type { ScannedContact } from '@/lib/types'

/** Bonus applied when user confirms an in-person meeting / event context. */
export const PERSONAL_MEETING_SCORE_BONUS = 8

export function contactHasEventTag(
  contact: Pick<
    ScannedContact,
    'event_name' | 'notes' | 'meeting_event_name' | 'raw_event_text' | 'normalized_event_text'
  > | null | undefined
): boolean {
  if (!contact) return false

  if (contact.normalized_event_text?.trim()) return true
  if (contact.raw_event_text?.trim()) return true
  if (contact.event_name?.trim()) return true
  if (contact.meeting_event_name?.trim()) return true
  if (contact.notes?.trim()) return true

  return false
}

export function getContactMeetingContext(
  contact: Pick<
    ScannedContact,
    'normalized_event_text' | 'event_name' | 'notes' | 'meeting_event_name' | 'raw_event_text'
  >
): string {
  return (
    contact.normalized_event_text?.trim() ||
    contact.event_name?.trim() ||
    contact.meeting_event_name?.trim() ||
    contact.raw_event_text?.trim() ||
    contact.notes?.trim() ||
    ''
  )
}

export function getContactRawEventText(
  contact: Pick<ScannedContact, 'raw_event_text' | 'notes' | 'event_name'>
): string {
  return (contact.raw_event_text || contact.notes || contact.event_name || '').trim()
}
