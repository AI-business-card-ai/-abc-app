import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'
import { onReplyReceived } from '@/lib/crm-engine'
import { serverErrorResponse } from '@/lib/api/errors'

export async function POST(req: NextRequest) {
  try {
    const authClient = createRouteHandlerClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { contactId } = (await req.json()) as { contactId?: string }
    if (!contactId) {
      return NextResponse.json({ error: 'Missing contactId' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: existing } = await supabase
      .from('scanned_contacts')
      .select('id')
      .eq('id', contactId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    await onReplyReceived(contactId, user.id)

    const { data: contact } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('id', contactId)
      .single()

    return NextResponse.json({ success: true, contact })
  } catch (err) {
    return serverErrorResponse('contact/reply-received', err, 'Could not log the reply. Try again.')
  }
}
