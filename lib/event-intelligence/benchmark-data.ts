import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerComponentClient } from '@/lib/supabase-server'
import {
  brainVersionOf,
  type FeedbackWrite,
  type MatchFeedback,
  type MissedOpportunity,
  type MissedWrite,
} from '@/lib/event-intelligence/benchmark'

/**
 * Reading and recording benchmark feedback.
 *
 * The seam future learning will be built on, and the shape it has to keep:
 * reads go through the owner's own client so RLS answers, and writes go through
 * the service role with the owner id taken from the session. Both halves filter
 * on `user_id` as well, because a guarantee should be legible in the file and
 * not only in the database.
 *
 * Nothing here writes to a company, a presence, a source record, a brain fact,
 * a match or an encounter. A judgment is recorded beside the thing it judges
 * and touches nothing else — that is the whole contract, and the suite fails if
 * a statement in this file ever names one of those tables.
 */

type Row = Record<string, unknown>
type Client = SupabaseClient | ReturnType<typeof createServerComponentClient>

const str = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || null
}

const FEEDBACK_COLUMNS =
  'id, user_id, match_id, objective_id, event_id, judgment, reason, note, match_type, match_score, engine_version, brain_version, created_at, updated_at'

const MISSED_COLUMNS = 'id, user_id, objective_id, event_id, presence_id, reason, note, created_at'

export function toFeedback(row: Row): MatchFeedback {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    matchId: String(row.match_id),
    objectiveId: String(row.objective_id),
    eventId: String(row.event_id),
    judgment: row.judgment as MatchFeedback['judgment'],
    reason: (str(row.reason) as MatchFeedback['reason']) ?? null,
    note: str(row.note),
    matchType: row.match_type as MatchFeedback['matchType'],
    matchScore: Number(row.match_score),
    engineVersion: String(row.engine_version),
    brainVersion: str(row.brain_version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function toMissedOpportunity(row: Row): MissedOpportunity {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    objectiveId: String(row.objective_id),
    eventId: String(row.event_id),
    presenceId: String(row.presence_id),
    reason: (str(row.reason) as MissedOpportunity['reason']) ?? null,
    note: str(row.note),
    createdAt: String(row.created_at),
  }
}

// ── Reading ──────────────────────────────────────────────────────

/** Every judgment this owner has made on one mission. */
export async function loadFeedbackForOwner(
  supabase: Client,
  ownerId: string,
  objectiveId: string
): Promise<MatchFeedback[]> {
  const { data, error } = await supabase
    .from('intel_match_feedback')
    .select(FEEDBACK_COLUMNS)
    .eq('user_id', ownerId)
    .eq('objective_id', objectiveId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })

  if (error) {
    console.error('[event-intelligence] feedback query failed:', error.code ?? 'unknown')
    return []
  }
  return ((data ?? []) as Row[]).map(toFeedback)
}

/** One judgment, for the screen that shows a single recommendation. */
export async function loadFeedbackForMatch(
  supabase: Client,
  ownerId: string,
  matchId: string
): Promise<MatchFeedback | null> {
  const { data, error } = await supabase
    .from('intel_match_feedback')
    .select(FEEDBACK_COLUMNS)
    .eq('user_id', ownerId)
    .eq('match_id', matchId)
    .maybeSingle()

  if (error || !data) return null
  return toFeedback(data as Row)
}

export async function loadMissedOpportunities(
  supabase: Client,
  ownerId: string,
  objectiveId: string
): Promise<MissedOpportunity[]> {
  const { data, error } = await supabase
    .from('intel_missed_opportunities')
    .select(MISSED_COLUMNS)
    .eq('user_id', ownerId)
    .eq('objective_id', objectiveId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })

  if (error) {
    console.error('[event-intelligence] missed-opportunity query failed:', error.code ?? 'unknown')
    return []
  }
  return ((data ?? []) as Row[]).map(toMissedOpportunity)
}

// ── Recording ────────────────────────────────────────────────────

export type RecordResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string }

