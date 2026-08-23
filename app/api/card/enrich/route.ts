import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'
import { runContactEnrichment } from '@/lib/enrichment'

/**
 * Legacy alias — same central enrichment pipeline as /api/enrich/queue.
 *
 * Enrichment is no longer part of the product and this route has no callers
 * left; it is secured rather than revived. It previously ran the pipeline —
 * which reaches third-party providers and models — on the strength of a
 * `userId` sent in the request body, so an anonymous caller who knew a contact
 * id and its owner's id could spend money on someone else's account.
 *
 * Authentication and ownership now precede the pipeline, and the owner passed
 * downstream is the session user.
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

    const { contactId, userId } = (await req.json()) as {
      contactId?: string
      userId?: string
    }

    if (!contactId) {
      return NextResponse.json({ error: 'Missing contactId' }, { status: 400 })
    }

    if (userId && userId !== user.id) {
      return NextResponse.json({ error: 'User mismatch' }, { status: 403 })
    }

    // Ownership before any provider work, through the session client so RLS
    // enforces it too. Not-owned is answered exactly like not-found.
    const { data: contact, error: contactError } = await auth
      .from('scanned_contacts')
      .select('id')
      .eq('id', contactId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (contactError || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    await runContactEnrichment(contactId, user.id)

    const service = createServiceClient()
    const { data, error } = await service
      .from('scanned_contacts')
      .select('*')
      .eq('id', contactId)
      .eq('user_id', user.id)
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, contact: data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const maxDuration = 300
