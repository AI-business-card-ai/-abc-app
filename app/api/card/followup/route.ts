import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServerSupabase } from '@/lib/supabase'

/**
 * Schedules the three-step follow-up sequence for one contact.
 *
 * The route used to take `userId` from the request body and match rows on it
 * with a service-role client. That is not an authorization check: it proves the
 * caller sent a consistent pair of identifiers, never that the caller owns
 * them. Anyone who knew a contact id and its owner's id could delete a user's
 * scheduled follow-ups and write new ones, without being signed in at all.
 *
 * The owner is now the authenticated session and nothing else. The ownership
 * read goes through the session client so row-level security enforces it a
 * second time, and every write happens after that read succeeds.
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

    const { contactId, userId } = (await req.json()) as {
      contactId?: string
      userId?: string
    }

    if (!contactId) {
      return NextResponse.json({ error: 'Missing contactId' }, { status: 400 })
    }

    /*
      The field is still accepted so older callers do not break, but it can only
      ever agree with the session — never replace it.
    */
    if (userId && userId !== user.id) {
      return NextResponse.json({ error: 'User mismatch' }, { status: 403 })
    }

    // Ownership first, through the session client so RLS applies as well.
    const { data: contact, error: fetchError } = await auth
      .from('scanned_contacts')
      .select('id, message_linkedin, message_email, message_whatsapp')
      .eq('id', contactId)
      .eq('user_id', user.id)
      .maybeSingle()

    // A contact owned by someone else is reported exactly like one that does
    // not exist, so this cannot be used to probe for other people's records.
    if (fetchError || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const supabase = createServerSupabase()

    await supabase
      .from('followup_sequences')
      .delete()
      .eq('contact_id', contactId)
      .eq('user_id', user.id)
      .eq('status', 'scheduled')

    const now = new Date()
    const sequences = [
      {
        contact_id: contactId,
        user_id: user.id,
        step: 1,
        message_type: 'linkedin' as const,
        message_body: contact.message_linkedin || 'Follow-up LinkedIn',
        scheduled_at: new Date(now.getTime() + 1 * 86400000).toISOString(),
        status: 'scheduled' as const,
      },
      {
        contact_id: contactId,
        user_id: user.id,
        step: 2,
        message_type: 'email' as const,
        message_body: contact.message_email || 'Follow-up Email',
        scheduled_at: new Date(now.getTime() + 3 * 86400000).toISOString(),
        status: 'scheduled' as const,
      },
      {
        contact_id: contactId,
        user_id: user.id,
        step: 3,
        message_type: 'whatsapp' as const,
        message_body: contact.message_whatsapp || 'Follow-up WhatsApp',
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
