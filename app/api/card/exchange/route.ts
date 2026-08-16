import { NextRequest, NextResponse } from 'next/server'
import { ABC_LEAD_SOURCE } from '@/lib/crm-constants'
import { onCardScanned } from '@/lib/crm-engine'
import { sendCardExchangeNotification } from '@/lib/email'
import { createServerSupabase } from '@/lib/supabase'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const rateLimitMap = new Map<string, number[]>()

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const windowMs = 60 * 60 * 1000
  const hits = (rateLimitMap.get(ip) || []).filter((t) => now - t < windowMs)
  if (hits.length >= 5) {
    rateLimitMap.set(ip, hits)
    return true
  }
  hits.push(now)
  rateLimitMap.set(ip, hits)
  return false
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { ok: false, error: 'Too many requests. Try again shortly.' },
        { status: 429 }
      )
    }

    const body = (await req.json()) as Record<string, unknown>

    // Honeypot — bots fill "website"
    if (typeof body.website === 'string' && body.website.trim()) {
      return NextResponse.json({ ok: true })
    }

    const ownerUserId = typeof body.ownerUserId === 'string' ? body.ownerUserId.trim() : ''
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    const company = typeof body.company === 'string' ? body.company.trim() : ''
    const role = typeof body.role === 'string' ? body.role.trim() : ''
    const note = typeof body.note === 'string' ? body.note.trim() : ''
    const gdpr = body.gdpr === true

    if (!ownerUserId || !UUID_RE.test(ownerUserId)) {
      return NextResponse.json({ ok: false, error: 'That card is not valid.' }, { status: 400 })
    }
    if (!name || !email) {
      return NextResponse.json({ ok: false, error: 'Name and email are required.' }, { status: 400 })
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ ok: false, error: 'That email address is not valid.' }, { status: 400 })
    }
    if (!gdpr) {
      return NextResponse.json({ ok: false, error: 'Consent is required before sending.' }, { status: 400 })
    }

    const supabase = createServerSupabase()

    const { data: ownerProfile } = await supabase
      .from('abc_profiles')
      .select('id, full_name, email, public_email, card_published')
      .eq('id', ownerUserId)
      .maybeSingle()

    if (!ownerProfile || ownerProfile.card_published === false) {
      return NextResponse.json({ ok: false, error: 'Card not found.' }, { status: 404 })
    }

    const { data: inserted, error } = await supabase
      .from('scanned_contacts')
      .insert({
        user_id: ownerUserId,
        name,
        company: company || null,
        role: role || null,
        email: email || null,
        phone: phone || null,
        website: null,
        linkedin_url: null,
        industry: null,
        company_size: null,
        company_summary: company ? `${company} contact` : null,
        match_score: 0,
        match_reason: 'Submitted via ABC card exchange.',
        message_linkedin: '',
        message_email: '',
        email_subject: '',
        message_whatsapp: '',
        status: 'pending',
        scan_status: 'basic',
        event_name: null,
        notes: note || null,
        meeting_topic: note || null,
        source: 'card_exchange',
        lead_source: ABC_LEAD_SOURCE,
        crm_status: 'NEW',
        enrichment_status: 'DONE',
        enrichment_step: 'none',
      })
      .select('id')
      .single()

    if (error || !inserted) {
      console.error('[card/exchange] insert failed:', error)
      return NextResponse.json(
        { ok: false, error: 'Your details could not be saved. Try again.' },
        { status: 500 }
      )
    }

    const contactId = inserted.id as string

    onCardScanned(contactId, ownerUserId, { enrichmentPending: false }).catch(console.error)

    let ownerEmail = (ownerProfile.public_email || ownerProfile.email) as string | null
    if (!ownerEmail) {
      const { data: authData } = await supabase.auth.admin.getUserById(ownerUserId)
      ownerEmail = authData.user?.email ?? null
    }

    if (ownerEmail) {
      sendCardExchangeNotification({
        to: ownerEmail,
        ownerName: ownerProfile.full_name || 'there',
        contactName: name,
        company: company || undefined,
        email,
        phone: phone || undefined,
        role: role || undefined,
        note: note || undefined,
        contactId,
      }).catch((err) => console.error('[card/exchange] email failed:', err))
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[card/exchange] error:', err)
    return NextResponse.json({ ok: false, error: 'Something went wrong. Try again.' }, { status: 500 })
  }
}
