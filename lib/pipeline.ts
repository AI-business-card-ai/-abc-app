export type PipelineStageId = 'new' | 'follow-up' | 'meeting' | 'deal' | 'won' | 'lost'

/**
 * How far along a stage is, said in colour.
 *
 * The ladder used to be five unrelated hues — violet, sky, yellow, orange,
 * green — which told you the stages were different but not which came first,
 * and violet and sky are not colours ABC uses anywhere else. This is a
 * progression instead: cool graphite warms through neutral into muted gold and
 * then full gold as a contact moves toward a deal. Warmth and intensity carry
 * the order, so the ladder reads as a ladder.
 *
 * The last two are the exception, and deliberately: WON and LOST are outcomes,
 * not steps, and green and red are what those already mean everywhere else in
 * the app. They are semantic, not decorative.
 *
 * Written once here because the board carried a second copy of this list with
 * different colours in it, and two lists of the same five stages had already
 * drifted apart.
 */
export const STAGE_TONES: Record<PipelineStageId, { color: string; border: string; bg: string }> = {
  new: { color: '#8b8b93', border: 'rgba(139, 139, 147, 0.28)', bg: 'rgba(139, 139, 147, 0.06)' },
  'follow-up': { color: '#a8a29a', border: 'rgba(168, 162, 154, 0.30)', bg: 'rgba(168, 162, 154, 0.07)' },
  meeting: { color: '#c9a668', border: 'rgba(201, 166, 104, 0.32)', bg: 'rgba(201, 166, 104, 0.08)' },
  deal: { color: '#e9a62f', border: 'rgba(233, 166, 47, 0.38)', bg: 'rgba(233, 166, 47, 0.10)' },
  won: { color: '#4ade80', border: 'rgba(74, 222, 128, 0.35)', bg: 'rgba(74, 222, 128, 0.09)' },
  lost: { color: '#ef4444', border: 'rgba(239, 68, 68, 0.32)', bg: 'rgba(239, 68, 68, 0.08)' },
}

export const PIPELINE_STAGES: {
  id: PipelineStageId
  label: string
  color: string
  border: string
  bg: string
}[] = [
  { id: 'new', label: 'NEW', ...STAGE_TONES.new },
  { id: 'follow-up', label: 'FOLLOW-UP', ...STAGE_TONES['follow-up'] },
  { id: 'meeting', label: 'MEETING', ...STAGE_TONES.meeting },
  { id: 'deal', label: 'DEAL', ...STAGE_TONES.deal },
  { id: 'won', label: 'WON ✓', ...STAGE_TONES.won },
  { id: 'lost', label: 'LOST', ...STAGE_TONES.lost },
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
