import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

type MessageType = 'linkedin' | 'email' | 'whatsapp'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { contactId, userId, messageType, messageBody, messages, emailSubject } = body as {
      contactId?: string
      userId?: string
      messageType?: MessageType
      messageBody?: string
      messages?: { linkedin?: string; email?: string; whatsapp?: string }
      emailSubject?: string
    }

    if (!contactId || !userId) {
      return NextResponse.json({ error: 'Missing contactId or userId' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: contact, error: fetchError } = await supabase
      .from('scanned_contacts')
      .select('id')
      .eq('id', contactId)
      .eq('user_id', userId)
      .single()

    if (fetchError || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const updatePayload: Record<string, string> = { status: 'sent' }

    if (messages) {
      if (messages.linkedin != null) updatePayload.message_linkedin = messages.linkedin
      if (messages.email != null) updatePayload.message_email = messages.email
      if (messages.whatsapp != null) updatePayload.message_whatsapp = messages.whatsapp
    } else if (messageType && messageBody != null) {
      if (messageType === 'linkedin') updatePayload.message_linkedin = messageBody
      if (messageType === 'email') updatePayload.message_email = messageBody
      if (messageType === 'whatsapp') updatePayload.message_whatsapp = messageBody
    }

    if (emailSubject != null) updatePayload.email_subject = emailSubject

    const { data, error } = await supabase
      .from('scanned_contacts')
      .update(updatePayload)
      .eq('id', contactId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw error
    if (!data) throw new Error('Update failed — no rows affected')

    return NextResponse.json({ success: true, contact: data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
