import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import {
  GoogleReconnectRequiredError,
  GOOGLE_RECONNECT_CODE,
  sendGmailForContact,
} from '@/lib/gmail-send'

export async function POST(req: NextRequest) {
  try {
    const authClient = createRouteHandlerClient()
    const {
      data: { session },
    } = await authClient.auth.getSession()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as {
      contactId?: string
      subject?: string
      body?: string
    }

    if (!body.contactId || !body.subject || !body.body) {
      return NextResponse.json({ error: 'Missing contactId, subject, or body' }, { status: 400 })
    }

    const result = await sendGmailForContact(
      session.user.id,
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
