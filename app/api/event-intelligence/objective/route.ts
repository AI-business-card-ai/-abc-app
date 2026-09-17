import { NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/api/errors'
import { loadEventByKey, loadIntentProfile, loadObjective } from '@/lib/event-intelligence/data'
import { parseEventObjective } from '@/lib/event-intelligence/intent'
import { readJson, requireEventIntelligence } from '@/lib/event-intelligence/route-guard'

/**
 * What the owner wants from one fair.
 *
 * The event is named by its key rather than its id, because the key is the
 * address the whole feature uses and resolving it here means the client never
 * handles a database id it could get wrong. An unknown key is a 404: the fair
 * has no directory data, which is a different thing from the objective being
 * rejected.
 */
export async function POST(request: Request) {
  const guard = await requireEventIntelligence()
  if (!guard.ok) return guard.response
  const { supabase, ownerId } = guard.context

  const body = await readJson(request)
  if (!body) return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })

  const eventKey = typeof body.eventKey === 'string' ? body.eventKey.trim() : ''
  if (!eventKey) return NextResponse.json({ error: 'Which event?' }, { status: 400 })

  const parsed = parseEventObjective(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const value = parsed.value

  try {
    const event = await loadEventByKey(supabase, eventKey)
    if (!event) return NextResponse.json({ error: 'No event data for that key.' }, { status: 404 })

    /*
      An objective belongs to a profile, and the composite foreign key insists
      the two share an owner. Rather than let the database refuse the write with
      a constraint error nobody can act on, say the useful thing: the owner has
      not told ABC what their company does yet, and that is the first screen.
    */
    const profile = await loadIntentProfile(supabase, ownerId)
    if (!profile) {
      return NextResponse.json(
        { error: 'Tell ABC what your company does first.', code: 'profile_required' },
        { status: 409 }
      )
    }

    const { error } = await supabase.from('intel_event_objectives').upsert(
      {
        user_id: ownerId,
        event_id: event.id,
        profile_id: profile.id,
        goals: value.goals,
        sell_focus: value.sellFocus,
        buy_focus: value.buyFocus,
        partner_focus: value.partnerFocus,
        priority_industries: value.priorityIndustries,
        priority_geographies: value.priorityGeographies,
        notes: value.notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,event_id' }
    )

    if (error) throw error

    const objective = await loadObjective(supabase, ownerId, event.id)
    return NextResponse.json({ objective })
  } catch (err) {
    return serverErrorResponse('event-intelligence/objective', err)
  }
}
