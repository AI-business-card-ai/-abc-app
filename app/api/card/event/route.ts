import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as {
      contactId?: string
      eventName?: string
      note?: string
    }

    if (!body.contactId) {
      return NextResponse.json({ error: 'Missing contactId' }, { status: 400 })
    }

    const eventName = body.eventName?.trim() || null
    const note = body.note?.trim() || null

    const { data, error } = await supabase
      .from('scanned_contacts')
      .update({
        event_name: eventName,
        notes: note,
        meeting_event_name: eventName,
        lead_source: eventName || 'ABC AI Business Card',
      })
      .eq('id', body.contactId)
      .eq('user_id', user.id)
      .select('*')
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, contact: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save event'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
