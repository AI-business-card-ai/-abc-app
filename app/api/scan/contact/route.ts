import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { onCardScanned } from '@/lib/crm-engine'
import { sanitizeCardExtract, type CardExtract } from '@/lib/scan-card-validation'
import { splitName } from '@/lib/data-model'

/**
 * The one place a scan becomes a contact.
 *
 * Every capture — a photographed card, a vCard QR, another ABC card — arrives
 * here as reviewed fields with no id, and is created. Nothing upstream writes:
 * /api/card/scan reads the image and returns a candidate, so a scan the owner
 * discards leaves nothing behind to clean up.
 *
 * The `contactId` branch updates an existing contact instead of creating one.
 * No scan flow sends it any more, and it is kept rather than removed because it
 * is a legitimate owner-scoped edit path for anything that needs one later.
 *
 * Deliberately free of enrichment, scoring and message generation. QR captures
 * consume no scan credit — no vision call was made.
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

    /*
      CRM defaults and the "card scanned" activity belong to the moment a
      contact starts existing, and that moment moved here.

      They used to fire in /api/card/scan, next to the insert it did before the
      owner had reviewed anything — so an image scan got them and a QR scan,
      which has always created its contact here, silently never did. Running it
      at the one place a scan can create a row keeps the image path exactly as
      it was and gives the QR path the same treatment.
    */
    onCardScanned(data.id, user.id, { enrichmentPending: false }).catch(console.error)

    return NextResponse.json({ success: true, contact: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save this contact.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
