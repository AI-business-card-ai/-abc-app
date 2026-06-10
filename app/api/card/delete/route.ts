import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase'

export async function DELETE(req: NextRequest) {
  try {
    const { contactId, userId } = (await req.json()) as {
      contactId?: string
      userId?: string
    }

    if (!contactId || !userId) {
      return NextResponse.json({ error: 'Missing contactId or userId' }, { status: 400 })
    }

    const supabase = createServerSupabase()

    const { error } = await supabase
      .from('scanned_contacts')
      .delete()
      .eq('id', contactId)
      .eq('user_id', userId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
