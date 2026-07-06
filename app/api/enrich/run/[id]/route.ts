import { NextRequest, NextResponse } from 'next/server'
import { runContactEnrichment, type EnrichmentOptions } from '@/lib/enrichment'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = (await req.json()) as { userId?: string } & EnrichmentOptions
    if (!body.userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    const { userId, skipLinkedIn, linkedinUrlOverride, skipApolloLinkedIn } = body
    await runContactEnrichment(params.id, userId, {
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
