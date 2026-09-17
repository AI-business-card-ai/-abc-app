import { NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/api/errors'
import { toTarget } from '@/lib/event-intelligence/data'
import { readJson, requireEventIntelligence } from '@/lib/event-intelligence/route-guard'

/**
 * Meeting targets — the owner's own decisions about who is worth their time.
 *
 * Unlike matches, these are written by the owner's own client. That is safe
 * because of the schema rather than because of this file: RLS insists the row
 * names the caller as owner, and the composite foreign key insists the match it
 * points at is one of theirs. A request naming somebody else's match is refused
 * by the database, not by a check here that a future route could forget.
 *
 * `event_id` and `presence_id` are derived from the match rather than accepted
 * from the body. A client that could choose them could file a target for one
 * company under another company's stand.
 */

const TARGET_COLUMNS =
  'id, user_id, match_id, event_id, presence_id, status, priority, private_note, scheduled_for, met_encounter_id'

/** Save a match as a target. */
export async function POST(request: Request) {
  const guard = await requireEventIntelligence()
  if (!guard.ok) return guard.response
  const { supabase, ownerId } = guard.context

  const body = await readJson(request)
  const matchId = typeof body?.matchId === 'string' ? body.matchId.trim() : ''
  if (!matchId) return NextResponse.json({ error: 'Which match?' }, { status: 400 })

  try {
    /*
      Read through the owner's own client, so row-level security decides whether
      this match exists for them. A match belonging to another account is not
      "forbidden" here — it is simply not found, which is the same answer as an
      id that never existed and tells a prober nothing.
    */
    const { data: match, error: matchError } = await supabase
      .from('intel_matches')
      .select('id, presence_id, objective_id')
      .eq('user_id', ownerId)
      .eq('id', matchId)
      .maybeSingle()

    if (matchError) throw matchError
    if (!match) return NextResponse.json({ error: 'No such match.' }, { status: 404 })

    const { data: objective, error: objectiveError } = await supabase
      .from('intel_event_objectives')
      .select('event_id')
      .eq('user_id', ownerId)
      .eq('id', String((match as Record<string, unknown>).objective_id))
      .maybeSingle()

    if (objectiveError) throw objectiveError
    if (!objective) return NextResponse.json({ error: 'No such match.' }, { status: 404 })

    const priority = normalizePriority(body?.priority)

    const { data, error } = await supabase
      .from('intel_meeting_targets')
      .upsert(
        {
          user_id: ownerId,
          match_id: matchId,
          event_id: String((objective as Record<string, unknown>).event_id),
          presence_id: String((match as Record<string, unknown>).presence_id),
          priority,
        },
        { onConflict: 'user_id,match_id' }
      )
      .select(TARGET_COLUMNS)
      .single()

    if (error) throw error
    return NextResponse.json({ target: toTarget(data as Record<string, unknown>) })
  } catch (err) {
    return serverErrorResponse('event-intelligence/targets', err)
  }
}

/** Change priority, status or the private note. */
export async function PATCH(request: Request) {
  const guard = await requireEventIntelligence()
  if (!guard.ok) return guard.response
  const { supabase, ownerId } = guard.context

  const body = await readJson(request)
  const targetId = typeof body?.targetId === 'string' ? body.targetId.trim() : ''
  if (!targetId) return NextResponse.json({ error: 'Which target?' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body?.priority !== undefined) patch.priority = normalizePriority(body.priority)

  if (body?.status !== undefined) {
    const status = String(body.status)
    /*
      'met' is deliberately not accepted, here or by the database. A target
      becomes met by pointing at an encounter the owner actually recorded — see
      the encounter bridge — and never by somebody saying so on a form.
    */
    if (!['saved', 'planned', 'skipped'].includes(status)) {
      return NextResponse.json({ error: 'That is not a status a target can be set to.' }, { status: 400 })
    }
    patch.status = status
  }

  /*
    Linking a meeting that actually happened — the encounter bridge.

    This accepts an encounter id and nothing else. It does not create an
    encounter, it does not create a contact, and there is no path from here that
    could: a target is a plan, an encounter is a thing that happened, and only
    the scan, QR, exchange and manual paths make the second. Passing null
    unlinks, which is what somebody does when they linked the wrong meeting.

    Nothing here checks that the encounter belongs to the caller, and that is
    deliberate rather than an oversight. The composite foreign key on
    (met_encounter_id, user_id) makes the database refuse any encounter that is
    not theirs, in this route and in every future one, including ones nobody has
    written yet. A check here as well would be a second answer to the same
    question, and the weaker of the two.
  */
  if (body?.metEncounterId !== undefined) {
    const encounterId = body.metEncounterId
    if (encounterId === null) {
      patch.met_encounter_id = null
    } else if (typeof encounterId === 'string' && encounterId.trim()) {
      patch.met_encounter_id = encounterId.trim()
    } else {
      return NextResponse.json({ error: 'That is not a meeting ABC can link.' }, { status: 400 })
    }
  }

  if (body?.privateNote !== undefined) {
    const note = typeof body.privateNote === 'string' ? body.privateNote.trim() : ''
    if (note.length > 2000) {
      return NextResponse.json({ error: 'That note is too long. Please keep it under 2000 characters.' }, { status: 400 })
    }
    patch.private_note = note || null
  }

  try {
    const { data, error } = await supabase
      .from('intel_meeting_targets')
      .update(patch)
      .eq('user_id', ownerId)
      .eq('id', targetId)
      .select(TARGET_COLUMNS)
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ error: 'No such target.' }, { status: 404 })
    return NextResponse.json({ target: toTarget(data as Record<string, unknown>) })
  } catch (err) {
    /*
      A foreign key violation here has one cause worth naming: an encounter id
      that is not this owner's. The database is the thing that refused it, and
      the honest sentence is that ABC cannot find that meeting — which is also
      all a prober learns.
    */
    if ((err as { code?: string })?.code === '23503') {
      return NextResponse.json({ error: 'ABC cannot find that meeting.' }, { status: 400 })
    }
    return serverErrorResponse('event-intelligence/targets', err)
  }
}

/** Remove a target. The match it came from is untouched. */
export async function DELETE(request: Request) {
  const guard = await requireEventIntelligence()
  if (!guard.ok) return guard.response
  const { supabase, ownerId } = guard.context

  const targetId = new URL(request.url).searchParams.get('id')?.trim() ?? ''
  if (!targetId) return NextResponse.json({ error: 'Which target?' }, { status: 400 })

  try {
    const { error } = await supabase
      .from('intel_meeting_targets')
      .delete()
      .eq('user_id', ownerId)
      .eq('id', targetId)

    if (error) throw error
    return NextResponse.json({ removed: true })
  } catch (err) {
    return serverErrorResponse('event-intelligence/targets', err)
  }
}

/** 1 must meet, 2 worth meeting, 3 if there is time. Anything else is 2. */
function normalizePriority(raw: unknown): 1 | 2 | 3 {
  const value = Number(raw)
  return value === 1 || value === 3 ? value : 2
}
