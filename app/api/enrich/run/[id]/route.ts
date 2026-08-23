import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { runContactEnrichment, type EnrichmentOptions } from '@/lib/enrichment'

/**
 * Runs the enrichment pipeline for one contact, synchronously.
 *
 * Same defect as its sibling under /api/card/enrich/[id], and no callers left:
 * no authentication, no ownership check, and `userId` taken from the body and
 * passed to a pipeline that trusts whatever owner it is handed. Secured, not
 * revived — enrichment is no longer part of the product.
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

    if (body.userId && body.userId !== user.id) {
      return NextResponse.json({ error: 'User mismatch' }, { status: 403 })
    }

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
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Enrichment failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const maxDuration = 300