/**
 * Record what the owner thought of one recommendation.
 *
 * The match is read through the owner's own client first, so a match belonging
 * to somebody else is not "forbidden" — it is not found, the same answer an id
 * that never existed gives. What ABC had concluded is then copied from that row
 * onto the judgment: the score, the direction and the engine version as they
 * were at this moment, never anything the request offered.
 *
 * Re-judging replaces the previous answer rather than adding a second one. An
 * owner who changes their mind has one opinion, not two.
 */
export async function recordRecommendationFeedback(
  supabase: Client,
  service: SupabaseClient,
  ownerId: string,
  write: FeedbackWrite
): Promise<RecordResult<MatchFeedback>> {
  const { data: match, error: matchError } = await supabase
    .from('intel_matches')
    .select('id, objective_id, presence_id, match_type, score, engine_version')
    .eq('user_id', ownerId)
    .eq('id', write.matchId)
    .maybeSingle()

  if (matchError) throw matchError
  if (!match) return { ok: false, status: 404, error: 'No such recommendation.' }

  const row = match as Row
  const { data: presence, error: presenceError } = await supabase
    .from('intel_company_presences')
    .select('event_id')
    .eq('id', String(row.presence_id))
    .maybeSingle()

  if (presenceError) throw presenceError
  if (!presence) return { ok: false, status: 404, error: 'No such recommendation.' }

  const engineVersion = String(row.engine_version)
  const { data, error } = await service
    .from('intel_match_feedback')
    .upsert(
      {
        user_id: ownerId,
        match_id: write.matchId,
        objective_id: String(row.objective_id),
        event_id: String((presence as Row).event_id),
        judgment: write.judgment,
        reason: write.reason,
        note: write.note,
        match_type: String(row.match_type),
        match_score: Number(row.score),
        engine_version: engineVersion,
        brain_version: brainVersionOf(engineVersion),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,match_id' }
    )
    .select(FEEDBACK_COLUMNS)
    .maybeSingle()

  if (error) throw error
  return { ok: true, value: toFeedback((data ?? {}) as Row) }
}

/** Take a judgment back. The recommendation returns to unreviewed, not to negative. */
export async function clearRecommendationFeedback(
  service: SupabaseClient,
  ownerId: string,
  matchId: string
): Promise<void> {
  const { error } = await service
    .from('intel_match_feedback')
    .delete()
    .eq('user_id', ownerId)
    .eq('match_id', matchId)
  if (error) throw error
}

/**
 * Flag a company ABC should have suggested, and did not.
 *
 * The half of the benchmark that grading recommendations cannot reach. The
 * company is read through the owner's client — the exhibitor graph is shared
 * and readable — and its edition comes from that row, so a flag cannot be filed
 * against a different year than the stand it names. The composite foreign key
 * then makes the database check the same pairing.
 */
export async function recordMissedOpportunity(
  supabase: Client,
  service: SupabaseClient,
  ownerId: string,
  objectiveId: string,
  eventId: string,
  write: MissedWrite
): Promise<RecordResult<MissedOpportunity>> {
  const { data: presence, error: presenceError } = await supabase
    .from('intel_company_presences')
    .select('id, event_id')
    .eq('id', write.presenceId)
    .eq('event_id', eventId)
    .maybeSingle()

  if (presenceError) throw presenceError
  if (!presence) return { ok: false, status: 404, error: 'That company is not exhibiting at this event.' }

  const { data, error } = await service
    .from('intel_missed_opportunities')
    .upsert(
      {
        user_id: ownerId,
        objective_id: objectiveId,
        event_id: eventId,
        presence_id: write.presenceId,
        reason: write.reason,
        note: write.note,
      },
      { onConflict: 'user_id,objective_id,presence_id' }
    )
    .select(MISSED_COLUMNS)
    .maybeSingle()

  if (error) throw error
  return { ok: true, value: toMissedOpportunity((data ?? {}) as Row) }
}

export async function clearMissedOpportunity(
  service: SupabaseClient,
  ownerId: string,
  objectiveId: string,
  presenceId: string
): Promise<void> {
  const { error } = await service
    .from('intel_missed_opportunities')
    .delete()
    .eq('user_id', ownerId)
    .eq('objective_id', objectiveId)
    .eq('presence_id', presenceId)
  if (error) throw error
}
