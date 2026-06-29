import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'
import { buildPostEnrichmentMapping } from '@/lib/data-model'
import { runIntelligenceResearch } from '@/lib/research'
import { enrichContact } from '@/lib/perplexity'
import { generatePersonalizedMessages } from '@/lib/ai-messages'
import { onEnrichmentCompleted } from '@/lib/crm-engine'
import type { ABCProfile } from '@/lib/types'

export async function POST(req: NextRequest) {
  try {
    const authClient = createRouteHandlerClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()
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
      .select('*')
      .eq('id', contactId)
      .eq('user_id', user.id)
      .single()

    if (error || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const { data: userProfile, error: profileError } = await supabase
      .from('abc_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('Profile fetch error:', profileError)
    }

    const profile = (userProfile as ABCProfile | null) ?? ({} as ABCProfile)

    const perplexityContext = await enrichContact(contact.name, contact.company, profile).catch((err) => {
      console.error('Perplexity enrichment skipped:', err)
      return ''
    })

    if (perplexityContext) {
      await supabase
        .from('scanned_contacts')
        .update({ enriched_context: perplexityContext })
        .eq('id', contactId)
    }

    await runIntelligenceResearch(
      {
        id: contactId,
        name: contact.name,
        company: contact.company,
        role: contact.role,
        industry: contact.industry,
      },
      supabase,
      profile
    )

    const { data: afterResearch } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('id', contactId)
      .single()

    const enrichmentDone = afterResearch?.enrichment_status === 'DONE'
    const mapping = buildPostEnrichmentMapping(afterResearch || contact, enrichmentDone)

    await supabase.from('scanned_contacts').update(mapping).eq('id', contactId)

    const aiMessages = await generatePersonalizedMessages(
      {
        ...(afterResearch || contact),
        enriched_context: perplexityContext || afterResearch?.enriched_context || contact.enriched_context,
        meeting_context: afterResearch?.event_name || afterResearch?.notes || contact.event_name || contact.notes,
      },
      profile
    ).catch((err) => {
      console.error('Message regeneration skipped:', err)
      return null
    })

    if (aiMessages) {
      await supabase
        .from('scanned_contacts')
        .update({
          message_linkedin: aiMessages.message_linkedin,
          message_email: aiMessages.message_email,
          email_subject: aiMessages.email_subject,
          message_whatsapp: aiMessages.message_whatsapp,
        })
        .eq('id', contactId)
    }

    const { data: updated } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('id', contactId)
      .single()

    const matchScore =
      updated?.ai_lead_score ?? updated?.match_score ?? contact.match_score ?? 50
    await onEnrichmentCompleted(contactId, user.id, Number(matchScore) || 50)

    const { data: refreshed } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('id', contactId)
      .single()

    return NextResponse.json({ success: true, contact: refreshed ?? updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Intelligence research failed'
    console.error('Enrich queue error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const maxDuration = 120
