export type PipelineStageId = 'new' | 'follow-up' | 'meeting' | 'deal' | 'won' | 'lost'

export const PIPELINE_STAGES: {
  id: PipelineStageId
  label: string
  color: string
  border: string
  bg: string
}[] = [
  { id: 'new', label: 'NEW', color: '#A78BFA', border: '#7C3AED66', bg: '#1A0A2E' },
  { id: 'follow-up', label: 'FOLLOW-UP', color: '#38BDF8', border: '#0EA5E966', bg: '#0A1A2E' },
  { id: 'meeting', label: 'MEETING', color: '#FACC15', border: '#EAB30866', bg: '#1A180A' },
  { id: 'deal', label: 'DEAL', color: '#FB923C', border: '#F9731666', bg: '#1A100A' },
  { id: 'won', label: 'WON ✓', color: '#22C55E', border: '#16A34A66', bg: '#0A1A0E' },
  { id: 'lost', label: 'LOST', color: '#EF4444', border: '#DC262666', bg: '#1A0A0A' },
]

export const PIPELINE_STAGE_IDS = PIPELINE_STAGES.map((s) => s.id)

export function getStageMeta(stage: string | null | undefined) {
  return PIPELINE_STAGES.find((s) => s.id === stage) ?? PIPELINE_STAGES[0]
}

export function daysSinceScan(scannedAt: string | null | undefined): number {
  if (!scannedAt) return 0
  const diff = Date.now() - new Date(scannedAt).getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

export function isActionOverdue(nextActionDate: string | null | undefined): boolean {
  if (!nextActionDate) return false
  const due = new Date(nextActionDate)
  due.setHours(23, 59, 59, 999)
  return due.getTime() < Date.now()
}
