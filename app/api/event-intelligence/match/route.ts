import { NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/api/errors'
import { createServiceClient } from '@/lib/supabase/service'
import {
  loadEventByKey,
  loadEventGraph,
  loadIntentProfile,
  loadObjective,
} from '@/lib/event-intelligence/data'
import { readJson, requireEventIntelligence } from '@/lib/event-intelligence/route-guard'
import { ENGINE_VERSION, matchEvent } from '@/lib/event-intelligence/scoring'

/**
 * Run matching for one fair.
 *
 * Reads with the owner's own client, so RLS is doing its job on the way in.
 * Writes with the service role, because `intel_matches` grants `authenticated`
 * nothing but SELECT — a score is a conclusion ABC reached, and a client that
 * could write one could award itself a 100. Every written row is stamped with
 * the owner id from the session.
 */
export async function POST(request: Request) {
  const guard = await requireEventIntelligence()
  if (!guard.ok) return guard.response
  const { supabase, ownerId } = guard.context

  const body = await readJson(request)
  const eventKey = typeof body?.eventKey === 'string' ? body.eventKey.trim() : ''
  if (!eventKey) return NextResponse.json({ error: 'Which event?' }, { status: 400 })

  try {
    const event = await loadEventByKey(supabase, eventKey)
    if (!event) return NextResponse.json({ error: 'No event data for that key.' }, { status: 404 })

    const profile = await loadIntentProfile(supabase, ownerId)
    if (!profile) {
      return NextResponse.json(
        { error: 'Tell ABC what your company does first.', code: 'profile_required' },
        { status: 409 }
      )
    }

    const objective = await loadObjective(supabase, ownerId, event.id)
    if (!objective) {
      return NextResponse.json(
        { error: 'Set your goals for this event first.', code: 'objective_required' },
        { status: 409 }
      )
    }

    const { presences, companies } = await loadEventGraph(supabase, event.id)
    if (presences.length === 0) {
      return NextResponse.json(
        { error: 'ABC has no exhibitor list for this event yet.', code: 'no_exhibitors' },
        { status: 409 }
      )
    }

    const results = matchEvent(profile, objective, presences, companies)

    const service = createServiceClient()

    if (results.length > 0) {
      const { error } = await service.from('intel_matches').upsert(
        results.map((result) => ({
          user_id: ownerId,
          objective_id: objective.id,
          presence_id: result.presenceId,
          match_type: result.matchType,
          score: result.score,
          engine_version: ENGINE_VERSION,
          reasons: result.reasons,
          evidence: result.evidence,
          warnings: result.warnings,
          matched_at: new Date().toISOString(),
        })),
        { onConflict: 'objective_id,presence_id,match_type' }
      )
      if (error) throw error
    }

    /*
      Clearing out matches this run no longer produces — carefully.

      A meeting target points at a match and cascades from it, so deleting a
      stale match would take the owner's saved target, its priority and its
      private note with it. A refreshed exhibitor listing must never be able to
      delete somebody's notes. So only matches nobody saved are removed; a match
      that has been acted on stays, and the screen shows it with whatever the
      listing now says about that company.
    */
    const keep = new Set(results.map((result) => `${result.presenceId}:${result.matchType}`))

    const { data: existing, error: existingError } = await service
      .from('intel_matches')
      .select('id, presence_id, match_type')
      .eq('user_id', ownerId)
      .eq('objective_id', objective.id)

    if (existingError) throw existingError

    const stale = ((existing ?? []) as Record<string, unknown>[])
      .filter((row) => !keep.has(`${String(row.presence_id)}:${String(row.match_type)}`))
      .map((row) => String(row.id))

    let removed = 0
    if (stale.length > 0) {
      const { data: saved, error: savedError } = await service
        .from('intel_meeting_targets')
        .select('match_id')
        .eq('user_id', ownerId)
        .in('match_id', stale)

      if (savedError) throw savedError

      const protectedIds = new Set(
        ((saved ?? []) as Record<string, unknown>[]).map((row) => String(row.match_id))
      )
      const deletable = stale.filter((id) => !protectedIds.has(id))

      if (deletable.length > 0) {
        const { error: deleteError } = await service
          .from('intel_matches')
          .delete()
          .eq('user_id', ownerId)
          .in('id', deletable)

        if (deleteError) throw deleteError
        removed = deletable.length
      }
    }

    return NextResponse.json({
      matched: results.length,
      removed,
      engineVersion: ENGINE_VERSION,
    })
  } catch (err) {
    return serverErrorResponse('event-intelligence/match', err)
  }
}
