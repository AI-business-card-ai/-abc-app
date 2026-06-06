import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    const { contactId, userId, messages } = await req.json() as {
      contactId?: string
      userId?: string
      messages?: { linkedin?: string; email?: string; whatsapp?: string }
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

    await supabase
      .from('followup_sequences')
      .delete()
      .eq('contact_id', contactId)
      .eq('user_id', userId)
      .eq('status', 'scheduled')

    const now = new Date()
    const sequences = [
      {
        contact_id: contactId,
        user_id: userId,
        step: 1,
        message_type: 'linkedin' as const,
        message_body: messages?.linkedin || 'Follow-up LinkedIn',
        scheduled_at: new Date(now.getTime() + 1 * 86400000).toISOString(),
        status: 'scheduled' as const,
      },
      {
        contact_id: contactId,
        user_id: userId,
        step: 2,
        message_type: 'email' as const,
        message_body: messages?.email || 'Follow-up Email',
        scheduled_at: new Date(now.getTime() + 3 * 86400000).toISOString(),
        status: 'scheduled' as const,
      },
      {
        contact_id: contactId,
        user_id: userId,
        step: 3,
        message_type: 'whatsapp' as const,
        message_body: messages?.whatsapp || 'Follow-up WhatsApp',
        scheduled_at: new Date(now.getTime() + 7 * 86400000).toISOString(),
        status: 'scheduled' as const,
      },
    ]

    const { data, error } = await supabase
      .from('followup_sequences')
      .insert(sequences)
      .select()

    if (error) throw error
    return NextResponse.json({ success: true, sequences: data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
