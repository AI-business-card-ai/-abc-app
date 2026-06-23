import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase'
import { enrichContact } from '@/lib/perplexity'
import { logActivity } from '@/lib/crm'
import { ABCProfile } from '@/lib/types'

export async function POST(req: NextRequest) {
  try {
    const { contactId, userId } = (await req.json()) as {
      contactId?: string
      userId?: string
    }

    if (!contactId || !userId) {
      return NextResponse.json({ error: 'Missing contactId or userId' }, { status: 400 })
    }

    const supabase = createServerSupabase()

    const { data: contact, error: contactError } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('id', contactId)
      .eq('user_id', userId)
      .single()

    if (contactError || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const { data: profile } = await supabase
      .from('abc_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    const enrichedContext = await enrichContact(
      contact.name,
      contact.company,
      (profile as ABCProfile | null) ?? {}
    )

    const { data, error } = await supabase
      .from('scanned_contacts')
      .update({ enriched_context: enrichedContext || null })
      .eq('id', contactId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw error

    logActivity({
      contactId,
      userId,
      activityType: 'AI_ENRICHED',
      activityDetail: `Additional research completed for ${contact.name || 'contact'}`,
    }).catch(console.error)

    return NextResponse.json({ success: true, contact: data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
