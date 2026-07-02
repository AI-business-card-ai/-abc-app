import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('scanned_contacts')
      .select('id, scan_status, enrichment_status, enrichment_step, name, company, role')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error || !data) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const scanStatus =
      data.scan_status === 'enriched' || data.enrichment_status === 'DONE'
        ? 'enriched'
        : 'basic'

    return NextResponse.json({
      id: data.id,
      status: scanStatus,
      scan_status: data.scan_status,
      enrichment_status: data.enrichment_status,
      enrichment_step: data.enrichment_step,
      name: data.name,
      company: data.company,
      role: data.role,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Status check failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
