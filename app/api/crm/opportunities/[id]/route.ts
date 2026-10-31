import { NextRequest, NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/api/errors'
import { logActivity } from '@/lib/crm'
import { STAGE_LABEL, UUID_PATTERN, isStage } from '@/lib/opportunities/model'
import { findOpportunity, isMissingSchema, parsePatch, updateOpportunity } from '@/lib/opportunities/store'
import { createRouteHandlerClient } from '@/lib/supabase-route'

/**
 * Edit an opportunity: its stage, value, name or note.
 *
 * Stages move here and nowhere else — only because the owner asked. Won and
 * Lost are stages like the others, so a closed deal can be reopened.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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
    const { patch, invalid } = parsePatch(body, isStage)
    if (invalid) {
      return NextResponse.json({ error: `That ${invalid} is not valid.` }, { status: 400 })
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 })
    }

    const existing = await findOpportunity(supabase, { userId: user.id, id: params.id })
    if (!existing.opportunity) {
      if (isMissingSchema(existing.error)) {
        return serverErrorResponse('crm/opportunity', existing.error, 'Opportunities are not available yet. Try again later.', 503)
      }
      return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 })
    }

    const updated = await updateOpportunity(supabase, { userId: user.id, id: params.id, patch })
    if (!updated.opportunity) {
      return serverErrorResponse('crm/opportunity', updated.error, 'Could not update this opportunity. Try again.')
    }

    const from = existing.opportunity.stage
    if (patch.stage && patch.stage !== from) {
      logActivity({
        contactId: existing.opportunity.contactId,
        userId: user.id,
        activityType: 'STAGE_CHANGED',
        activityDetail: `Opportunity moved to ${STAGE_LABEL[patch.stage]}`,
        metadata: { opportunity_id: params.id, from, to: patch.stage },
      }).catch((err) => console.error('[crm/opportunity] log failed:', err))
    }

    return NextResponse.json({ success: true, opportunity: updated.opportunity })
  } catch (err) {
    return serverErrorResponse('crm/opportunity', err, 'Could not update this opportunity. Try again.')
  }
}
