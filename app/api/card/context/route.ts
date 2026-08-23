import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { applyPersonalMeetingBonus, aiScoreToDbFields, calculateAiMatchScore } from '@/lib/ai-scoring'
import { ABC_LEAD_SOURCE } from '@/lib/crm-constants'
import { calculateLeadScore } from '@/lib/crm'
import { normalizeEventText } from '@/lib/event-normalizer'
import { sanitizeProvenance } from '@/lib/scan/provenance'
import { ALL_OUTREACH_CHANNELS, type OutreachChannel } from '@/lib/contact-enrichment-ui'
import {
  createEncounter,
  legacyProjection,
  recomputeContactFollowUpProjection,
  meetingHasContent,
  sanitizeMeetingInput,
  updateEncounter,
  type EncounterRow,
} from '@/lib/encounters'
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
      /**
       * The meeting being written.
       *
       * Given: revise that encounter — the owner is correcting what was said,
       * not claiming to have met the person again. Omitted: record a new one.
       * The scan flow passes the encounter its save already created, so a
       * capture with meeting context stays one meeting rather than two.
       */
      encounterId?: string
      /**
       * How this meeting was captured, when it came from a scan of somebody
       * already in the owner's contacts. Recorded on the new encounter, because
       * the same person can be met twice by different routes — photographed at
       * one event, QR-scanned at the next. The contact's own Phase 3 provenance
       * describes how they first arrived and is deliberately left alone.
       *
       * Untrusted, and validated by the same sanitizer the scan save uses.
       * Ignored on a revision: an edit changes what was said, not how it was
       * captured.
       */
      provenance?: unknown
      whereMet?: string
      topic?: string
      followupNote?: string
      preferredChannels?: OutreachChannel[]
      recalculateScore?: boolean
      /** Next step agreed in the meeting. */
      nextAction?: string
      /** ISO date the follow-up is due — drives the dashboard counts. */
      followUpAt?: string | null
      /** The rebuilt scanner writes context only; no AI message generation. */
      generateMessages?: boolean
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

    const nextAction = (body.nextAction || '').trim() || null
    const followUpAt = (body.followUpAt || '').trim() || null

    const captureProvenance = sanitizeProvenance(body.provenance)

    const meeting = sanitizeMeetingInput({
      event: whereMet,
      eventNormalized: normalizedEvent,
      discussed: topic,
      nextAction,
      followUpAt,
    })

    /*
      Canonical first: the meeting, then the projection of it.

      contact_encounters is the history; the flat columns on scanned_contacts
      are a convenience copy of the newest one for the twenty-odd readers that
      have not moved across yet. So the encounter is written before anything is
      copied anywhere. If the copy then fails, the meeting still happened and is
      still recorded, and the projection is merely stale — recoverable by saving
      again. The reverse order would let the contact claim a meeting that the
      history has no record of, and a projection cannot be the thing that proves
      an event occurred.
    */
    const { data: ownedContact, error: ownershipError } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('id', body.contactId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (ownershipError || !ownedContact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    /*
      A revision has to name a meeting that belongs to this contact, not merely
      one belonging to this owner. Matching on id and user_id alone would let a
      stale or muddled client edit the encounter of a different contact the same
      person owns — their own data, so RLS is satisfied, and still wrong: the
      wrong meeting rewritten and the wrong contact's context projected from it.
      All three must agree, so all three are in the query.

      Everything that fails to match returns the same "not found", whether the
      encounter belongs to another contact, another owner, or nobody at all.
    */
    const encounter: EncounterRow | null = body.encounterId
      ? await updateEncounter(supabase, {
          encounterId: body.encounterId,
          contactId: body.contactId,
          userId: user.id,
          meeting,
        })
      : await createEncounter(supabase, {
          contactId: body.contactId,
          userId: user.id,
          meeting,
          capture: {
            captureOrigin: captureProvenance?.origin ?? null,
            captureKind: captureProvenance?.kind ?? null,
          },
        })

    if (!encounter) {
      return NextResponse.json(
        {
          error: body.encounterId
            ? 'Meeting not found'
            : 'Could not save this meeting. Try again.',
        },
        { status: body.encounterId ? 404 : 500 }
      )
    }


    /*
      The reminder, recomputed from every meeting rather than assumed from this
      one. Runs on every successful write, including a revision to an older
      meeting, because changing any meeting's follow-up date can change which
      one is due first. Before the projection update below, so the row that
      update re-reads already carries the right value.
    */
    const nextDue = await recomputeContactFollowUpProjection(supabase, {
      ownerId: user.id,
      contactId: body.contactId,
    })

    /*
      Only the newest meeting may drive the projection.

      Correcting a note from a conference two years ago must not make the
      contact's current follow-up date and context appear to come from 2023 —
      the flat columns mean "latest", and the dashboard, the follow-up buckets
      and the contact list all believe them. So the projection is written only
      when the encounter just touched is in fact the newest one.
    */
    const { data: newest } = await supabase
      .from('contact_encounters')
      .select('id')
      .eq('contact_id', body.contactId)
      .eq('user_id', user.id)
      .order('met_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const isLatest = !newest || newest.id === encounter.id

    /*
      A brand-new meeting with nothing written down projects nothing.

      Scanning someone the owner already knows and adding no notes still records
      that they met — but copying that emptiness onto the contact would blank
      the topic and notes from the last meeting they *did* write up, which is
      what the screen and the CRM would then show. The encounter stands either
      way; only the summary of it is withheld.

      A revision is exempt: clearing a field while editing is the owner saying
      to clear it, and that must keep working.
    */
    const projectable = Boolean(body.encounterId) || meetingHasContent(meeting)

    let contact = { ...(ownedContact as ScannedContact), next_action_date: nextDue }
    let projectionStale = false

    if (isLatest && projectable) {
      const updatePayload: Record<string, unknown> = {
        ...legacyProjection(meeting, {
          leadSource: ABC_LEAD_SOURCE,
          followupNote,
        }),
        followup_note: followupNote,
        notes: combinedNote,
        preferred_channels: preferredChannels,
      }

      /*
        Preserved quirk, not an oversight: an omitted next step or follow-up
        date leaves whatever is already stored rather than clearing it. The form
        has always sent empty strings for untouched fields, so writing null here
        would wipe a follow-up the owner never meant to touch.
      */
      if (nextAction === null) {
        delete updatePayload.next_action
        delete updatePayload.next_step
      }

      const { data: projected, error: projectionError } = await supabase
        .from('scanned_contacts')
        .update(updatePayload)
        .eq('id', body.contactId)
        .eq('user_id', user.id)
        .select('*')
        .single()

      if (projectionError || !projected) {
        // The meeting is safely recorded; only the compatibility copy failed.
        // Say so plainly rather than reporting a success that is half true, and
        // keep the database's own words out of the response.
        console.error('[card/context] latest-meeting projection failed:', projectionError)
        projectionStale = true
      } else {
        contact = projected as ScannedContact
      }
    }

    const hasContext = Boolean(whereMet || topic || followupNote || nextAction)

    if (body.recalculateScore !== false && hasContext) {
      contact = await recalculateContactScore(contact, user.id)
    }

    // Messages were generated without context if enrichment finished before the sheet save.
    // Re-run message generation whenever context is saved on an already-enriched contact.
    if (body.generateMessages !== false && contact.enrichment_status === 'DONE') {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

      fetch(`${baseUrl}/api/enrich/messages/${contact.id}`, {
        method: 'POST',
        headers: { cookie: req.headers.get('cookie') || '' },
      }).catch((err) => console.error('[card/context] message regen failed:', err))
    }

    /*
      `projectionStale` is the honest half-success: the meeting is recorded and
      safe, but the contact's latest-meeting copy did not take, so follow-up and
      list views may lag until the next save. Reported as a flag rather than an
      error, because failing the request would suggest the meeting was lost.
    */
    return NextResponse.json({ success: true, contact, encounter, projectionStale })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save context'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
