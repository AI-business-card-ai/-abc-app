import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase'
import { triggerBackgroundEnrichment } from '@/lib/enrichment'

/**
 * Queue full enrichment for an existing contact (LinkedIn, Apollo, AI score, messages).
 * Returns immediately — pipeline runs via /api/enrich/run/[id].
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { contactId?: string; userId?: string }
    const { contactId, userId } = body

    if (!contactId) {
      return NextResponse.json({ error: 'Missing contactId' }, { status: 400 })
    }
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    const supabase = createServerSupabase()
    const { data: contact, error } = await supabase
      .from('scanned_contacts')
      .select('id, user_id, enrichment_status')
      .eq('id', contactId)
      .eq('user_id', userId)
      .maybeSingle()

    if (error || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    await supabase
      .from('scanned_contacts')
      .update({
        enrichment_status: 'PENDING',
        enrichment_step: 'queued',
      })
      .eq('id', contactId)
      .eq('user_id', userId)

    triggerBackgroundEnrichment(contactId, userId)

    return NextResponse.json({ success: true, queued: true, contactId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Enrichment failed'
    console.error('[card/scan/enrich]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
