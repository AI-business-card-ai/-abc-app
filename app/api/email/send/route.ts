import { NextRequest, NextResponse } from 'next/server'
import {
  sendFollowUpReminder,
  sendMessageSentConfirmation,
  sendWelcomeEmail,
} from '@/lib/email'

type EmailType = 'welcome' | 'followup' | 'message-sent'

export async function POST(req: NextRequest) {
  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'Email is not configured' }, { status: 500 })
    }

    const body = (await req.json()) as {
      type?: EmailType
      to?: string
      name?: string
      contactName?: string
      channel?: string
      dayNumber?: number
    }

    const { type, to, name, contactName, channel, dayNumber } = body

    if (!type || !to) {
      return NextResponse.json({ error: 'Missing type or to' }, { status: 400 })
    }

    switch (type) {
      case 'welcome':
        await sendWelcomeEmail(to, name || 'there')
        break
      case 'followup':
        if (!name || !contactName || dayNumber === undefined) {
          return NextResponse.json({ error: 'Missing followup fields' }, { status: 400 })
        }
        await sendFollowUpReminder(to, name, contactName, dayNumber)
        break
      case 'message-sent':
        if (!name || !contactName || !channel) {
          return NextResponse.json({ error: 'Missing message-sent fields' }, { status: 400 })
        }
        await sendMessageSentConfirmation(to, name, contactName, channel)
        break
      default:
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send email'
    console.error('[email/send]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
