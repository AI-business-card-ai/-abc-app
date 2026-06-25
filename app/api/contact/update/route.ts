import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { logActivity } from '@/lib/crm'
import type { PipelineStageId } from '@/lib/types'

type UpdateBody = {
  contactId?: string
  pipeline_stage?: PipelineStageId
  deal_value?: number
  deal_currency?: string
  expected_close_date?: string | null
  tags?: string[]
  response_received?: boolean
  pipeline_notes?: string
  lead_status?: string
  rating?: string
  opportunity_stage?: string
  close_probability?: number
  next_step?: string
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

    const body = (await req.json()) as UpdateBody
    const { contactId } = body

    if (!contactId) {
      return NextResponse.json({ error: 'Missing contactId' }, { status: 400 })
    }

    const { data: existing, error: fetchError } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('id', contactId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const update: Record<string, unknown> = {}

    if (body.pipeline_stage !== undefined) update.pipeline_stage = body.pipeline_stage
    if (body.deal_value !== undefined) update.deal_value = body.deal_value
    if (body.deal_currency !== undefined) update.deal_currency = body.deal_currency
    if (body.expected_close_date !== undefined) update.expected_close_date = body.expected_close_date || null
    if (body.tags !== undefined) update.tags = body.tags
    if (body.pipeline_notes !== undefined) update.pipeline_notes = body.pipeline_notes
    if (body.lead_status !== undefined) update.lead_status = body.lead_status
    if (body.rating !== undefined) update.rating = body.rating
    if (body.opportunity_stage !== undefined) update.opportunity_stage = body.opportunity_stage
    if (body.close_probability !== undefined) update.close_probability = body.close_probability
    if (body.next_step !== undefined) update.next_step = body.next_step

    if (body.response_received !== undefined) {
      update.response_received = body.response_received
      if (body.response_received) {
        update.response_date = new Date().toISOString()
        update.crm_status = 'IN_CONVERSATION'
      } else {
        update.response_date = null
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('scanned_contacts')
      .update(update)
      .eq('id', contactId)
      .eq('user_id', user.id)
      .select('*')
      .single()

    if (updateError) throw updateError

    if (
      body.pipeline_stage !== undefined &&
      body.pipeline_stage !== existing.pipeline_stage
    ) {
      await logActivity({
        contactId,
        userId: user.id,
        activityType: 'STAGE_CHANGED',
        activityDetail: `Pipeline stage: ${existing.pipeline_stage || 'new'} → ${body.pipeline_stage}`,
        metadata: { from: existing.pipeline_stage, to: body.pipeline_stage },
      })
    }

    if (body.response_received === true && !existing.response_received) {
      await logActivity({
        contactId,
        userId: user.id,
        activityType: 'RESPONSE_RECEIVED',
        activityDetail: `Response received from ${existing.name || 'contact'}`,
        metadata: { response_date: update.response_date },
      })
    }

    if (body.pipeline_notes !== undefined && body.pipeline_notes !== existing.pipeline_notes) {
      await logActivity({
        contactId,
        userId: user.id,
        activityType: 'NOTE_ADDED',
        activityDetail: body.pipeline_notes.slice(0, 200),
      })
    }

    return NextResponse.json({ success: true, contact: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
