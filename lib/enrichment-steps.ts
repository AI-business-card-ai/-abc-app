export type EnrichmentStatus = 'PENDING' | 'ENRICHING' | 'DONE' | 'ERROR'

export type EnrichmentStepId =
  | 'queued'
  | 'apollo'
  | 'perplexity'
  | 'linkedin'
  | 'messages'
  | 'syncing'
  | 'done'

export const ENRICHMENT_STEP_PROGRESS: Record<EnrichmentStepId, number> = {
  queued: 10,
  apollo: 25,
  perplexity: 45,
  linkedin: 65,
  messages: 85,
  syncing: 95,
  done: 100,
}

export const ENRICHMENT_STEP_LABELS: Record<EnrichmentStepId, string> = {
  queued: 'Queued for enrichment…',
  apollo: 'Finding profile data…',
  perplexity: 'Researching company…',
  linkedin: 'LinkedIn intelligence…',
  messages: 'Generating AI messages…',
  syncing: 'Syncing CRM…',
  done: 'Complete',
}

export function getEnrichmentProgress(step: string | null | undefined): number {
  if (!step) return 10
  return ENRICHMENT_STEP_PROGRESS[step as EnrichmentStepId] ?? 15
}

export function getEnrichmentStepLabel(step: string | null | undefined): string {
  if (!step) return 'Starting enrichment…'
  return ENRICHMENT_STEP_LABELS[step as EnrichmentStepId] ?? 'Enriching contact…'
}
