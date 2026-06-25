import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { getAiNextStep } from '@/lib/pipeline-ai'
import type { ScannedContact } from '@/lib/types'

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

function buildFallbackInsights(contacts: ScannedContact[]) {
  const insights: string[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const overdue = contacts.filter((c) => {
    if (!c.next_action_date) return false
    return new Date(c.next_action_date) <= today
  })

  if (overdue.length > 0) {
    const names = overdue.slice(0, 2).map((c) => c.name || 'Contact').join(', ')
    insights.push(`⚠️ ${overdue.length} contact${overdue.length === 1 ? '' : 's'} need follow-up today — start with ${names}.`)
  }

  const hot = contacts
    .filter((c) => (c.ai_lead_score ?? c.match_score ?? 0) >= 70 && c.pipeline_stage !== 'won')
    .slice(0, 1)

  if (hot[0]) {
    insights.push(`🔥 ${hot[0].name} has a high score (${hot[0].ai_lead_score ?? hot[0].match_score}). ${getAiNextStep(hot[0]).text}`)
  }

  const stale = contacts.filter((c) => {
    if (!c.last_contacted_date && !c.last_message_date) return false
    const last = new Date(c.last_contacted_date || c.last_message_date || 0)
    const days = Math.floor((Date.now() - last.getTime()) / 86400000)
    return days >= 3 && c.pipeline_stage === 'follow-up'
  })

  if (stale[0]) {
    insights.push(`💡 ${stale[0].name} hasn't responded in 3+ days. Best time to follow up: Tuesday morning.`)
  }

  if (insights.length === 0) {
    insights.push('💡 Scan more cards at your next event to grow your pipeline.')
    insights.push('⚡ Review hot leads and send first messages today.')
    insights.push('📅 Schedule meetings for contacts who replied recently.')
  }

  return insights.slice(0, 3)
}

export async function GET(_req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: contacts, error } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('user_id', user.id)
      .neq('pipeline_stage', 'lost')
      .order('last_activity_at', { ascending: false })
      .limit(50)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = (contacts || []) as ScannedContact[]

    if (!anthropic) {
      return NextResponse.json({ insights: buildFallbackInsights(rows), source: 'rules' })
    }

    const summary = rows.slice(0, 25).map((c) => ({
      name: c.name,
      company: c.company,
      stage: c.pipeline_stage,
      score: c.ai_lead_score ?? c.match_score,
      crm_status: c.crm_status,
      last_activity: c.last_activity_at,
      next_action: c.next_action,
      next_action_date: c.next_action_date,
      deal_value: c.deal_value,
    }))

    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `Analyze this sales pipeline and provide exactly 3 short actionable insights (one line each, start with emoji).
Focus on: who to contact today, who is at risk, biggest opportunities.
Contacts: ${JSON.stringify(summary)}`,
        },
      ],
    })

    const text =
      response.content[0]?.type === 'text'
        ? response.content[0].text
        : ''

    const insights = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 3)

    return NextResponse.json({
      insights: insights.length ? insights : buildFallbackInsights(rows),
      source: 'ai',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Insights failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const maxDuration = 30
