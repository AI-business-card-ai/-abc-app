import { NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/api/errors'
import { createServiceClient } from '@/lib/supabase/service'
import { parseMissed } from '@/lib/event-intelligence/benchmark'
import {
  clearMissedOpportunity,
  recordMissedOpportunity,
} from '@/lib/event-intelligence/benchmark-data'
import { loadEventByKey, loadObjective } from '@/lib/event-intelligence/data'
import { readJson, requireEventIntelligence } from '@/lib/event-intelligence/route-guard'

/**
 * A company ABC should have suggested, and did not.
 *
 * Without this the benchmark could only grade ABC's own output, which is the
 * failure mode of every self-assessment: a system that recommends three
 * companies and gets all three right looks perfect and is useless. A missed
 * opportunity is the owner saying the ranking was wrong about something it
 * never showed them.
 *
 * The edition is resolved from the event key and the company must be exhibiting
 * at that edition — checked here and again by a composite foreign key — so a
 * flag raised on this year's fair can never be about last year's stand.
 */
export async function POST(request: Request) {
  const guard = await requireEventIntelligence()
  if (!guard.ok) return guard.response
  const { supabase, ownerId } = guard.context

  const body = await readJson(request)
  if (!body) return NextResponse.json({ error: 'Nothing to record.' }, { status: 400 })

  const eventKey = typeof body.eventKey === 'string' ? body.eventKey.trim() : ''
  if (!eventKey) return NextResponse.json({ error: 'Which event?' }, { status: 400 })

  const parsed = parseMissed(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const event = await loadEventByKey(supabase, eventKey)
    if (!event) return NextResponse.json({ error: 'No event data for that key.' }, { status: 404 })

    const objective = await loadObjective(supabase, ownerId, event.id)
    if (!objective) {
      return NextResponse.json(
        { error: 'Set your goals for this event first.', code: 'objective_required' },
        { status: 409 }
      )
    }

    const result = await recordMissedOpportunity(
      supabase,
      createServiceClient(),
      ownerId,
      objective.id,
      event.id,
      parsed.value
    )
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ missed: result.value })
  } catch (err) {
    return serverErrorResponse('event-intelligence/missed', err)
  }
}

export async function DELETE(request: Request) {
  const guard = await requireEventIntelligence()
  if (!guard.ok) return guard.response
  const { supabase, ownerId } = guard.context

  const params = new URL(request.url).searchParams
  const eventKey = params.get('eventKey')?.trim() ?? ''
  const presenceId = params.get('presenceId')?.trim() ?? ''
  if (!eventKey || !presenceId) return NextResponse.json({ error: 'Which company?' }, { status: 400 })

  try {
    const event = await loadEventByKey(supabase, eventKey)
    if (!event) return NextResponse.json({ error: 'No event data for that key.' }, { status: 404 })

    const objective = await loadObjective(supabase, ownerId, event.id)
    if (!objective) return NextResponse.json({ removed: true })

    await clearMissedOpportunity(createServiceClient(), ownerId, objective.id, presenceId)
    return NextResponse.json({ removed: true })
  } catch (err) {
    return serverErrorResponse('event-intelligence/missed', err)
  }
}
