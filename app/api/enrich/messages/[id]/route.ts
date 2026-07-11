import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'
import { generatePersonalizedMessages } from '@/lib/ai-messages'
import { buildMeetingContext } from '@/lib/contact-enrichment-ui'
import { isLinkedInDataTrusted, stripUntrustedLinkedInFields } from '@/lib/linkedin-identity'
import type { ABCProfile, ScannedContact } from '@/lib/types'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authClient = createRouteHandlerClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServiceClient()

    const { data: contact, error: contactError } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (contactError || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const { data: profileRow } = await supabase
      .from('abc_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    const profile = (profileRow as ABCProfile | null) ?? ({} as ABCProfile)
    const c = contact as ScannedContact
    const safeContact = stripUntrustedLinkedInFields(c)

    const aiMessages = await generatePersonalizedMessages(
      {
        ...safeContact,
        meeting_context: buildMeetingContext(c) || undefined,
      },
      profile,
      isLinkedInDataTrusted(c) ? undefined : null
    )

    if (!aiMessages) {
      return NextResponse.json({ error: 'Failed to generate messages' }, { status: 500 })
    }

    const { data: updated, error: updateError } = await supabase
      .from('scanned_contacts')
      .update({
        message_linkedin: aiMessages.message_linkedin,
        message_email: aiMessages.message_email,
        email_subject: aiMessages.email_subject,
        message_whatsapp: aiMessages.message_whatsapp,
      })
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select('*')
      .single()

    if (updateError) throw updateError

    return NextResponse.json({ success: true, contact: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Message regeneration failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const maxDuration = 60
