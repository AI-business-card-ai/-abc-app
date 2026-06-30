import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'
import { sendGmailMessage } from '@/lib/gmail'
import { onMessageSent } from '@/lib/crm-engine'
import { isGoogleProvider } from '@/lib/google-oauth'

export async function POST(req: NextRequest) {
  try {
    const authClient = createRouteHandlerClient()
    const {
      data: { session },
    } = await authClient.auth.getSession()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accessToken = session.provider_token
    if (!accessToken || !isGoogleProvider(session)) {
      return NextResponse.json({ error: 'Please reconnect Google account' }, { status: 403 })
    }

    const body = (await req.json()) as {
      contactId?: string
      subject?: string
      body?: string
    }

    if (!body.contactId || !body.subject || !body.body) {
      return NextResponse.json({ error: 'Missing contactId, subject, or body' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: contact } = await supabase
      .from('scanned_contacts')
      .select('id, email')
      .eq('id', body.contactId)
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (!contact?.email) {
      return NextResponse.json({ error: 'Contact email not found' }, { status: 404 })
    }

    await sendGmailMessage(accessToken, contact.email, body.subject, body.body)
    await onMessageSent(body.contactId, session.user.id, 'Gmail', body.body)

    const { data: updated } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('id', body.contactId)
      .single()

    return NextResponse.json({ success: true, contact: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send Gmail message'
    console.error('send-gmail error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
