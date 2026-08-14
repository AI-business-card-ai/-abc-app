import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { sanitizeCardExtract, type CardExtract } from '@/lib/scan-card-validation'
import { splitName } from '@/lib/data-model'

/**
 * Identity write-back for the rebuilt scanner.
 *
 * Two jobs, both deliberately free of enrichment, scoring and message
 * generation:
 *   - with `contactId`: persist the user's corrections to a contact that
 *     /api/card/scan already created from OCR.
 *   - without `contactId`: create a contact captured from a QR payload
 *     (vCard / MECARD), where no image was processed.
 *
 * QR captures do not consume a scan credit — no vision call is made.
 */

const ALLOWED_SOURCES = ['business_card', 'badge', 'qr', 'document', 'upload', 'auto']

type Body = {
  contactId?: string
  source?: string
  fields?: Partial<CardExtract> & { first_name?: string; last_name?: string }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as Body
    const input = body.fields || {}

    const clean = sanitizeCardExtract({
      name: input.name ?? null,
      company: input.company ?? null,
      role: input.role ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      website: input.website ?? null,
      linkedin_url: input.linkedin_url ?? null,
    } as CardExtract)

    // Prefer explicit first/last from the review form; fall back to splitting.
    const first = (input.first_name || '').trim()
    const last = (input.last_name || '').trim()
    const derived = splitName(clean.name)
    const firstName = first || derived.first_name
    const lastName = last || derived.last_name
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || clean.name

    if (!fullName && !clean.company && !clean.email) {
      return NextResponse.json(
        { error: 'Add at least a name, company or email before saving.' },
        { status: 400 }
      )
    }

    const source =
      typeof body.source === 'string' && ALLOWED_SOURCES.includes(body.source)
        ? body.source
        : null

    const identity = {
      name: fullName,
      first_name: firstName || null,
      last_name: lastName || null,
      company: clean.company,
      role: clean.role,
      email: clean.email,
      phone: clean.phone,
      website: clean.website,
      linkedin_url: clean.linkedin_url,
    }

    if (body.contactId) {
      const { data, error } = await supabase
        .from('scanned_contacts')
        .update(source ? { ...identity, source } : identity)
        .eq('id', body.contactId)
        .eq('user_id', user.id)
        .select('*')
        .single()

      if (error || !data) {
        return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
      }
      return NextResponse.json({ success: true, contact: data })
    }

    const { data, error } = await supabase
      .from('scanned_contacts')
      .insert({
        ...identity,
        user_id: user.id,
        status: 'pending',
        scan_status: 'basic',
        source: source || 'qr',
        enrichment_status: 'DONE',
        enrichment_step: 'none',
        lead_source: 'ABC AI Business Card',
        scanned_at: new Date().toISOString(),
      })
      .select('*')
      .single()

    if (error || !data) {
      console.error('[scan/contact] insert failed:', error)
      return NextResponse.json({ error: 'Could not save this contact.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, contact: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save this contact.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
