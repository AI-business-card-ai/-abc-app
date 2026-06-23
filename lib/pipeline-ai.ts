import type { CrmStatus, ScannedContact } from '@/lib/types'

export type ScoreTier = 'cold' | 'warm' | 'hot'
export type ActionColor = 'red' | 'blue' | 'gray' | 'orange'
export type FilterTab = 'all' | 'hot' | 'action' | 'week' | 'closed'

export type AiNextStep = {
  text: string
  action: string
  color: ActionColor
  urgent: boolean
}

export type DashboardMetrics = {
  total: number
  hotLeads: number
  needFollowUp: number
  avgScore: number
  pipelineValue: number
}

const STATUS_COLORS: Record<CrmStatus, string> = {
  NEW: '#00d4d4',
  ENRICHED: '#a78bfa',
  CONTACTED: '#f0197d',
  IN_CONVERSATION: '#8b5cf6',
  CLOSED: '#22c55e',
}

export function getStatusColor(status: CrmStatus | null | undefined) {
  return STATUS_COLORS[status || 'NEW'] || '#A78BFA'
}

export function getScoreTier(score: number): { tier: ScoreTier; label: string; bg: string; className: string } {
  if (score >= 70) return { tier: 'hot', label: 'Hot', bg: 'linear-gradient(135deg, #f0197d, #ef4444)', className: 'score-badge-hot' }
  if (score >= 41) return { tier: 'warm', label: 'Warm', bg: 'linear-gradient(135deg, #f59e0b, #d97706)', className: 'score-badge-warm' }
  return { tier: 'cold', label: 'Cold', bg: '#4a5168', className: 'score-badge-cold' }
}

export function daysSinceActivity(contact: ScannedContact): number {
  const ref = contact.last_activity_at || contact.scanned_at || contact.created_at
  if (!ref) return 0
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(ref).getTime()) / 86400000)
  )
}

export function getAiNextStep(contact: ScannedContact): AiNextStep {
  const daysSince = contact.last_activity_at
    ? Math.floor((Date.now() - new Date(contact.last_activity_at).getTime()) / 86400000)
    : Math.floor(
        (Date.now() - new Date(contact.created_at || contact.scanned_at).getTime()) / 86400000
      )

  const score = contact.ai_lead_score ?? contact.match_score ?? 0
  const status = (contact.crm_status as CrmStatus) || 'NEW'

  if (status === 'CLOSED') {
    return { text: 'Deal closed', action: 'View Details', color: 'gray', urgent: false }
  }
  if (status === 'IN_CONVERSATION' && daysSince > 2) {
    return {
      text: `No response in ${daysSince} days — follow up now`,
      action: 'Send Follow-up',
      color: 'red',
      urgent: true,
    }
  }
  if (status === 'IN_CONVERSATION') {
    return {
      text: 'Conversation active — keep momentum',
      action: 'Send Update',
      color: 'blue',
      urgent: false,
    }
  }
  if (status === 'CONTACTED' && daysSince > 3) {
    return {
      text: `Contacted ${daysSince} days ago — schedule meeting`,
      action: 'Schedule Meeting',
      color: 'orange',
      urgent: true,
    }
  }
  if (status === 'CONTACTED') {
    return {
      text: 'Recently contacted — wait for response',
      action: 'View Details',
      color: 'gray',
      urgent: false,
    }
  }
  if (status === 'ENRICHED' && score >= 70) {
    return {
      text: 'Hot lead — AI research done, contact now',
      action: 'Send First Message',
      color: 'red',
      urgent: true,
    }
  }
  if (status === 'ENRICHED') {
    return {
      text: 'AI research complete — ready to contact',
      action: 'Send First Message',
      color: 'blue',
      urgent: false,
    }
  }
  if (daysSince > 7) {
    return {
      text: `${daysSince} days since scan — don't let this go cold`,
      action: 'Re-engage',
      color: 'orange',
      urgent: true,
    }
  }
  return {
    text: 'New contact — analyze and reach out',
    action: 'Get Started',
    color: 'blue',
    urgent: false,
  }
}

export function computeDashboardMetrics(contacts: ScannedContact[]): DashboardMetrics {
  const total = contacts.length
  let hotLeads = 0
  let needFollowUp = 0
  let scoreSum = 0
  let pipelineValue = 0

  for (const c of contacts) {
    const score = c.ai_lead_score ?? c.match_score ?? 0
    if (score >= 70) hotLeads += 1
    scoreSum += score
    pipelineValue += Number(c.deal_value) || 0

    const days = daysSinceActivity(c)
    const status = c.crm_status || 'NEW'
    if (status !== 'CLOSED' && days >= 3) needFollowUp += 1
  }

  return {
    total,
    hotLeads,
    needFollowUp,
    avgScore: total > 0 ? Math.round(scoreSum / total) : 0,
    pipelineValue,
  }
}

export function filterContacts(
  contacts: ScannedContact[],
  tab: FilterTab
): ScannedContact[] {
  const now = Date.now()
  const weekAgo = now - 7 * 86400000

  return contacts.filter((c) => {
    const score = c.ai_lead_score ?? c.match_score ?? 0
    const step = getAiNextStep(c)
    const scannedAt = new Date(c.scanned_at || c.created_at).getTime()

    switch (tab) {
      case 'hot':
        return score >= 70
      case 'action':
        return step.urgent
      case 'week':
        return scannedAt >= weekAgo
      case 'closed':
        return c.crm_status === 'CLOSED'
      default:
        return true
    }
  })
}

export function sortContacts(contacts: ScannedContact[]): ScannedContact[] {
  return [...contacts].sort((a, b) => {
    const stepA = getAiNextStep(a)
    const stepB = getAiNextStep(b)
    if (stepA.urgent !== stepB.urgent) return stepA.urgent ? -1 : 1
    const scoreA = a.ai_lead_score ?? a.match_score ?? 0
    const scoreB = b.ai_lead_score ?? b.match_score ?? 0
    return scoreB - scoreA
  })
}

export function actionButtonStyle(
  color: ActionColor,
  urgent: boolean
): { background: string; color: string } {
  if (urgent || color === 'red') return { background: 'linear-gradient(135deg, #f0197d, #ef4444)', color: '#fff' }
  if (color === 'orange') return { background: 'linear-gradient(135deg, #f0197d, #8b5cf6)', color: '#fff' }
  if (color === 'blue') return { background: 'linear-gradient(135deg, #00d4d4, #8b5cf6)', color: '#fff' }
  return { background: '#4a5168', color: '#f0f0ff' }
}

export function formatPipelineValue(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${Math.round(value)}`
}
