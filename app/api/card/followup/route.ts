import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { contactId, userId } = await req.json()
    const supabase = createServerClient()

    const now = new Date()
    const day1 = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000)
    const day3 = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    const day7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const sequences = [
      { contact_id: contactId, user_id: userId, step: 1, message_type: 'linkedin', message_body: 'Follow-up #1', scheduled_at: day1.toISOString(), status: 'scheduled' },
      { contact_id: contactId, user_id: userId, step: 2, message_type: 'email', message_body: 'Follow-up #2', scheduled_at: day3.toISOString(), status: 'scheduled' },
      { contact_id: contactId, user_id: userId, step: 3, message_type: 'whatsapp', message_body: 'Follow-up #3', scheduled_at: day7.toISOString(), status: 'scheduled' },
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
