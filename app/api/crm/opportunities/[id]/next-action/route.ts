import { NextRequest, NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/api/errors'
import { logActivity } from '@/lib/crm'
import { UUID_PATTERN } from '@/lib/opportunities/model'
import { findOpportunity, isMissingSchema, parseNextAction, setNextAction } from '@/lib/opportunities/store'
import { createRouteHandlerClient } from '@/lib/supabase-route'

/**
 * An opportunity's one next step: set it, mark it done, or clear it.
 *
 * This is the deal's own step, not a meeting follow-up — those are completed
 * through /api/follow-ups and are never touched here. Marking a step done does
 * not move the deal; the screen may suggest a stage, the owner decides.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createRouteHandlerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!UUID_PATTERN.test(params.id)) {
      return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 })
    }

    const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>
    const action = body.action
    if (action !== 'set' && action !== 'complete' && action !== 'clear') {
      return NextResponse.json({ error: 'Missing action.' }, { status: 400 })
    }

    const next = action === 'set' ? parseNextAction(body) : null
    if (action === 'set' && !next) {
      return NextResponse.json({ error: 'Write the next step first.' }, { status: 400 })
    }

    const existing = await findOpportunity(supabase, { userId: user.id, id: params.id })
    if (!existing.opportunity) {
      if (isMissingSchema(existing.error)) {
        return serverErrorResponse('crm/next-action', existing.error, 'Opportunities are not available yet. Try again later.', 503)
      }
      return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 })
    }

    const done = existing.opportunity.nextAction
    if (action === 'complete' && !done) {
      return NextResponse.json({ error: 'There is no next step to complete.' }, { status: 409 })
    }

    const saved = await setNextAction(supabase, { userId: user.id, id: params.id, nextAction: next })
    if (!saved.opportunity) {
      if (isMissingSchema(saved.error)) {
        return serverErrorResponse('crm/next-action', saved.error, 'Next steps are not available yet. Try again later.', 503)
      }
      return serverErrorResponse('crm/next-action', saved.error, 'Could not save the next step. Try again.')
    }

    if (action === 'complete' && done) {
      logActivity({
        contactId: existing.opportunity.contactId,
        userId: user.id,
        activityType: 'NEXT_ACTION_DONE',
        activityDetail: `Done: ${done.text}`,
        metadata: { opportunity_id: params.id, type: done.type, was_due: done.dueAt },
      }).catch((err) => console.error('[crm/next-action] log failed:', err))
    }

    return NextResponse.json({ success: true, opportunity: saved.opportunity })
  } catch (err) {
    return serverErrorResponse('crm/next-action', err, 'Could not save the next step. Try again.')
  }
}
