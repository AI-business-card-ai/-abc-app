import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase'
import { createServiceClient } from '@/lib/supabase/service'
import { runContactEnrichment } from '@/lib/enrichment'

/** Legacy alias — same central enrichment pipeline as /api/enrich/queue. */
export async function POST(req: NextRequest) {
  try {
    const { contactId, userId } = (await req.json()) as {
      contactId?: string
      userId?: string
    }

    if (!contactId || !userId) {
      return NextResponse.json({ error: 'Missing contactId or userId' }, { status: 400 })
    }

    const supabase = createServerSupabase()

    const { data: contact, error: contactError } = await supabase
      .from('scanned_contacts')
      .select('id')
      .eq('id', contactId)
      .eq('user_id', userId)
      .single()

    if (contactError || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    await runContactEnrichment(contactId, userId)

    const service = createServiceClient()
    const { data, error } = await service
      .from('scanned_contacts')
      .select('*')
      .eq('id', contactId)
      .eq('user_id', userId)
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, contact: data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const maxDuration = 300
