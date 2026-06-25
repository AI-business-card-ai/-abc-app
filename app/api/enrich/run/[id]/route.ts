import { NextRequest, NextResponse } from 'next/server'
import { runContactEnrichment } from '@/lib/enrichment'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = (await req.json()) as { userId?: string }
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    await runContactEnrichment(params.id, userId)
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Enrichment failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const maxDuration = 300
