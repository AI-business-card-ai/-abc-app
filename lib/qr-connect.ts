import { ABC_LEAD_SOURCE } from '@/lib/crm-constants'
import { onCardScanned } from '@/lib/crm-engine'
import { sendQrConnectNotification } from '@/lib/email'
import { triggerBackgroundEnrichment } from '@/lib/enrichment'
import { createServerSupabase } from '@/lib/supabase'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * "Join ABC" viral loop: someone signed up from a public card link
 * (/login?connect={ownerUserId}). Save the card owner as a contact in the
 * new user's account and notify the owner. Invalid owner ids are ignored.
 */
export async function handleQrConnect(
  newUserId: string,
  newUserName: string | null,
  ownerUserId: string
) {
  if (!UUID_RE.test(ownerUserId) || ownerUserId === newUserId) return

  const supabase = createServerSupabase()

  const { data: owner } = await supabase
    .from('abc_profiles')
    .select('id, full_name, company, role, email, phone, linkedin_url')
    .eq('id', ownerUserId)
    .maybeSingle()

  if (!owner) return

  // Re-login with the same connect link shouldn't duplicate the contact
  const { data: existing } = await supabase
    .from('scanned_contacts')
    .select('id')
    .eq('user_id', newUserId)
    .eq('source', 'qr_connect')
    .eq('name', owner.full_name || '')
    .maybeSingle()

  if (existing) return

  const { data: inserted, error } = await supabase
    .from('scanned_contacts')
    .insert({
      user_id: newUserId,
      name: owner.full_name || null,
      company: owner.company || null,
      role: owner.role || null,
      email: owner.email || null,
      phone: owner.phone || null,
      website: null,
      linkedin_url: owner.linkedin_url || null,
      industry: null,
      company_size: null,
      company_summary: owner.company ? `${owner.company} contact` : null,
      match_score: 0,
      match_reason: 'Connected via ABC digital card.',
      message_linkedin: '',
      message_email: '',
      email_subject: '',
      message_whatsapp: '',
      status: 'pending',
      scan_status: 'basic',
      event_name: null,
      notes: 'Connected by joining ABC from their digital card.',
      source: 'qr_connect',
      lead_source: ABC_LEAD_SOURCE,
      enrichment_status: 'ENRICHING',
      enrichment_step: 'queued',
    })
    .select('id')
    .single()

  if (error || !inserted) {
    console.error('[qr-connect] contact insert failed:', error)
    return
  }

  onCardScanned(inserted.id, newUserId).catch(console.error)
  triggerBackgroundEnrichment(inserted.id, newUserId)

  let ownerEmail = owner.email
  if (!ownerEmail) {
    const { data: authData } = await supabase.auth.admin.getUserById(ownerUserId)
    ownerEmail = authData.user?.email ?? null
  }

  if (ownerEmail) {
    sendQrConnectNotification({
      to: ownerEmail,
      ownerName: owner.full_name || 'there',
      newUserName: newUserName || 'Someone',
    }).catch((err) => console.error('[qr-connect] email failed:', err))
  }
}
