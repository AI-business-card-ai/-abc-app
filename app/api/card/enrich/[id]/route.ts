import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { runContactEnrichment, type EnrichmentOptions } from '@/lib/enrichment'

/**
 * Phase 2 — Background enrichment for a single contact.
 * Apollo / Perplexity / LinkedIn run in parallel with per-source timeouts.
 * Progressive DB updates stream to the client via Supabase Realtime.
 *
 * This route had no authentication of any kind and no ownership check at all —
 * weaker even than its siblings, which at least matched the contact against the
 * id pair the caller sent. It took `userId` straight from the body and handed
 * it to the enrichment pipeline, which trusts its caller and scopes its own
 * queries by exactly that value. An anonymous request naming any contact and
 * its owner therefore ran paid third-party work against that account.
 *
 * The session is now the only identity, ownership is proved before the pipeline
 * starts, and the id passed downstream is the session user's.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = createRouteHandlerClient()
    const {
      data: { user },
    } = await auth.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const contactId = params.id
    if (!contactId) {
      return NextResponse.json({ error: 'Missing contactId' }, { status: 400 })
    }

    const body = (await req.json().catch(() => ({}))) as { userId?: string } & EnrichmentOptions

    /*
      Still accepted so the existing browser caller does not have to change, but
      it can only ever agree with the session — never stand in for it.
    */
    if (body.userId && body.userId !== user.id) {
      return NextResponse.json({ error: 'User mismatch' }, { status: 403 })
    }

    // Ownership before the pipeline, through the session client so RLS applies
    // too. A contact owned by someone else answers exactly like a missing one.
    const { data: contact, error: contactError } = await auth
      .from('scanned_contacts')
      .select('id')
      .eq('id', contactId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (contactError || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const { skipLinkedIn, linkedinUrlOverride, skipApolloLinkedIn } = body
    await runContactEnrichment(contactId, user.id, {
      skipLinkedIn,
      linkedinUrlOverride,
      skipApolloLinkedIn,
    })

    return NextResponse.json({ success: true, contactId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Enrichment failed'
    console.error('[card/enrich/[id]]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const maxDuration = 300
