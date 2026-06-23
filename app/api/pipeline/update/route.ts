import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServerSupabase } from '@/lib/supabase'
import { PIPELINE_STAGE_IDS } from '@/lib/pipeline'
import { logActivity } from '@/lib/crm'
import type { PipelineStageId } from '@/lib/pipeline'

export async function POST(req: NextRequest) {
  try {
    const authClient = createRouteHandlerClient()
    const { data: { user } } = await authClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { contactId, stage } = (await req.json()) as {
      contactId?: string
      stage?: PipelineStageId
    }

    if (!contactId || !stage) {
      return NextResponse.json({ error: 'Missing contactId or stage' }, { status: 400 })
    }

    if (!PIPELINE_STAGE_IDS.includes(stage)) {
      return NextResponse.json({ error: 'Invalid stage' }, { status: 400 })
    }

    const supabase = createServerSupabase()

    const { data: existing } = await supabase
      .from('scanned_contacts')
      .select('pipeline_stage')
      .eq('id', contactId)
      .eq('user_id', user.id)
      .single()

    const { error } = await supabase
      .from('scanned_contacts')
      .update({ pipeline_stage: stage })
      .eq('id', contactId)
      .eq('user_id', user.id)

    if (error) throw error

    logActivity({
      contactId,
      userId: user.id,
      activityType: 'STAGE_CHANGED',
      activityDetail: `Pipeline stage changed to ${stage}`,
      metadata: { from: existing?.pipeline_stage, to: stage },
    }).catch(console.error)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
