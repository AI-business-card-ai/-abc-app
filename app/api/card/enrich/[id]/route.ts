import { NextRequest, NextResponse } from 'next/server'
import { runContactEnrichment, type EnrichmentOptions } from '@/lib/enrichment'

/**
 * Phase 2 — Background enrichment for a single contact.
 * Apollo / Perplexity / LinkedIn run in parallel with per-source timeouts.
 * Progressive DB updates stream to the client via Supabase Realtime.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = (await req.json().catch(() => ({}))) as { userId?: string } & EnrichmentOptions
    if (!body.userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    const { userId, skipLinkedIn, linkedinUrlOverride, skipApolloLinkedIn } = body
    await runContactEnrichment(params.id, userId, {
      skipLinkedIn,
      linkedinUrlOverride,
      skipApolloLinkedIn,
    })

    return NextResponse.json({ success: true, contactId: params.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Enrichment failed'
    console.error('[card/enrich/[id]]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const maxDuration = 300
