import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { logActivity, type ActivityType } from '@/lib/crm'

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { contactId, activityType, activityDetail, metadata } = await req.json()

  if (!contactId || !activityType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data: contact } = await supabase
    .from('scanned_contacts')
    .select('id')
    .eq('id', contactId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  const result = await logActivity({
    contactId,
    userId: user.id,
    activityType: activityType as ActivityType,
    activityDetail,
    metadata,
  })

  return NextResponse.json(result)
}
