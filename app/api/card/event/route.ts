import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { applyPersonalMeetingBonus, aiScoreToDbFields, calculateAiMatchScore } from '@/lib/ai-scoring'
import { calculateLeadScore } from '@/lib/crm'
import { contactHasEventTag } from '@/lib/event-tag'
import type { ABCProfile, ScannedContact } from '@/lib/types'

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
    console.error('[card/event] AI score recalc skipped:', err)
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
    console.error('[card/event] score update failed:', error)
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
      eventName?: string
      note?: string
      recalculateScore?: boolean
    }

    if (!body.contactId) {
      return NextResponse.json({ error: 'Missing contactId' }, { status: 400 })
    }

    const eventName = body.eventName?.trim() || null
    const note = body.note?.trim() || null

    const { data, error } = await supabase
      .from('scanned_contacts')
      .update({
        event_name: eventName,
        notes: note,
        meeting_event_name: eventName,
        lead_source: eventName || 'ABC AI Business Card',
      })
      .eq('id', body.contactId)
      .eq('user_id', user.id)
      .select('*')
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    let contact = data as ScannedContact

    if (body.recalculateScore !== false && contactHasEventTag(contact)) {
      contact = await recalculateContactScore(contact, user.id)
    }

    return NextResponse.json({ success: true, contact })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save event'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
