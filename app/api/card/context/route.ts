import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { applyPersonalMeetingBonus, aiScoreToDbFields, calculateAiMatchScore } from '@/lib/ai-scoring'
import { ABC_LEAD_SOURCE } from '@/lib/crm-constants'
import { calculateLeadScore } from '@/lib/crm'
import { normalizeEventText } from '@/lib/event-normalizer'
import { ALL_OUTREACH_CHANNELS, type OutreachChannel } from '@/lib/contact-enrichment-ui'
import type { ABCProfile, ScannedContact } from '@/lib/types'

function normalizeChannels(channels: unknown): OutreachChannel[] {
  if (!Array.isArray(channels) || channels.length === 0) return [...ALL_OUTREACH_CHANNELS]
  const valid = channels.filter(
    (c): c is OutreachChannel => c === 'email' || c === 'whatsapp' || c === 'linkedin'
  )
  return valid.length > 0 ? valid : [...ALL_OUTREACH_CHANNELS]
}

async function recalculateContactScore(contact: ScannedContact, userId: string) {
  const supabase = createRouteHandlerClient()

  const { data: profileRow } = await supabase
    .from('abc_profiles')
    .select('*')
    .eq('id', userId)
    .single()

  const profile = profileRow as ABCProfile | null
  if (!profile) return contact

  let scoreFields: Record<string, unknown>

  const aiResult = await calculateAiMatchScore(contact, profile).catch((err) => {
    console.error('[card/context] AI score recalc skipped:', err)
    return null
  })

  if (aiResult) {
    const withBonus = applyPersonalMeetingBonus(aiResult)
    scoreFields = aiScoreToDbFields(withBonus)
  } else {
    const fallbackScore = calculateLeadScore(contact)
    scoreFields = {
      ai_lead_score: fallbackScore,
      match_score: fallbackScore,
    }
  }

  const { data: updated, error } = await supabase
    .from('scanned_contacts')
    .update(scoreFields)
    .eq('id', contact.id)
    .eq('user_id', userId)
    .select('*')
    .single()

  if (error || !updated) {
    console.error('[card/context] score update failed:', error)
    return contact
  }

  return updated as ScannedContact
}

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
      whereMet?: string
      topic?: string
      followupNote?: string
      preferredChannels?: OutreachChannel[]
      recalculateScore?: boolean
    }

    if (!body.contactId) {
      return NextResponse.json({ error: 'Missing contactId' }, { status: 400 })
    }

    const whereMet = (body.whereMet || '').trim() || null
    const topic = (body.topic || '').trim() || null
    const followupNote = (body.followupNote || '').trim() || null
    const preferredChannels = normalizeChannels(body.preferredChannels)

    const normalizedEvent = whereMet ? await normalizeEventText(whereMet) : null

    const noteParts = [whereMet, topic, followupNote].filter(Boolean)
    const combinedNote = noteParts.length > 0 ? noteParts.join('. ') : null

    const updatePayload: Record<string, unknown> = {
      meeting_topic: topic,
      followup_note: followupNote,
      notes: combinedNote,
      preferred_channels: preferredChannels,
    }

    if (whereMet) {
      updatePayload.raw_event_text = whereMet
      updatePayload.normalized_event_text = normalizedEvent
      updatePayload.event_name = normalizedEvent
      updatePayload.meeting_event_name = normalizedEvent
      updatePayload.lead_source = ABC_LEAD_SOURCE
    }

    const { data, error } = await supabase
      .from('scanned_contacts')
      .update(updatePayload)
      .eq('id', body.contactId)
      .eq('user_id', user.id)
      .select('*')
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    let contact = data as ScannedContact

    const hasContext = Boolean(whereMet || topic || followupNote)

    if (body.recalculateScore !== false && hasContext) {
      contact = await recalculateContactScore(contact, user.id)
    }

    if (contact.enrichment_status === 'DONE') {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

      fetch(`${baseUrl}/api/enrich/messages/${contact.id}`, {
        method: 'POST',
        headers: { cookie: req.headers.get('cookie') || '' },
      }).catch((err) => console.error('[card/context] message regen skipped:', err))
    }

    return NextResponse.json({ success: true, contact })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save context'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
