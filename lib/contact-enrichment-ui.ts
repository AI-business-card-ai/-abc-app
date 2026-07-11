import type { ScannedContact } from '@/lib/types'

export type OutreachChannel = 'email' | 'whatsapp' | 'linkedin'

export const ALL_OUTREACH_CHANNELS: OutreachChannel[] = ['email', 'whatsapp', 'linkedin']

export function isContactEnriching(
  contact: Pick<ScannedContact, 'enrichment_status'>
): boolean {
  const status = contact.enrichment_status
  return status === 'PENDING' || status === 'ENRICHING'
}

export function getPreferredChannels(contact: ScannedContact): OutreachChannel[] {
  const raw = contact.preferred_channels
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.filter(
      (c): c is OutreachChannel => c === 'email' || c === 'whatsapp' || c === 'linkedin'
    )
  }
  return ALL_OUTREACH_CHANNELS
}

export function buildMeetingContext(contact: ScannedContact): string | null {
  const parts = [
    contact.event_name || contact.raw_event_text,
    contact.meeting_topic,
    contact.followup_note,
    contact.notes,
  ]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)

  return parts.length > 0 ? parts.join('. ') : null
}
