import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase'
import { runContactEnrichment, triggerBackgroundEnrichment } from '@/lib/enrichment'
import { serverErrorResponse } from '@/lib/api/errors'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: contact, error } = await supabase
      .from('scanned_contacts')
      .select('id, user_id, enrichment_status')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (error || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    await supabase
      .from('scanned_contacts')
      .update({
        enrichment_status: 'PENDING',
        enrichment_step: 'queued',
      })
      .eq('id', params.id)
      .eq('user_id', user.id)

    triggerBackgroundEnrichment(params.id, user.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    return serverErrorResponse('enrich/retry/[id]', err, 'Retry failed. Try again.')
  }
}
