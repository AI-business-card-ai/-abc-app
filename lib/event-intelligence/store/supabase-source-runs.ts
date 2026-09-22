import type { SupabaseClient } from '@supabase/supabase-js'
import type { SourceRun, SourceRunStore } from '@/lib/event-intelligence/source-run'

/**
 * Source runs over Supabase, for the service role only.
 *
 * `intel_source_runs` grants nothing to `authenticated` or `anon`, so a
 * request client passed here fails at the database. Runs are operational
 * records — which sources ABC reads, how often, how they failed — and are not
 * shown to any account.
 */

type Row = Record<string, unknown>

function fail(scope: string, error: { code?: string } | null): never {
  throw new Error(`event-intelligence source runs: ${scope} failed (${error?.code ?? 'unknown'})`)
}

const COLUMNS =
  'id, provider, source_kind, payload_version, event_ref, event_key, event_id, status, health, started_at, finished_at, duration_ms, metrics, gates, errors, overrides, ingest, changes'

export function toSourceRun(row: Row): SourceRun {
  return {
    id: String(row.id),
    provider: String(row.provider),
    sourceKind: row.source_kind as SourceRun['sourceKind'],
    payloadVersion: String(row.payload_version),
    eventRef: String(row.event_ref),
    eventKey: typeof row.event_key === 'string' ? row.event_key : null,
    eventId: typeof row.event_id === 'string' ? row.event_id : null,
    status: row.status as SourceRun['status'],
    health: row.health as SourceRun['health'],
    startedAt: String(row.started_at),
    finishedAt: String(row.finished_at),
    durationMs: Number(row.duration_ms ?? 0),
    metrics: (row.metrics ?? {}) as SourceRun['metrics'],
    gates: (Array.isArray(row.gates) ? row.gates : []) as SourceRun['gates'],
    errors: (Array.isArray(row.errors) ? row.errors : []) as string[],
    overrides: (Array.isArray(row.overrides) ? row.overrides : []) as SourceRun['overrides'],
    ingest: (row.ingest ?? null) as SourceRun['ingest'],
    changes: (row.changes ?? null) as SourceRun['changes'],
  }
}

export function sourceRunRow(run: SourceRun): Row {
  return {
    id: run.id,
    provider: run.provider,
    source_kind: run.sourceKind,
    payload_version: run.payloadVersion,
    event_ref: run.eventRef,
    event_key: run.eventKey,
    event_id: run.eventId,
    status: run.status,
    health: run.health,
    started_at: run.startedAt,
    finished_at: run.finishedAt,
    duration_ms: run.durationMs,
    metrics: run.metrics,
    gates: run.gates,
    errors: run.errors,
    overrides: run.overrides,
    ingest: run.ingest,
    changes: run.changes,
  }
}

export function supabaseSourceRunStore(supabase: SupabaseClient): SourceRunStore {
  return {
    async latestPublishedRun(provider, eventKey) {
      const { data, error } = await supabase
        .from('intel_source_runs')
        .select(COLUMNS)
        .eq('provider', provider)
        .eq('event_key', eventKey)
        .eq('status', 'published')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) fail('latestPublishedRun', error)
      return data ? toSourceRun(data as Row) : null
    },

    async recordRun(run) {
      const { error } = await supabase.from('intel_source_runs').insert(sourceRunRow(run))
      if (error) fail('recordRun', error)
    },
  }
}
