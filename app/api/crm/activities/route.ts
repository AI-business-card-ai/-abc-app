import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const contactId = req.nextUrl.searchParams.get('contactId')
  if (!contactId) {
    return NextResponse.json({ error: 'Missing contactId' }, { status: 400 })
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

  const { data, error } = await supabase
    .from('crm_activities')
    .select('*')
    .eq('contact_id', contactId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ activities: data ?? [] })
}
