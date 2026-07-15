import { NextRequest, NextResponse } from 'next/server'
import { ABC_LEAD_SOURCE } from '@/lib/crm-constants'
import { onCardScanned } from '@/lib/crm-engine'
import { sendReverseLeadNotification } from '@/lib/email'
import { triggerBackgroundEnrichment } from '@/lib/enrichment'
import { createServerSupabase } from '@/lib/supabase'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const company = typeof body.company === 'string' ? body.company.trim() : ''
    const role = typeof body.role === 'string' ? body.role.trim() : ''
    const context = typeof body.context === 'string' ? body.context.trim() : ''

    if (!userId || !UUID_RE.test(userId)) {
      return NextResponse.json({ success: false, error: 'Invalid card.' }, { status: 400 })
    }

    if (!name) {
      return NextResponse.json({ success: false, error: 'Name is required.' }, { status: 400 })
    }

    const supabase = createServerSupabase()

    const { data: ownerProfile } = await supabase
      .from('abc_profiles')
      .select('id, full_name, email')
      .eq('id', userId)
      .maybeSingle()

    if (!ownerProfile) {
      return NextResponse.json({ success: false, error: 'Card not found.' }, { status: 404 })
    }

    const contextText = context || null

    const { data: inserted, error } = await supabase
      .from('scanned_contacts')
      .insert({
        user_id: userId,
        name,
        company: company || null,
        role: role || null,
        email: null,
        phone: null,
        website: null,
        linkedin_url: null,
        industry: null,
        company_size: null,
        company_summary: company ? `${company} contact` : null,
        match_score: 0,
        match_reason: 'Submitted via ABC digital card QR.',
        message_linkedin: '',
        message_email: '',
        email_subject: '',
        message_whatsapp: '',
        status: 'pending',
        scan_status: 'basic',
        event_name: null,
        notes: contextText,
        meeting_topic: contextText,
        source: 'reverse_qr',
        lead_source: ABC_LEAD_SOURCE,
        enrichment_status: 'ENRICHING',
        enrichment_step: 'queued',
      })
      .select('id')
      .single()

    if (error || !inserted) {
      console.error('[reverse-lead] insert failed:', error)
      return NextResponse.json(
        { success: false, error: 'Could not save your info. Please try again.' },
        { status: 500 }
      )
    }

    const contactId = inserted.id

    onCardScanned(contactId, userId).catch(console.error)
    triggerBackgroundEnrichment(contactId, userId)

    let ownerEmail = ownerProfile.email
    if (!ownerEmail) {
      const { data: authData } = await supabase.auth.admin.getUserById(userId)
      ownerEmail = authData.user?.email ?? null
    }

    if (ownerEmail) {
      sendReverseLeadNotification({
        to: ownerEmail,
        ownerName: ownerProfile.full_name || 'there',
        contactName: name,
        company: company || undefined,
        context: context || undefined,
        contactId,
      }).catch((err) => console.error('[reverse-lead] email failed:', err))
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[reverse-lead] error:', err)
    return NextResponse.json(
      { success: false, error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}
