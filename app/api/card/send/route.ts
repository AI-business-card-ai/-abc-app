import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServerSupabase } from '@/lib/supabase'

type MessageType = 'linkedin' | 'email' | 'whatsapp'

/**
 * Marks a contact as sent and stores the message bodies that went out.
 *
 * The owner used to be whoever the request body said it was, checked against a
 * service-role read — which only confirmed the caller had sent a matching pair
 * of ids, not that they held either. An unauthenticated request could rewrite
 * another user's outreach text and flip their contact to "sent".
 *
 * Identity now comes from the session, the ownership read runs through the
 * session client so RLS covers it, and the update is scoped to that user.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = createRouteHandlerClient()
    const {
      data: { user },
    } = await auth.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { contactId, userId, messageType, messageBody, messages, emailSubject } = body as {
      contactId?: string
      userId?: string
      messageType?: MessageType
      messageBody?: string
      messages?: { linkedin?: string; email?: string; whatsapp?: string }
      emailSubject?: string
    }

    if (!contactId) {
      return NextResponse.json({ error: 'Missing contactId' }, { status: 400 })
    }

    if (userId && userId !== user.id) {
      return NextResponse.json({ error: 'User mismatch' }, { status: 403 })
    }

    const { data: contact, error: fetchError } = await auth
      .from('scanned_contacts')
      .select('id')
      .eq('id', contactId)
      .eq('user_id', user.id)
      .maybeSingle()

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

    const supabase = createServerSupabase()

    const { data, error } = await supabase
      .from('scanned_contacts')
      .update(updatePayload)
      .eq('id', contactId)
      .eq('user_id', user.id)
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
