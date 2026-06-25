import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'
import { onDealLost, onDealWon } from '@/lib/crm-engine'

export async function POST(req: NextRequest) {
  try {
    const authClient = createRouteHandlerClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as {
      contactId?: string
      outcome?: 'won' | 'lost'
      dealValue?: number
      reason?: string
    }

    if (!body.contactId || !body.outcome) {
      return NextResponse.json({ error: 'Missing contactId or outcome' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: existing } = await supabase
      .from('scanned_contacts')
      .select('id')
      .eq('id', body.contactId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    if (body.outcome === 'won') {
      await onDealWon(body.contactId, user.id, Number(body.dealValue) || 0)
    } else {
      await onDealLost(body.contactId, user.id, body.reason || 'Not specified')
    }

    const { data: contact } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('id', body.contactId)
      .single()

    return NextResponse.json({ success: true, contact })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update deal outcome'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
