import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'
import {
  onPipelineStageChange,
  onReplyReceived,
  type PipelineStage,
} from '@/lib/crm-engine'
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

    const service = createServiceClient()

    if (body.pipeline_stage !== undefined && body.pipeline_stage !== existing.pipeline_stage) {
      await onPipelineStageChange(
        contactId,
        user.id,
        (existing.pipeline_stage || 'new') as PipelineStage,
        body.pipeline_stage as PipelineStage,
        {
          notes: body.pipeline_notes,
          dealValue: body.deal_value,
        }
      )
    }

    if (body.response_received === true && !existing.response_received) {
      await onReplyReceived(contactId, user.id)
    } else if (body.response_received === false && existing.response_received) {
      await service
        .from('scanned_contacts')
        .update({
          response_received: false,
          reply_received: false,
          response_date: null,
          reply_date: null,
        })
        .eq('id', contactId)
        .eq('user_id', user.id)
    }

    const update: Record<string, unknown> = {}

    if (body.deal_value !== undefined) update.deal_value = body.deal_value
    if (body.deal_currency !== undefined) update.deal_currency = body.deal_currency
    if (body.expected_close_date !== undefined) update.expected_close_date = body.expected_close_date || null
    if (body.tags !== undefined) update.tags = body.tags
    if (body.pipeline_notes !== undefined && body.pipeline_stage === undefined) {
      update.pipeline_notes = body.pipeline_notes
    }
    if (body.lead_status !== undefined) update.lead_status = body.lead_status
    if (body.rating !== undefined) update.rating = body.rating
    if (body.opportunity_stage !== undefined) update.opportunity_stage = body.opportunity_stage
    if (body.close_probability !== undefined) update.close_probability = body.close_probability
    if (body.next_step !== undefined) update.next_step = body.next_step

    if (Object.keys(update).length > 0) {
      await service.from('scanned_contacts').update(update).eq('id', contactId).eq('user_id', user.id)
    }

    const { data: updated, error: updateError } = await service
      .from('scanned_contacts')
      .select('*')
      .eq('id', contactId)
      .eq('user_id', user.id)
      .single()

    if (updateError || !updated) throw updateError || new Error('Update failed')

    return NextResponse.json({ success: true, contact: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
