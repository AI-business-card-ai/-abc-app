import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { requirePro } from '@/lib/entitlements'
import { createServiceClient } from '@/lib/supabase/service'
import {
  GoogleReconnectRequiredError,
  GOOGLE_RECONNECT_CODE,
  sendGmailForContact,
} from '@/lib/gmail-send'

export async function POST(req: NextRequest) {
  try {
    const authClient = createRouteHandlerClient()
    // getUser, not getSession: whether this account may send is decided by a verified identity.
    const {
      data: { user },
    } = await authClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Sending from Gmail is ABC Pro. A lapsed Pro stops sending; the stored connection stays.
    const gate = await requirePro(createServiceClient(), user, 'gmail')
    if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status })

    const body = (await req.json()) as {
      contactId?: string
      subject?: string
      body?: string
    }

    if (!body.contactId || !body.subject || !body.body) {
      return NextResponse.json({ error: 'Missing contactId, subject, or body' }, { status: 400 })
    }

    const result = await sendGmailForContact(
      user.id,
      body.contactId,
      body.subject,
      body.body
    )

    return NextResponse.json({
      success: true,
      contact: result.contact,
      messageId: result.messageId,
      sentAt: result.sentAt,
    })
  } catch (err) {
    if (err instanceof GoogleReconnectRequiredError) {
      return NextResponse.json(
        {
          error: err.message,
          code: GOOGLE_RECONNECT_CODE,
        },
        { status: 403 }
      )
    }

    const message = err instanceof Error ? err.message : 'Failed to send email'
    console.error('send-gmail error:', err)

    if (message === 'Contact email not found') {
      return NextResponse.json({ error: message }, { status: 404 })
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
