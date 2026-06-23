import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import type { CrmStatus } from '@/lib/crm'

export async function GET() {
  const supabase = createRouteHandlerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: contacts, error } = await supabase
    .from('scanned_contacts')
    .select('crm_status, ai_lead_score, scanned_at, created_at')
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = contacts ?? []
  const byStatus: Record<CrmStatus, number> = {
    NEW: 0,
    ENRICHED: 0,
    CONTACTED: 0,
    IN_CONVERSATION: 0,
    CLOSED: 0,
  }

  let scoreSum = 0
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  let thisWeek = 0

  for (const c of rows) {
    const status = (c.crm_status as CrmStatus) || 'NEW'
    if (status in byStatus) byStatus[status] += 1
    scoreSum += c.ai_lead_score ?? 0
    const scannedAt = new Date(c.scanned_at || c.created_at).getTime()
    if (scannedAt >= weekAgo) thisWeek += 1
  }

  const total = rows.length
  const avgLeadScore = total > 0 ? Math.round(scoreSum / total) : 0

  return NextResponse.json({
    total,
    byStatus,
    avgLeadScore,
    thisWeek,
  })
}
