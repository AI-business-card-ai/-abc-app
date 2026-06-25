import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'
import { onMessageSent, type MessageChannel } from '@/lib/crm-engine'

export async function POST(req: NextRequest) {
  try {
    const authClient = createRouteHandlerClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as {
      contactId?: string
      channel?: MessageChannel
      messageText?: string
    }

    if (!body.contactId || !body.channel) {
      return NextResponse.json({ error: 'Missing contactId or channel' }, { status: 400 })
    }

    const channels: MessageChannel[] = ['LinkedIn', 'Email', 'WhatsApp']
    if (!channels.includes(body.channel)) {
      return NextResponse.json({ error: 'Invalid channel' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: existing } = await supabase
      .from('scanned_contacts')
      .select('id')
      .eq('id', body.contactId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    await onMessageSent(body.contactId, user.id, body.channel, body.messageText || '')

    const { data: contact } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('id', body.contactId)
      .single()

    return NextResponse.json({ success: true, contact })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to log message'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
