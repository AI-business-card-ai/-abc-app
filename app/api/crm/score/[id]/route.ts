import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'
import { calculateLeadScore } from '@/lib/crm'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: contact } = await supabase
    .from('scanned_contacts')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!contact) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const score = calculateLeadScore(contact)
  const service = createServiceClient()

  await service
    .from('scanned_contacts')
    .update({ ai_lead_score: score })
    .eq('id', params.id)
    .eq('user_id', user.id)

  return NextResponse.json({ score })
}
