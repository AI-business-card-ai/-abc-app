import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { contactId, messageType, messageBody, userId } = await req.json()
    const supabase = createServerClient()

    const { error } = await supabase
      .from('scanned_contacts')
      .update({ status: 'sent' })
      .eq('id', contactId)
      .eq('user_id', userId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
