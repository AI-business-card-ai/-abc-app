import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServerSupabase } from '@/lib/supabase'
import { triggerBackgroundEnrichment } from '@/lib/enrichment'

/**
 * Queue Phase 2 enrichment (returns immediately).
 * Prefer POST /api/card/enrich/[id] for the actual worker.
 *
 * Like its sibling, this had no authentication at all: it read `userId` from
 * the body, matched a row on it with a service-role client, then flipped the
 * contact's enrichment state and kicked off background work. Knowing two
 * identifiers was enough to queue paid work against another account.
 *
 * The session is now the only source of identity, and nothing is written or
 * queued until the contact is confirmed to belong to it.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = createRouteHandlerClient()
    const {
      data: { user },
    } = await auth.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as { contactId?: string; userId?: string }
    const { contactId, userId } = body

    if (!contactId) {
      return NextResponse.json({ error: 'Missing contactId' }, { status: 400 })
    }

    if (userId && userId !== user.id) {
      return NextResponse.json({ error: 'User mismatch' }, { status: 403 })
    }

    const { data: contact, error } = await auth
      .from('scanned_contacts')
      .select('id')
      .eq('id', contactId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const supabase = createServerSupabase()

    await supabase
      .from('scanned_contacts')
      .update({
        enrichment_status: 'PENDING',
        enrichment_step: 'queued',
      })
      .eq('id', contactId)
      .eq('user_id', user.id)

    triggerBackgroundEnrichment(contactId, user.id)

    return NextResponse.json({ success: true, queued: true, contactId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Enrichment failed'
    console.error('[card/scan/enrich]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
