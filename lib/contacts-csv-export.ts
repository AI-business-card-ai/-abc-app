import { downloadCsv } from '@/lib/crm-export'
import type { ScannedContact } from '@/lib/types'

const CONTACT_LIST_HEADERS = [
  'First Name',
  'Last Name',
  'Company',
  'Job Title',
  'Email',
  'Phone',
  'Website',
  'LinkedIn URL',
  'Match Score',
  'Industry',
  'Company Size',
  'Company Revenue',
  'Event',
  'Notes',
  'Status',
  'Pipeline Stage',
  'LinkedIn Message',
  'Email Subject',
  'Email Message',
  'WhatsApp Message',
  'Scanned Date',
] as const

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

export function buildContactsListCsv(contacts: ScannedContact[]): string {
  const rows = contacts.map((c) => {
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
      c.ai_lead_score ?? c.match_score ?? '',
      c.industry || '',
      c.company_size || '',
      c.company_revenue || '',
      c.event_name || '',
      c.notes || '',
      c.status || '',
      c.pipeline_stage || '',
      c.message_linkedin || '',
      c.email_subject || '',
      c.message_email || '',
      c.message_whatsapp || '',
      c.scanned_at ? new Date(c.scanned_at).toLocaleDateString() : '',
    ]
  })

  return [CONTACT_LIST_HEADERS.join(','), ...rows.map((row) => row.map(csvCell).join(','))].join('\n')
}

export function downloadContactsListCsv(
  contacts: ScannedContact[],
  filenamePrefix = 'ABC_contacts'
): void {
  if (contacts.length === 0) return
  const csv = buildContactsListCsv(contacts)
  const filename = `${filenamePrefix}_${new Date().toISOString().split('T')[0]}.csv`
  downloadCsv(csv, filename)
}
