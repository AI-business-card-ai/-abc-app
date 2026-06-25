import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'
import { runIntelligenceResearch } from '@/lib/research'

export async function POST(req: NextRequest) {
  try {
    const authClient = createRouteHandlerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { contactId } = (await req.json()) as { contactId?: string }
    if (!contactId) {
      return NextResponse.json({ error: 'Missing contactId' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: contact, error } = await supabase
      .from('scanned_contacts')
      .select('id, name, company, role, industry')
      .eq('id', contactId)
      .eq('user_id', user.id)
      .single()

    if (error || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    await runIntelligenceResearch(contact, supabase)

    const { data: updated } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('id', contactId)
      .single()

    return NextResponse.json({ success: true, contact: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Intelligence research failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const maxDuration = 120
