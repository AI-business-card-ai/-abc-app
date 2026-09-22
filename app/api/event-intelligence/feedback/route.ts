import { NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/api/errors'
import { createServiceClient } from '@/lib/supabase/service'
import { parseFeedback } from '@/lib/event-intelligence/benchmark'
import {
  clearRecommendationFeedback,
  recordRecommendationFeedback,
} from '@/lib/event-intelligence/benchmark-data'
import { readJson, requireEventIntelligence } from '@/lib/event-intelligence/route-guard'

/**
 * What the owner thought of one recommendation.
 *
 * Three answers, an optional reason when the answer is "not relevant", and
 * nothing else. The route records an opinion and does nothing with it: it
 * writes no target, no contact, no encounter and no CRM state, and it does not
 * touch the match, the company, the listing or the Product Brain. Asking
 * whether ABC was right is not an instruction to act on the answer.
 *
 * The write goes through the service role, like the match that is being judged:
 * the row carries ABC's record of what it had recommended — the score, the
 * direction, the engine version — and a client able to insert one could file a
 * judgment against a score ABC never gave. The owner id comes from the session.
 */
export async function POST(request: Request) {
  const guard = await requireEventIntelligence()
  if (!guard.ok) return guard.response
  const { supabase, ownerId } = guard.context

  const body = await readJson(request)
  if (!body) return NextResponse.json({ error: 'Nothing to record.' }, { status: 400 })

  const parsed = parseFeedback(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const result = await recordRecommendationFeedback(supabase, createServiceClient(), ownerId, parsed.value)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ feedback: result.value })
  } catch (err) {
    return serverErrorResponse('event-intelligence/feedback', err)
  }
}

/** Take a judgment back. The recommendation becomes unreviewed again, not negative. */
export async function DELETE(request: Request) {
  const guard = await requireEventIntelligence()
  if (!guard.ok) return guard.response
  const { ownerId } = guard.context

  const matchId = new URL(request.url).searchParams.get('matchId')?.trim() ?? ''
  if (!matchId) return NextResponse.json({ error: 'Which recommendation?' }, { status: 400 })

  try {
    await clearRecommendationFeedback(createServiceClient(), ownerId, matchId)
    return NextResponse.json({ removed: true })
  } catch (err) {
    return serverErrorResponse('event-intelligence/feedback', err)
  }
}
