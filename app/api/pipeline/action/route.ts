import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServerSupabase } from '@/lib/supabase'
import { serverErrorResponse } from '@/lib/api/errors'

export async function POST(req: NextRequest) {
  try {
    const authClient = createRouteHandlerClient()
    const { data: { user } } = await authClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { contactId, nextAction, nextActionDate } = (await req.json()) as {
      contactId?: string
      nextAction?: string | null
      nextActionDate?: string | null
    }

    if (!contactId) {
      return NextResponse.json({ error: 'Missing contactId' }, { status: 400 })
    }

    const supabase = createServerSupabase()
    const { error } = await supabase
      .from('scanned_contacts')
      .update({
        next_action: nextAction ?? null,
        next_action_date: nextActionDate ?? null,
      })
      .eq('id', contactId)
      .eq('user_id', user.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return serverErrorResponse('pipeline/action', err)
  }
}
