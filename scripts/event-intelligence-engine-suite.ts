/**
 * Event Data Engine V1 and Product Brain V1 — sections AB to AE of
 * `npm run test:event-intelligence`.
 *
 * Kept in its own file and called from scripts/test-event-intelligence.ts,
 * which owns the harness (check, PGlite, the ingest store). Everything that
 * touches a database here touches real Postgres with every migration applied,
 * as the real `authenticated`, `anon` and `service_role` roles.
 *
 * What is REAL, FIXTURE, MOCKED here — the labels the final report uses:
 *
 *   * The network is MOCKED: `fixtureTransport` answers from a table. Nothing
 *     in this file reaches the internet.
 *   * MEDICA data is FIXTURE: invented exhibitors in a structured shape. The
 *     real directory is robots-disallowed and is never read.
 *   * The database is REAL Postgres (PGlite), with RLS and grants.
 */
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { contentHash, normalizeCompanyName } from '@/lib/event-intelligence/normalize'
import { eventEditionKey } from '@/lib/event-intelligence/event-identity'
import { listingSourceKey, type IngestStore } from '@/lib/event-intelligence/ingest'
import { snapshotDiff, type ListingSnapshot } from '@/lib/event-intelligence/change-detection'
import { runEventSource, type SourceRun, type SourceRunStore } from '@/lib/event-intelligence/source-run'
import {
  QUALITY_THRESHOLDS,
  evaluateQualityGates,
  listingMetrics,
} from '@/lib/event-intelligence/source-health'
import {
  SOURCE_PRIORITY,
  selectSource,
  type EventSourceAdapter,
} from '@/lib/event-intelligence/sources/adapter'
import {
  checkUrl,
  createPoliteFetcher,
  hostRefusal,
  isPrivateAddress,
  looksLikeChallenge,
  redactUrl,
} from '@/lib/event-intelligence/sources/http'
import { parseRobots, robotsDecision } from '@/lib/event-intelligence/sources/robots'
import { mapListing, parseHallStand, scrubContactDetails } from '@/lib/event-intelligence/sources/mapping'
import { officialDirectoryAdapter } from '@/lib/event-intelligence/sources/official-directory'
import { MEDICA_2026, MEDICA_DIRECTORY_URL, MEDICA_FIELDS, medicaDirectoryConfig } from '@/lib/event-intelligence/sources/pilots/medica'
import { APIFY_API, apifyDatasetAdapter } from '@/lib/event-intelligence/sources/apify'
import { fileSourceAdapter } from '@/lib/event-intelligence/sources/file'
import { sourceRunRow, toSourceRun } from '@/lib/event-intelligence/store/supabase-source-runs'
import { chunkedByLength } from '@/lib/event-intelligence/store/supabase-ingest'
import { extractPage } from '@/lib/event-intelligence/website/extract'
import { CRAWL_HARD_MAX_PAGES, canonicalPageUrl, crawlCompanySite, pageKindOf } from '@/lib/event-intelligence/website/crawl'
import {
  BRAIN_SECTIONS,
  assembleBrain,
  brainSummary,
  combineFacts,
  extractFromWebsite,
  factKey,
  inferFromFacts,
  interpretOwnerStatements,
  isFactPhrase,
  matchInputsVersion,
  ownerFacts,
  ownerSideOfMatch,
  planBrainWrite,
  projectBrainForMatching,
  type BrainFact,
  type StoredBrainFact,
} from '@/lib/event-intelligence/product-brain'
import { analyzeOwnerBusiness, decideBrainFacts, loadBrainView, loadStoredBrainFacts } from '@/lib/event-intelligence/brain-data'
import { suggestWhatToShow } from '@/lib/event-intelligence/what-to-show'
import { nextMissionAction, type MissionFacts } from '@/lib/event-intelligence/mission'
import { deterministicMatchEngine, ENGINE_VERSION, matchEvent } from '@/lib/event-intelligence/scoring'
import { toCompany, toPresence } from '@/lib/event-intelligence/data'
import type { CompanyIntentProfile, EventObjective, IntelCompany } from '@/lib/event-intelligence/types'
import type { EventProduct } from '@/lib/event-intelligence/profile'

import {
  FIXTURE_BASE,
  FIXTURE_ORIGIN,
  MEDICA_OBSERVED_ROBOTS,
  directoryRoutes,
  generatedRecords,
  medicaFixtureRecords,
  type FixtureRecord,
} from './fixtures/event-data-engine/medica-directory'
import { BIG_SITE, OWNER_SITE, bigSiteRoutes, ownerSiteRoutes } from './fixtures/event-data-engine/company-sites'
import { fixtureTransport, html, json, publicResolver, text, virtualTime, type FixtureRoute } from './fixtures/event-data-engine/transport'

type Role = 'service_role' | 'authenticated' | 'anon'

export type SuiteContext = {
  check: (label: string, got: unknown, want: unknown) => void
  freshDatabase: () => Promise<{ db: PGlite; skipped: string[] }>
  pgliteIngestStore: (db: PGlite, counter?: { statements: number }) => IngestStore
  rowsOf: <T = Record<string, unknown>>(db: PGlite, sql: string, params?: unknown[]) => Promise<T[]>
  asRole: <T = Record<string, unknown>>(db: PGlite, role: Role | null, sql: string, params?: unknown[], sub?: string) => Promise<{ rows: T[] }>
  refusal: (db: PGlite, role: Role, sql: string, params?: unknown[], sub?: string) => Promise<string>
  seedAccount: (db: PGlite, owner: string, tag: string) => Promise<{ contact: string; encounter: string }>
  code: (rel: string) => string
  git: (...args: string[]) => string
  BASE_REF: string
  OWNER: string
  OTHER: string
}

// ─────────────────────────── helpers ───────────────────────────

const ident = (s: string) => {
  if (!/^[a-z_]+$/.test(s)) throw new Error(`unexpected identifier ${s}`)
  return s
}
const cols = (s: string) => {
  if (!/^[a-z_, ]+$/.test(s)) throw new Error(`unexpected column list ${s}`)
  return s
}

/**
 * Just enough of supabase-js, over PGlite, for the brain and run stores —
 * reads *and* writes — executed as a real role, with a JWT subject when given.
 */
export function pgClient(ctx: SuiteContext, db: PGlite, role: Role, sub?: string): SupabaseClient {
  const from = (table: string) => {
    const state = {
      op: 'select' as 'select' | 'insert' | 'upsert' | 'update' | 'delete',
      cols: '*',
      rows: [] as Record<string, unknown>[],
      patch: {} as Record<string, unknown>,
      onConflict: '',
      where: [] as { col: string; op: '=' | 'in'; value: unknown }[],
      order: [] as { col: string; asc: boolean }[],
      limit: null as number | null,
      returning: false,
      single: false,
    }
    const run = async () => {
      const params: unknown[] = []
      const where = state.where
        .map((w) => {
          params.push(w.op === 'in' ? (w.value as unknown[]).map(String) : String(w.value))
          return w.op === 'in' ? `x.${ident(w.col)}::text = any($${params.length}::text[])` : `x.${ident(w.col)}::text = $${params.length}::text`
        })
        .join(' and ')
      const whereSql = where ? `where ${where}` : ''
      const t = `public.${ident(table)}`
      let sql: string
      if (state.op === 'select') {
        const order = state.order.length ? `order by ${state.order.map((o) => `x.${ident(o.col)} ${o.asc ? 'asc' : 'desc'} nulls last`).join(', ')}` : ''
        const limit = state.limit !== null ? `limit ${state.limit}` : ''
        sql = `select to_jsonb(s) as row from (select ${state.cols === '*' ? 'x.*' : cols(state.cols)} from ${t} x ${whereSql} ${order} ${limit}) s`
      } else if (state.op === 'insert' || state.op === 'upsert') {
        const keys = [...new Set(state.rows.flatMap((r) => Object.keys(r)))].map(ident)
        params.push(JSON.stringify(state.rows))
        const conflict =
          state.op === 'upsert'
            ? (() => {
                const targets = state.onConflict.split(',').map((c) => ident(c.trim()))
                const sets = keys.filter((k) => !targets.includes(k)).map((k) => `${k} = excluded.${k}`)
                return `on conflict (${targets.join(', ')}) do ${sets.length ? `update set ${sets.join(', ')}` : 'nothing'}`
              })()
            : ''
        sql = `insert into ${t} as x (${keys.join(', ')}) select ${keys.join(', ')} from jsonb_populate_recordset(null::${t}, $${params.length}::jsonb) ${conflict} ${state.returning ? 'returning to_jsonb(x) as row' : ''}`
      } else if (state.op === 'update') {
        const keys = Object.keys(state.patch).map(ident)
        params.push(JSON.stringify(state.patch))
        const p = params.length
        sql = `update ${t} as x set ${keys.map((k) => `${k} = r.${k}`).join(', ')} from jsonb_populate_record(null::${t}, $${p}::jsonb) r ${whereSql} ${state.returning ? `returning ${state.cols === '*' ? 'to_jsonb(x)' : `jsonb_build_object(${cols(state.cols).split(',').map((c) => `'${c.trim()}', x.${c.trim()}`).join(', ')})`} as row` : ''}`
      } else {
        sql = `delete from ${t} as x ${whereSql} ${state.returning ? 'returning x.id as id' : ''}`
      }
      try {
        const res = await ctx.asRole<{ row?: Record<string, unknown>; id?: string }>(db, role, sql, params, sub)
        const rows = res.rows.map((r) => (r.row ?? r) as Record<string, unknown>)
        return { data: state.single ? rows[0] ?? null : rows, error: null }
      } catch (err) {
        return { data: null, error: { code: (err as { code?: string }).code ?? 'error', message: String((err as Error).message ?? '') } }
      }
    }
    const builder = {
      select(c = '*') {
        if (state.op === 'select') state.cols = c
        else {
          state.returning = true
          state.cols = c
        }
        return builder
      },
      insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
        state.op = 'insert'
        state.rows = Array.isArray(rows) ? rows : [rows]
        return builder
      },
      upsert(rows: Record<string, unknown> | Record<string, unknown>[], opts?: { onConflict?: string }) {
        state.op = 'upsert'
        state.rows = Array.isArray(rows) ? rows : [rows]
        state.onConflict = opts?.onConflict ?? 'id'
        return builder
      },
      update(patch: Record<string, unknown>) {
        state.op = 'update'
        state.patch = patch
        return builder
      },
      delete() {
        state.op = 'delete'
        return builder
      },
      eq(col: string, value: unknown) {
        state.where.push({ col, op: '=', value })
        return builder
      },
      in(col: string, values: unknown[]) {
        state.where.push({ col, op: 'in', value: values })
        return builder
      },
      order(col: string, opts?: { ascending?: boolean }) {
        state.order.push({ col, asc: opts?.ascending !== false })
        return builder
      },
      limit(n: number) {
        state.limit = n
        return builder
      },
      maybeSingle() {
        state.single = true
        return builder
      },
      then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
        return run().then(resolve, reject)
      },
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

function pgliteRunStore(ctx: SuiteContext, db: PGlite): SourceRunStore & { runs: SourceRun[] } {
  const runs: SourceRun[] = []
  return {
    runs,
    async latestPublishedRun(provider, eventKey) {
      const rows = await ctx.rowsOf<{ row: Record<string, unknown> }>(
        db,
        `select to_jsonb(r) as row from public.intel_source_runs r
          where provider = $1 and event_key = $2 and status = 'published'
          order by started_at desc limit 1`,
        [provider, eventKey]
      )
      return rows[0] ? toSourceRun(rows[0].row) : null
    },
    async recordRun(run) {
      runs.push(run)
      await ctx.asRole(
        db,
        'service_role',
        `insert into public.intel_source_runs select * from jsonb_populate_record(null::public.intel_source_runs, $1::jsonb)`,
        [JSON.stringify({ ...sourceRunRow(run), created_at: run.finishedAt })]
      )
    },
  }
}

/** A clock that moves one second per call, so runs order themselves. */
function ticker(start: string) {
  let n = 0
  const base = new Date(start).getTime()
  return () => new Date(base + 1000 * n++).toISOString()
}

const SYNTHETIC = { legalBasis: 'synthetic_fixture' as const }

function fixtureFetcher(transport: ReturnType<typeof fixtureTransport>['transport'], at = '2026-10-01T08:00:00.000Z', time = virtualTime()) {
  return createPoliteFetcher({ transport, resolveHost: publicResolver, now: time.now, sleep: time.sleep, clock: () => at, policy: { minIntervalMs: 0 } })
}

function medicaFixtureAdapter(
  records: () => FixtureRecord[],
  opts: { pageSize?: number; withDetail?: boolean; id?: string; detail?: Parameters<typeof directoryRoutes>[1]['detail']; pageOverride?: (page: number) => FixtureRoute | null; maxPages?: number; event?: typeof MEDICA_2026 } = {}
) {
  const pageSize = opts.pageSize ?? 5
  const net = directoryRoutes(records, { pageSize, detail: opts.detail, pageOverride: opts.pageOverride })
  const config = medicaDirectoryConfig({
    baseUrl: FIXTURE_BASE,
    access: SYNTHETIC,
    pageSize,
    withDetail: opts.withDetail,
    id: opts.id ?? 'official:medica-fixture',
    maxPages: opts.maxPages,
  })
  const adapter = officialDirectoryAdapter(opts.event ? { ...config, event: opts.event } : config, fixtureFetcher(net.transport))
  return { adapter, net }
}

const count = async (ctx: SuiteContext, db: PGlite, sql: string, params: unknown[] = []) =>
  (await ctx.rowsOf<{ n: number }>(db, sql, params))[0].n

const MEDICA_REF = { providerEventId: 'medica-2026' }

// ─────────────────────────── the suite ───────────────────────────

export async function runEngineSuite(ctx: SuiteContext): Promise<void> {
  const { check } = ctx

  // ══════════ AB. Event Data Engine ══════════

  // ── The contract, and the legal gate before any request ──

  {
    const real = directoryRoutes(() => medicaFixtureRecords(), { base: 'https://www.medica-tradefair.com/vis/v1/en/directory', pageSize: 100, robots: MEDICA_OBSERVED_ROBOTS })
    const realAdapter = officialDirectoryAdapter(medicaDirectoryConfig(), fixtureFetcher(real.transport))
    check(
      'AB1 the pilot is configuration over one generic adapter: the MEDICA config names the real edition and the real, public directory address',
      [realAdapter.id, realAdapter.kind, realAdapter.displayName, MEDICA_2026.editionYear, MEDICA_2026.startsOn, MEDICA_2026.endsOn, MEDICA_DIRECTORY_URL.startsWith('https://www.medica-tradefair.com/vis/')],
      ['official:medica', 'official_directory', 'Event directory', 2026, '2026-11-16', '2026-11-19', true]
    )
    const probe = await realAdapter.healthCheck(MEDICA_REF)
    check(
      'AB2 no legal basis, no read: the real MEDICA source is refused before a single request is made',
      [probe, real.requests.length],
      [{ available: false, reason: 'no_legal_basis' }, 0]
    )

    const withBasis = officialDirectoryAdapter(
      medicaDirectoryConfig({ access: { legalBasis: 'organiser_agreement' } }),
      fixtureFetcher(real.transport)
    )
    const robotsProbe = await withBasis.healthCheck(MEDICA_REF)
    check(
      'AB3 and even with a basis, MEDICA reserves its directory against AI crawlers by name, and ABC honours that for itself: refused, and only robots.txt was asked for',
      [robotsProbe, real.requests.map((r) => new URL(r.url).pathname)],
      [{ available: false, reason: 'robots_ai_opt_out' }, ['/robots.txt']]
    )

    const { db } = await ctx.freshDatabase()
    const runStore = pgliteRunStore(ctx, db)
    const blockedRun = await runEventSource(realAdapter, MEDICA_REF, { ingestStore: ctx.pgliteIngestStore(db), runStore, now: ticker('2026-10-01T08:00:00Z') })
    check(
      'AB4 a run of the real MEDICA source fails safe: failed, unavailable, nothing written, and the refusal is on record',
      [
        blockedRun.status,
        blockedRun.health,
        blockedRun.errors,
        await count(ctx, db, 'select count(*)::int as n from public.intel_events'),
        await count(ctx, db, 'select count(*)::int as n from public.intel_company_presences'),
        await count(ctx, db, "select count(*)::int as n from public.intel_source_runs where status = 'failed'"),
      ],
      ['failed', 'unavailable', ['no_legal_basis'], 0, 0, 1]
    )
  }

  // ── The fixture pilot, end to end ──

  const { db: edb } = await ctx.freshDatabase()
  const ingestStore = ctx.pgliteIngestStore(edb)
  const runStore = pgliteRunStore(ctx, edb)
  const clock = ticker('2026-10-01T08:00:00Z')
  let records = medicaFixtureRecords()
  const pilot = () => medicaFixtureAdapter(() => records, { withDetail: false })

  const first = await runEventSource(pilot().adapter, MEDICA_REF, { ingestStore, runStore, now: clock })
  const eventRow = (await ctx.rowsOf<{ id: string; event_key: string }>(edb, 'select id, event_key from public.intel_events'))[0]
  check(
    'AB5 FIXTURE pilot: published and healthy; 14 discovered, 12 parsed, 2 rejected by reason; the edition is medica-2026',
    [first.status, first.health, first.metrics.recordsDiscovered, first.metrics.recordsParsed, first.metrics.rejectedByReason, eventRow?.event_key],
    ['published', 'healthy', 14, 12, { no_company_name: 1, no_stable_id: 1 }, 'medica-2026']
  )
  check(
    'AB6 source health is measured: coverage, missing percentages, detail and duplicate counts, companies and presences',
    {
      missingWebsitePct: first.metrics.missingWebsitePct,
      missingHallPct: first.metrics.missingHallPct,
      missingStandPct: first.metrics.missingStandPct,
      locationUnparsed: first.metrics.locationUnparsed,
      contactDetailsRemoved: first.metrics.contactDetailsRemoved,
      companiesCreated: first.metrics.companiesCreated,
      presencesCreated: first.metrics.presencesCreated,
      duplicateCompanies: first.metrics.duplicateCompanies,
      hasDuration: typeof first.metrics.durationMs === 'number',
    },
    {
      missingWebsitePct: 16.7,
      missingHallPct: 8.3,
      missingStandPct: 8.3,
      locationUnparsed: 1,
      contactDetailsRemoved: 1,
      companiesCreated: 11,
      presencesCreated: 11,
      duplicateCompanies: 1,
      hasDuration: true,
    }
  )

  const sources = await ctx.rowsOf<{ provider: string; provider_record_id: string; source_url: string | null; fetched_at: string; run_id: string; content_hash: string; snapshot: ListingSnapshot | null; entity_id: string }>(
    edb,
    "select provider, provider_record_id, source_url, fetched_at::text, run_id::text, content_hash, snapshot, entity_id::text from public.intel_source_records where entity_type = 'presence' order by provider_record_id"
  )
  check(
    'AB7 provenance: every listing has a source record — provider, edition-scoped key, source URL, fetch time, the run that wrote it',
    [
      sources.length,
      sources.every((s) => s.provider === 'official:medica-fixture'),
      sources.every((s) => s.provider_record_id.startsWith('medica-2026::MX-')),
      sources.every((s) => Boolean(s.source_url?.startsWith(FIXTURE_ORIGIN))),
      sources.every((s) => s.run_id === first.id && Boolean(s.fetched_at)),
    ],
    [12, true, true, true, true]
  )
  check(
    'AB8 the snapshot is what the source said, and the stored hash is the hash of the stored snapshot',
    sources.every((s) => s.snapshot !== null && contentHash(s.snapshot) === s.content_hash),
    true
  )
  const everything = JSON.stringify(await ctx.rowsOf(edb, 'select * from public.intel_source_records')) + JSON.stringify(await ctx.rowsOf(edb, 'select * from public.intel_company_presences')) + JSON.stringify(await ctx.rowsOf(edb, 'select * from public.intel_companies'))
  check(
    'AB9 no personal data reaches ABC: the contact person, email and phone in a listing appear nowhere in the graph',
    [everything.includes('Anna Berger'), everything.includes('a.berger@'), everything.includes('4560 1234'), everything.includes('Surgical instruments.')],
    [false, false, false, true]
  )
  const located = await ctx.rowsOf<{ name: string; hall: string | null; stand: string | null }>(
    edb,
    "select c.display_name as name, p.hall, p.stand from public.intel_company_presences p join public.intel_companies c on c.id = p.company_id where c.display_name in ('Kessler Lab Automation', 'Nordlicht Medical') order by c.display_name"
  )
  check(
    'AB10 "Hall 3 / F44" is read as hall 3, stand F44; "see hall plan" is not guessed at',
    located,
    [
      { name: 'Kessler Lab Automation', hall: '3', stand: 'F44' },
      { name: 'Nordlicht Medical', hall: null, stand: null },
    ]
  )

  // ── Company identity ──

  const vitalis = await ctx.rowsOf<{ n: number; names: string[] }>(edb, "select count(*)::int as n, array_agg(display_name) as names from public.intel_companies where website_domain = 'vitalis-healthcare.invalid'")
  check('AB11 "Vitalis Healthcare AG" and "Vitalis Healthcare GmbH" on one domain are one company', vitalis[0].n, 1)
  const aurora = await ctx.rowsOf<{ country: string; merge_candidate_of: string | null }>(edb, "select country, merge_candidate_of from public.intel_companies where name_normalized = 'aurora diagnostics' order by country")
  check(
    'AB12 two "Aurora Diagnostics" in different countries with no website: kept apart and flagged, never merged — a false merge is worse than a duplicate',
    [aurora.length, aurora.filter((a) => a.merge_candidate_of).length],
    [2, 1]
  )
  check('AB13 legal forms fold for comparison, and nothing else does', [normalizeCompanyName('Vitalis Healthcare AG'), normalizeCompanyName('Vitalis Healthcare GmbH'), normalizeCompanyName('Vitalis Health')], ['vitalis healthcare', 'vitalis healthcare', 'vitalis health'])

  // ── Refresh ──

  const second = await runEventSource(pilot().adapter, MEDICA_REF, { ingestStore, runStore, now: clock })
  check(
    'AB14 an unchanged refresh: published, every listing unchanged, nothing created, nothing withdrawn',
    [second.status, second.changes?.unchanged, second.changes?.new, second.changes?.changed, second.changes?.withdrawn, second.metrics.presencesCreated],
    ['published', 12, 0, 0, 0, 0]
  )

  records = medicaFixtureRecords()
    .filter((r) => r.exhibitorId !== 'MX-1010') // withdrawn
    .map((r) => {
      if (r.exhibitorId === 'MX-1001') return { ...r, hall: '11' }
      if (r.exhibitorId === 'MX-1003') return { ...r, location: 'Hall 3 / F46' }
      if (r.exhibitorId === 'MX-1013') return { ...r, website: 'https://aurora-diagnostics.invalid', profile: 'Rapid tests and readers.' }
      return r
    })
  records.push({
    exhibitorId: 'MX-2001',
    companyName: 'Newcomer Orthopaedics',
    website: 'https://newcomer-ortho.invalid',
    country: 'DE',
    profile: 'Orthopaedic implants.',
    sectors: ['Orthopaedics'],
    hall: '9',
    stand: 'E01',
    productGroups: ['Implants'],
    products: ['Hip implants'],
  })
  const third = await runEventSource(pilot().adapter, MEDICA_REF, { ingestStore, runStore, now: clock })
  check(
    'AB15 change detection names what changed: a new exhibitor, a moved hall, a moved stand, a new website and description, one withdrawn',
    {
      status: third.status,
      new: third.changes?.new,
      changed: third.changes?.changed,
      withdrawn: third.changes?.withdrawn,
      hall: third.changes?.byField.hall,
      stand: third.changes?.byField.stand,
      website: third.changes?.byField.website,
      description: third.changes?.byField.company_description,
    },
    { status: 'published', new: 1, changed: 3, withdrawn: 1, hall: 1, stand: 1, website: 1, description: 1 }
  )
  const carevia = await ctx.rowsOf<{ status: string }>(edb, "select p.status from public.intel_company_presences p join public.intel_companies c on c.id = p.company_id where c.display_name = 'Carevia Monitoring'")
  check('AB16 a withdrawn exhibitor is marked withdrawn, never deleted', carevia.map((r) => r.status), ['withdrawn'])

  records = [...records, medicaFixtureRecords().find((r) => r.exhibitorId === 'MX-1010') as FixtureRecord]
  const fourth = await runEventSource(pilot().adapter, MEDICA_REF, { ingestStore, runStore, now: clock })
  check(
    'AB17 and when it is listed again it reappears — the same presence, listed',
    [fourth.status, fourth.changes?.reappeared, (await ctx.rowsOf<{ status: string }>(edb, "select p.status from public.intel_company_presences p join public.intel_companies c on c.id = p.company_id where c.display_name = 'Carevia Monitoring'")).map((r) => r.status)],
    ['published', 1, ['listed']]
  )

  // ── Quality gates: a completed read is not a healthy one ──

  const graphState = async () =>
    JSON.stringify({
      presences: await ctx.rowsOf(edb, 'select id, hall, stand, status, last_seen_at::text, updated_at::text from public.intel_company_presences order by id'),
      companies: await ctx.rowsOf(edb, 'select id, website_domain, updated_at::text from public.intel_companies order by id'),
      sources: await ctx.rowsOf(edb, 'select provider_record_id, content_hash, fetched_at::text, run_id::text from public.intel_source_records order by provider_record_id'),
      events: await ctx.rowsOf(edb, 'select id, updated_at::text from public.intel_events order by id'),
    })

  const beforeCollapse = await graphState()
  const fullRecords = records
  records = fullRecords.slice(0, 3)
  const collapsed = await runEventSource(pilot().adapter, MEDICA_REF, { ingestStore, runStore, now: clock })
  const failedGates = collapsed.gates.filter((g) => !g.passed).map((g) => g.id).sort()
  check(
    'AB18 yesterday 13, today 3: the run is blocked — record-count collapse and withdrawal spike',
    [collapsed.status, collapsed.health, failedGates.includes('record_count_collapse'), failedGates.includes('withdrawal_spike')],
    ['blocked', 'unhealthy', true, true]
  )
  check('AB19 a blocked run writes nothing: presences, companies, source records and the event row are byte-for-byte as they were', (await graphState()) === beforeCollapse, true)
  check(
    'AB20 and its only trace is its own run record, with no ingestion report and no source record naming it',
    [
      await count(ctx, edb, "select count(*)::int as n from public.intel_source_runs where id = $1 and status = 'blocked' and ingest is null", [collapsed.id]),
      await count(ctx, edb, 'select count(*)::int as n from public.intel_source_records where run_id = $1', [collapsed.id]),
    ],
    [1, 0]
  )

  const overridden = await runEventSource(pilot().adapter, MEDICA_REF, {
    ingestStore,
    runStore,
    now: clock,
    publishDespite: ['record_count_collapse', 'withdrawal_spike'],
  })
  check(
    'AB21 an operator may publish a fair that really shrank — only by naming the gates, and the override is on the record',
    [overridden.status, overridden.health, overridden.overrides.sort(), overridden.metrics.presencesWithdrawn],
    ['published', 'degraded', ['record_count_collapse', 'withdrawal_spike'], 9]
  )
  records = fullRecords
  await runEventSource(pilot().adapter, MEDICA_REF, { ingestStore, runStore, now: clock, publishDespite: ['record_count_collapse'] })
  await runEventSource(pilot().adapter, MEDICA_REF, { ingestStore, runStore, now: clock })

  const noHalls = fullRecords.map((r) => ({ ...r, hall: undefined, location: undefined, stand: r.stand }))
  records = noHalls
  const hallCollapse = await runEventSource(pilot().adapter, MEDICA_REF, { ingestStore, runStore, now: clock })
  check(
    'AB22 hall coverage collapsing against the last published read blocks the run',
    [hallCollapse.status, hallCollapse.gates.find((g) => g.id === 'hall_coverage_collapse')?.passed, hallCollapse.gates.find((g) => g.id === 'layout_change_suspected')?.passed],
    ['blocked', false, true]
  )
  records = fullRecords.map((r) => ({ ...r, hall: undefined, stand: undefined, location: undefined, website: undefined }))
  const layout = await runEventSource(pilot().adapter, MEDICA_REF, { ingestStore, runStore, now: clock })
  check(
    'AB23 hall, stand and website vanishing together reads as a changed layout',
    [layout.status, layout.gates.find((g) => g.id === 'layout_change_suspected')?.passed],
    ['blocked', false]
  )
  records = fullRecords.map((r, i) => (i % 3 === 0 ? { ...r, companyName: '' } : r))
  const nameless = await runEventSource(pilot().adapter, MEDICA_REF, { ingestStore, runStore, now: clock })
  check(
    'AB24 a third of the listings with no name: reject-rate and empty-name gates block it',
    [nameless.status, nameless.gates.filter((g) => !g.passed).map((g) => g.id).filter((id) => id === 'reject_rate' || id === 'empty_name_rate').sort()],
    ['blocked', ['empty_name_rate', 'reject_rate']]
  )
  records = fullRecords
  const repeatingPages = await runEventSource(
    medicaFixtureAdapter(() => records, { pageOverride: (page) => (page === 2 || page === 3 ? json({ exhibitors: fullRecords.slice(0, 5) }) : null) }).adapter,
    MEDICA_REF,
    { ingestStore, runStore, now: clock }
  )
  check(
    'AB25 a pagination fault that serves page 1 again: duplicate records spike against the baseline and the run is blocked',
    [repeatingPages.status, repeatingPages.metrics.duplicateRecords > 0, repeatingPages.gates.find((g) => g.id === 'duplicate_rate')?.passed],
    ['blocked', true, false]
  )

  const before = await graphState()
  const brokenMidway = await runEventSource(
    medicaFixtureAdapter(() => records, { pageOverride: (page) => (page === 2 ? { status: 500, headers: { 'content-type': 'text/plain' }, body: 'oops' } : null) }).adapter,
    MEDICA_REF,
    { ingestStore, runStore, now: clock }
  )
  check(
    'AB26 a read that breaks on page 2 is a failure, not a smaller fair: failed, nothing written',
    [brokenMidway.status, brokenMidway.errors, (await graphState()) === before],
    ['failed', ['listing_http_error'], true]
  )
  const shapeChanged = await runEventSource(
    medicaFixtureAdapter(() => records, { pageOverride: (page) => (page === 1 ? json({ results: [] }) : null) }).adapter,
    MEDICA_REF,
    { ingestStore, runStore, now: clock }
  )
  check('AB27 the page arrives in a different shape: failed as a layout change, nothing written', [shapeChanged.status, shapeChanged.errors], ['failed', ['listing_unexpected_shape']])
  const tooManyPages = await runEventSource(medicaFixtureAdapter(() => generatedRecords(40), { pageSize: 5, maxPages: 3 }).adapter, MEDICA_REF, { ingestStore, runStore, now: clock })
  check('AB28 a directory longer than the page ceiling fails instead of being truncated', [tooManyPages.status, tooManyPages.errors], ['failed', ['listing_page_limit_reached']])
  const downRobots = officialDirectoryAdapter(
    medicaDirectoryConfig({ baseUrl: FIXTURE_BASE, access: SYNTHETIC, pageSize: 5 }),
    fixtureFetcher(directoryRoutes(() => records, { pageSize: 5, robots: { status: 503, headers: { 'content-type': 'text/plain' }, body: 'down' } }).transport)
  )
  const down = await runEventSource(downRobots, MEDICA_REF, { ingestStore, runStore, now: clock })
  check('AB29 robots.txt unreadable (503): ABC does not read the source at all', [down.status, down.health, down.errors], ['failed', 'unavailable', ['robots_unavailable']])

  // ── Detail pages ──

  {
    const { db } = await ctx.freshDatabase()
    const detailRecords = medicaFixtureRecords().map((r) => ({ ...r, profile: undefined }))
    const withDetail = medicaFixtureAdapter(() => detailRecords, {
      withDetail: true,
      detail: (r) => json({ exhibitor: { profile: `Detail: ${String(r.companyName)}` } }),
    })
    const run = await runEventSource(withDetail.adapter, MEDICA_REF, { ingestStore: ctx.pgliteIngestStore(db), runStore: pgliteRunStore(ctx, db), now: ticker('2026-10-02T08:00:00Z') })
    const described = await count(ctx, db, "select count(*)::int as n from public.intel_companies where description_public like 'Detail: %'")
    check('AB30 detail pages add to a thin directory: every detail read, descriptions filled from them', [run.status, run.metrics.detailAttempted, run.metrics.detailFailed, described], ['published', 13, 0, 11])

    const flaky = medicaFixtureAdapter(() => detailRecords, {
      withDetail: true,
      detail: (r) => (['MX-1001', 'MX-1002', 'MX-1003', 'MX-1004'].includes(String(r.exhibitorId)) ? { status: 500, headers: {}, body: '' } : json({ exhibitor: { profile: 'x' } })),
    })
    const beforeFlaky = await ctx.rowsOf(db, 'select id, description_public from public.intel_companies order by id')
    const flakyRun = await runEventSource(flaky.adapter, MEDICA_REF, { ingestStore: ctx.pgliteIngestStore(db), runStore: pgliteRunStore(ctx, db), now: ticker('2026-10-03T08:00:00Z') })
    check(
      'AB31 more than a fifth of detail pages failing blocks the run, so known facts are not overwritten with "not given"',
      [flakyRun.status, flakyRun.metrics.detailFailed, flakyRun.gates.find((g) => g.id === 'detail_failure_rate')?.passed, JSON.stringify(await ctx.rowsOf(db, 'select id, description_public from public.intel_companies order by id')) === JSON.stringify(beforeFlaky)],
      ['blocked', 4, false, true]
    )
  }

  // ── Edition identity: MEDICA 2026 ≠ MEDICA 2027 ──

  {
    const { db } = await ctx.freshDatabase()
    const store = ctx.pgliteIngestStore(db)
    const runs = pgliteRunStore(ctx, db)
    const clk = ticker('2026-10-05T08:00:00Z')
    const edition2027 = { ...MEDICA_2026, providerRecordId: 'medica-2027', editionYear: 2027, startsOn: '2027-11-15', endsOn: '2027-11-18' }
    // The organiser keeps exhibitor ids across years — the realistic case.
    const r2026 = medicaFixtureRecords()
    const r2027 = medicaFixtureRecords().map((r) => (r.exhibitorId === 'MX-1001' ? { ...r, hall: '12', stand: 'C40' } : r))
    const a2026 = medicaFixtureAdapter(() => r2026)
    const a2027 = medicaFixtureAdapter(() => r2027, { event: edition2027 })
    await runEventSource(a2026.adapter, MEDICA_REF, { ingestStore: store, runStore: runs, now: clk })
    await runEventSource(a2027.adapter, { providerEventId: 'medica-2027' }, { ingestStore: store, runStore: runs, now: clk })

    check(
      'AB32 MEDICA 2026 and MEDICA 2027 are two editions, even with identical exhibitor ids',
      (await ctx.rowsOf<{ event_key: string }>(db, 'select event_key from public.intel_events order by event_key')).map((r) => r.event_key),
      ['medica-2026', 'medica-2027']
    )
    const helix = await ctx.rowsOf<{ event_key: string; hall: string; stand: string; company_id: string }>(
      db,
      `select e.event_key, p.hall, p.stand, p.company_id::text from public.intel_company_presences p
         join public.intel_events e on e.id = p.event_id join public.intel_companies c on c.id = p.company_id
        where c.website_domain = 'helix-imaging.invalid' order by e.event_key`
    )
    check(
      'AB33 one company, two presences, each edition with its own hall and stand',
      [helix.map((h) => `${h.event_key} ${h.hall}/${h.stand}`), new Set(helix.map((h) => h.company_id)).size],
      [['medica-2026 10/B21', 'medica-2027 12/C40'], 1]
    )
    const provenance2026 = await count(
      ctx,
      db,
      `select count(*)::int as n from public.intel_company_presences p join public.intel_events e on e.id = p.event_id
        where e.event_key = 'medica-2026'
          and exists (select 1 from public.intel_source_records s where s.entity_type = 'presence' and s.entity_id = p.id and s.provider_record_id like 'medica-2026::%')`
    )
    check('AB34 importing 2027 does not take 2026’s provenance: every 2026 presence still has its own source record', provenance2026, 11)
    const refresh2026 = await runEventSource(medicaFixtureAdapter(() => r2026).adapter, MEDICA_REF, { ingestStore: store, runStore: runs, now: clk })
    check('AB35 and refreshing 2026 afterwards compares against 2026, not 2027: everything unchanged', [refresh2026.changes?.unchanged, refresh2026.changes?.changed], [12, 0])
    check('AB36 the key is the edition then the provider’s id', listingSourceKey('medica-2027', 'MX-1001'), 'medica-2027::MX-1001')

    // A record written before keys were scoped is believed only for the edition it points at.
    const presence2027 = (await ctx.rowsOf<{ id: string }>(db, "select p.id::text from public.intel_company_presences p join public.intel_events e on e.id = p.event_id where e.event_key = 'medica-2027' limit 1"))[0]?.id ?? '00000000-0000-4000-8000-000000000000'
    await ctx.rowsOf(db, "insert into public.intel_source_records (provider, provider_record_id, payload_version, entity_type, entity_id, content_hash) values ('official:medica-fixture', 'MX-9999', 'v1', 'presence', $1, 'legacy')", [presence2027])
    const legacyAdopter = await runEventSource(
      medicaFixtureAdapter(() => [...r2026, { exhibitorId: 'MX-9999', companyName: 'Legacy Lookalike', country: 'DE', hall: '1', stand: 'Z1', sectors: ['Other'] }]).adapter,
      MEDICA_REF,
      { ingestStore: store, runStore: runs, now: clk }
    )
    const lookalike = await ctx.rowsOf<{ event_key: string }>(db, "select e.event_key from public.intel_company_presences p join public.intel_events e on e.id = p.event_id join public.intel_companies c on c.id = p.company_id where c.display_name = 'Legacy Lookalike'")
    check(
      'AB37 an unscoped legacy source record pointing at a 2027 presence is not adopted by a 2026 listing with the same id',
      [legacyAdopter.status, lookalike.map((l) => l.event_key)],
      ['published', ['medica-2026']]
    )
  }

  // ── Uploaded files go through the same gates ──

  {
    const { db } = await ctx.freshDatabase()
    const store = ctx.pgliteIngestStore(db)
    const runs = pgliteRunStore(ctx, db)
    const clk = ticker('2026-10-06T08:00:00Z')
    const event = { providerRecordId: 'ambiente-2027', name: 'Ambiente', editionYear: 2027 }
    const rows = Array.from({ length: 60 }, (_, i) => ({ providerRecordId: `amb-${i}`, companyName: `Ambiente Exhibitor ${i}`, website: `https://amb-${i}.invalid`, hall: '1', stand: `A${i}` }))
    const firstUpload = await runEventSource(fileSourceAdapter({ event, exhibitors: rows }, 'csv:upload'), { providerEventId: 'ambiente-2027' }, { ingestStore: store, runStore: runs, now: clk })
    const truncated = await runEventSource(fileSourceAdapter({ event, exhibitors: rows.slice(0, 6) }, 'csv:upload'), { providerEventId: 'ambiente-2027' }, { ingestStore: store, runStore: runs, now: clk })
    check(
      'AB38 a truncated re-upload that would withdraw 54 of 60 exhibitors is refused; nothing is withdrawn',
      [firstUpload.status, truncated.status, truncated.gates.find((g) => g.id === 'withdrawal_spike')?.passed, await count(ctx, db, "select count(*)::int as n from public.intel_company_presences where status = 'listed'")],
      ['published', 'blocked', false, 60]
    )
    const small = await runEventSource(fileSourceAdapter({ event, exhibitors: rows.slice(0, 55) }, 'csv:upload'), { providerEventId: 'ambiente-2027' }, { ingestStore: store, runStore: runs, now: clk })
    check('AB39 ordinary churn — five fewer — publishes', [small.status, small.metrics.presencesWithdrawn], ['published', 5])
    check(
      'AB40 the commit route runs uploads through the gated source run, and says nothing was imported when a run is refused',
      [
        ctx.code('app/api/event-intelligence/import/commit/route.ts').includes('runEventSource(') && ctx.code('app/api/event-intelligence/import/commit/route.ts').includes('fileSourceAdapter('),
        ctx.code('app/api/event-intelligence/import/commit/route.ts').includes('Nothing was imported.'),
      ],
      [true, true]
    )
  }

  // ── Gates, pure ──

  {
    const listing = listingMetrics({ discovered: 43, accepted: [], rejected: {}, duplicateRecords: 0, detailAttempted: 0, detailFailed: 0, locationUnparsed: 0, contactDetailsRemoved: 0 })
    const withAccepted = { ...listing, recordsParsed: 43 }
    const verdict = evaluateQualityGates(withAccepted, { listedBefore: 5000, projectedWithdrawals: 4957, duplicateCompanies: 0 }, { recordsParsed: 5000, coverage: listing.coverage, duplicateRate: 0 })
    check(
      'AB41 the brief’s own example: yesterday ~5,000, today 43 — unhealthy, on count collapse and withdrawal spike',
      [verdict.health, verdict.gates.filter((g) => !g.passed).map((g) => g.id).sort()],
      ['unhealthy', ['record_count_collapse', 'withdrawal_spike']]
    )
    const churn = evaluateQualityGates({ ...listing, recordsParsed: 12 }, { listedBefore: 16, projectedWithdrawals: 4, duplicateCompanies: 0 }, null)
    check('AB42 a small fair losing a few is churn: four of sixteen does not trip the spike, while nine of twelve did (AB18)', churn.gates.find((g) => g.id === 'withdrawal_spike')?.passed, true)
    check('AB43 thresholds live in one table', Object.keys(QUALITY_THRESHOLDS).length >= 9, true)
  }

  // ── Run records: what the database insists on ──

  check(
    'AB44 the database refuses a published run that was unhealthy and not overridden',
    await ctx.refusal(edb, 'service_role', "insert into public.intel_source_runs (provider, source_kind, payload_version, event_ref, status, health, started_at, finished_at, duration_ms, ingest) values ('x', 'file', 'v1', 'e', 'published', 'unhealthy', now(), now(), 0, '{}')"),
    'check'
  )
  check(
    'AB45 and a blocked run that claims to have written something',
    await ctx.refusal(edb, 'service_role', "insert into public.intel_source_runs (provider, source_kind, payload_version, event_ref, status, health, started_at, finished_at, duration_ms, ingest) values ('x', 'file', 'v1', 'e', 'blocked', 'unhealthy', now(), now(), 0, '{}')"),
    'check'
  )
  check(
    'AB46 source runs are internal: a signed-in account can neither read nor write them, anon neither',
    [
      await ctx.refusal(edb, 'authenticated', 'select count(*) from public.intel_source_runs', [], ctx.OWNER),
      await ctx.refusal(edb, 'authenticated', "insert into public.intel_source_runs (provider, source_kind, payload_version, event_ref, status, health, started_at, finished_at, duration_ms) values ('x','file','v1','e','failed','unavailable',now(),now(),0)", [], ctx.OWNER),
      await ctx.refusal(edb, 'anon', 'select count(*) from public.intel_source_runs'),
    ],
    ['permission denied', 'permission denied', 'permission denied']
  )

  // ── Source priority ──

  {
    const stub = (id: string, kind: EventSourceAdapter['kind'], available: boolean): EventSourceAdapter => ({
      id,
      kind,
      displayName: 'Event directory',
      payloadVersion: 'v1',
      access: SYNTHETIC,
      healthCheck: async () => (available ? { available: true } : { available: false, reason: 'robots_disallowed' }),
      discoverEvent: async () => null,
      fetchListings: async function* () {},
      normalizeListing: () => ({ ok: false, reason: 'malformed' }),
    })
    const chosen = await selectSource([stub('secondary:x', 'secondary', true), stub('official:dir', 'official_directory', true), stub('official:api', 'official_api', false)], MEDICA_REF)
    check(
      'AB47 source priority: the official API first, then the directory, secondary last — and a refused source says why',
      [chosen.adapter?.id, chosen.refused, SOURCE_PRIORITY.official_api < SOURCE_PRIORITY.official_directory && SOURCE_PRIORITY.official_directory < SOURCE_PRIORITY.official_detail && SOURCE_PRIORITY.official_detail < SOURCE_PRIORITY.company_website && SOURCE_PRIORITY.company_website < SOURCE_PRIORITY.secondary],
      ['official:dir', [{ id: 'official:api', reason: 'robots_disallowed' }], true]
    )
  }

  // ── Apify: an optional adapter, never a dependency ──

  {
    const run = { data: { status: 'SUCCEEDED', defaultDatasetId: 'ds-test' } }
    const items = medicaFixtureRecords().slice(0, 4)
    const net = fixtureTransport({
      [`${APIFY_API}/actor-runs/run-test`]: json(run),
      [`${APIFY_API}/datasets/ds-test/items?format=json&clean=true&offset=0&limit=3`]: json(items.slice(0, 3)),
      [`${APIFY_API}/datasets/ds-test/items?format=json&clean=true&offset=3&limit=3`]: json(items.slice(3)),
    })
    const config = { label: 'medica-2026', runId: 'run-test', access: SYNTHETIC, event: MEDICA_2026, fields: MEDICA_FIELDS, maxItems: 100, pageSize: 3 }
    const noToken = apifyDatasetAdapter(config, fixtureFetcher(net.transport), {})
    check('AB48 Apify with no token: not configured, and not a single request', [await noToken.healthCheck(MEDICA_REF), net.requests.length], [{ available: false, reason: 'not_configured' }, 0])

    const token = 'apify_api_TESTTOKEN0000000000'
    const withToken = apifyDatasetAdapter(config, fixtureFetcher(net.transport), { APIFY_TOKEN: token })
    const { db } = await ctx.freshDatabase()
    const apifyRun = await runEventSource(withToken, MEDICA_REF, { ingestStore: ctx.pgliteIngestStore(db), runStore: pgliteRunStore(ctx, db), now: ticker('2026-10-07T08:00:00Z') })
    const stored = JSON.stringify(await ctx.rowsOf(db, 'select * from public.intel_source_records')) + JSON.stringify(await ctx.rowsOf(db, 'select * from public.intel_source_runs'))
    check(
      'AB49 a finished run’s dataset is read through the same contract: published, paged, token only ever in the Authorization header',
      [
        apifyRun.status,
        apifyRun.metrics.recordsParsed,
        withToken.kind,
        withToken.displayName,
        net.requests.every((r) => !r.url.includes(token)),
        net.requests.every((r) => r.headers.Authorization === `Bearer ${token}`),
        stored.includes(token),
      ],
      ['published', 4, 'secondary', 'Event directory', true, true, false]
    )
    const running = fixtureTransport({ [`${APIFY_API}/actor-runs/run-test`]: json({ data: { status: 'RUNNING', defaultDatasetId: 'ds-test' } }) })
    check(
      'AB50 a run that has not finished is not read — a partial dataset would withdraw what it is missing',
      await apifyDatasetAdapter(config, fixtureFetcher(running.transport), { APIFY_TOKEN: token }).healthCheck(MEDICA_REF),
      { available: false, reason: 'run_not_finished' }
    )
    const tooBig = await runEventSource(apifyDatasetAdapter({ ...config, maxItems: 2 }, fixtureFetcher(net.transport), { APIFY_TOKEN: token }), MEDICA_REF, { ingestStore: ctx.pgliteIngestStore(db), runStore: pgliteRunStore(ctx, db), now: ticker('2026-10-07T09:00:00Z') })
    check('AB51 a dataset over its ceiling fails rather than being truncated', [tooBig.status, tooBig.errors], ['failed', ['dataset_limit_reached']])
    check(
      'AB52 no Apify package, and the engine core names no vendor',
      [
        /apify/i.test(ctx.code('lib/event-intelligence/source-run.ts')),
        /apify/i.test(ctx.code('lib/event-intelligence/source-health.ts')),
        /apify/i.test(ctx.code('lib/event-intelligence/ingest.ts')),
        /apify/i.test(ctx.code('lib/event-intelligence/sources/adapter.ts')),
      ],
      [false, false, false, false]
    )
    check(
      'AB53 the adapter cannot start or abort runs: it only ever issues GETs to runs and datasets',
      [/method:\s*'POST'|\/runs\?|\/abort|\/actors\/[^'"`]*\/runs/.test(ctx.code('lib/event-intelligence/sources/apify.ts')), net.requests.every((r) => /\/actor-runs\/|\/datasets\//.test(r.url))],
      [false, true]
    )
  }

  // ── Mapping, pure ──

  check('AB54 hall and stand are split only from an unambiguous pattern', [parseHallStand('Hall 12 / D18'), parseHallStand('Halle 8a, Stand K30'), parseHallStand('12D18'), parseHallStand('Outdoor area')], [{ hall: '12', stand: 'D18' }, { hall: '8A', stand: 'K30' }, null, null])
  check(
    'AB55 a sentence giving an address or a number to call is removed whole, name and all; years, ISO numbers and stand codes are not contact details',
    [scrubContactDetails('Call +49 211 4560 1234 or mail x.y@acme.invalid today.').text, scrubContactDetails('Since 2019-2024, ISO 13485:2016 certified, stand A-1234.').text],
    [null, 'Since 2019-2024, ISO 13485:2016 certified, stand A-1234.']
  )
  check(
    'AB56 a record with no name or no stable id is rejected, never invented',
    [mapListing({ exhibitorId: 'a' }, MEDICA_FIELDS), mapListing({ companyName: 'X' }, MEDICA_FIELDS), mapListing([], MEDICA_FIELDS)],
    [{ ok: false, reason: 'no_company_name' }, { ok: false, reason: 'no_stable_id' }, { ok: false, reason: 'malformed' }]
  )
  check('AB57 in-URL chunks stay short whatever the ids look like', chunkedByLength(Array.from({ length: 900 }, (_, i) => `medica-2026::https://www.example.invalid/exhibitors/${i}`), 6000).every((c) => c.join(',').length <= 6000 + c.length * 3), true)
  check(
    'AB58 field-level diff names exactly the fields that moved',
    snapshotDiff(
      { company: { displayName: 'A', nameNormalized: 'a', websiteDomain: null, country: 'DE', descriptionPublic: null, categories: [] }, presence: { exhibitorDisplayName: 'A', hall: '1', stand: 'A1', eventCategories: [], eventDescription: null, productsServices: [], listingUrl: null } },
      { company: { displayName: 'A', nameNormalized: 'a', websiteDomain: 'a.invalid', country: 'DE', descriptionPublic: null, categories: [] }, presence: { exhibitorDisplayName: 'A', hall: '2', stand: 'A1', eventCategories: [], eventDescription: null, productsServices: [], listingUrl: null } }
    ),
    ['website', 'hall']
  )

  // ══════════ AC. The network, and reading a company website ══════════

  check(
    'AC1 internal addresses are refused before anything is resolved: localhost, private ranges, cloud metadata, IPv6 loopback and unique-local, bare hostnames, .local',
    ['http://localhost/', 'http://127.0.0.1/', 'http://10.1.2.3/', 'http://192.168.0.10/', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/', 'http://[fd00::1]/', 'http://intranet/', 'http://printer.local/', 'http://172.20.0.1/'].map((u) => {
      const r = checkUrl(u)
      return r.ok ? 'allowed' : r.code
    }),
    Array(10).fill('private_address')
  )
  check(
    'AC2 credentials in a URL and non-web schemes are refused',
    ['https://user:pass@example.invalid/', 'file:///etc/passwd', 'ftp://example.invalid/', 'javascript:alert(1)'].map((u) => {
      const r = checkUrl(u)
      return r.ok ? 'allowed' : r.code
    }),
    ['credentials_in_url', 'unsupported_scheme', 'unsupported_scheme', 'unsupported_scheme']
  )
  {
    const net = fixtureTransport({ 'https://rebind.invalid/robots.txt': text('') , 'https://rebind.invalid/': html('<p>x</p>') })
    const fetcher = createPoliteFetcher({ transport: net.transport, resolveHost: async () => ['10.0.0.5'], policy: { minIntervalMs: 0 } })
    const outcome = await fetcher.get('https://rebind.invalid/', 'html')
    check('AC3 a public-looking name that resolves to a private address is refused, and nothing is requested', [outcome.ok ? 'ok' : outcome.code, net.requests.length], ['private_address', 0])
  }
  {
    const net = fixtureTransport({
      'https://hop.invalid/robots.txt': text(''),
      'https://hop.invalid/start': { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } },
    })
    const outcome = await createPoliteFetcher({ transport: net.transport, resolveHost: publicResolver, policy: { minIntervalMs: 0 } }).get('https://hop.invalid/start', 'html')
    check('AC4 a redirect to an internal address is refused mid-chain', [outcome.ok ? 'ok' : outcome.code, net.requests.map((r) => r.url)], ['private_address', ['https://hop.invalid/robots.txt', 'https://hop.invalid/start']])
  }
  {
    const policy = parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/public\n\nUser-agent: ABCEventIntelligence\nDisallow: /nope$\nDisallow: /*.pdf$\nCrawl-delay: 2\n')
    const at = (path: string, token = 'ABCEventIntelligence') => robotsDecision(policy, token, new URL(`https://x.invalid${path}`)).allowed
    check(
      'AC5 robots.txt: the most specific agent group wins alone; longest rule wins; $ anchors; * matches; crawl-delay is read',
      [at('/private/x'), at('/nope'), at('/nope/more'), at('/files/a.pdf'), at('/private/x', 'OtherBot'), at('/private/public/y', 'OtherBot'), robotsDecision(policy, 'ABCEventIntelligence', new URL('https://x.invalid/')).crawlDelaySeconds],
      [true, false, true, false, false, true, 2]
    )
    const medica = parseRobots(MEDICA_OBSERVED_ROBOTS)
    const on = (path: string, token = 'ABCEventIntelligence', honourAiOptOut = true) =>
      robotsDecision(medica, token, new URL(`https://www.medica-tradefair.com${path}`), { honourAiOptOut })
    check(
      'AC6a repeated `User-agent: *` groups are merged: MEDICA’s second `*` group disallows the exhibitor search, and reading only the first missed it',
      [on('/vis/v1/en/search?q=x', 'x', false).allowed, on('/kati-cgi/kati/a', 'x', false).allowed, on('/vis/v1/en/directory/a', 'x', false).allowed],
      [false, false, true]
    )
    check(
      'AC6b an AI opt-out by name is honoured for ABC too; a `*` rule alone is not an opt-out; switching it off is explicit',
      [
        on('/vis/v1/en/directory/a'),
        on('/').allowed,
        on('/vis/v1/en/directory/a', 'ABCEventIntelligence', false).allowed,
        robotsDecision(parseRobots('User-agent: *\nDisallow: /x\n'), 'ABCEventIntelligence', new URL('https://s.invalid/y')).allowed,
      ],
      [{ allowed: false, crawlDelaySeconds: null, rule: 'AI opt-out (gptbot) Disallow: /vis/', aiOptOut: true }, true, true, true]
    )
    check('AC6 on a tie, Allow wins; an empty Disallow allows everything', [robotsDecision(parseRobots('User-agent: *\nDisallow: /a\nAllow: /a\n'), 'x', new URL('https://x.invalid/a')).allowed, robotsDecision(parseRobots('User-agent: *\nDisallow:\n'), 'x', new URL('https://x.invalid/a')).allowed], [true, true])
  }
  {
    const time = virtualTime()
    const net = fixtureTransport({
      'https://paced.invalid/robots.txt': text('User-agent: *\nCrawl-delay: 3\n'),
      'https://paced.invalid/a': html('<p>a</p>'),
      'https://paced.invalid/b': html('<p>b</p>'),
    })
    const fetcher = createPoliteFetcher({ transport: net.transport, resolveHost: publicResolver, now: time.now, sleep: time.sleep, policy: { minIntervalMs: 1000 } })
    await Promise.all([fetcher.get('https://paced.invalid/a', 'html'), fetcher.get('https://paced.invalid/b', 'html')])
    check(
      'AC7 one host, one request at a time, spaced by the crawl-delay (3 s) — never faster, whatever the caller asks for',
      [net.requests.map((r) => new URL(r.url).pathname), time.sleeps.every((ms) => ms >= 1000), time.sleeps.includes(3000)],
      [['/robots.txt', '/a', '/b'], true, true]
    )
    check('AC8 one honest User-Agent on every request, never rotated', [...new Set(net.requests.map((r) => r.headers['User-Agent']))], ['ABCEventIntelligence/1.0'])
  }
  {
    const net = fixtureTransport({
      'https://closed.invalid/robots.txt': text(''),
      'https://closed.invalid/a': { status: 403, headers: { 'content-type': 'text/html' }, body: 'no' },
      'https://closed.invalid/b': html('<p>b</p>'),
    })
    const fetcher = createPoliteFetcher({ transport: net.transport, resolveHost: publicResolver, policy: { minIntervalMs: 0 } })
    const a = await fetcher.get('https://closed.invalid/a', 'html')
    const b = await fetcher.get('https://closed.invalid/b', 'html')
    check('AC9 a 403 stops every further request to that host — no retry, no workaround', [a.ok ? 'ok' : a.code, b.ok ? 'ok' : b.code, net.requests.filter((r) => r.url.endsWith('/b')).length], ['access_denied', 'host_stopped', 0])
  }
  {
    const net = fixtureTransport({
      'https://guarded.invalid/robots.txt': text(''),
      'https://guarded.invalid/': html('<html><title>Just a moment...</title><div id="cf-chl-widget"></div></html>'),
      'https://guarded.invalid/next': html('<p>x</p>'),
    })
    const fetcher = createPoliteFetcher({ transport: net.transport, resolveHost: publicResolver, policy: { minIntervalMs: 0 } })
    const first = await fetcher.get('https://guarded.invalid/', 'html')
    const again = await fetcher.get('https://guarded.invalid/next', 'html')
    check('AC10 a challenge page is a closed door: protected, host stopped, nothing tried to get past it', [first.ok ? 'ok' : first.code, again.ok ? 'ok' : again.code, looksLikeChallenge(200, 'verify you are human')], ['protected', 'host_stopped', true])
  }
  {
    const net = fixtureTransport({
      'https://slow.invalid/robots.txt': text(''),
      'https://slow.invalid/': { hang: true },
      'https://big.invalid/robots.txt': text(''),
      'https://big.invalid/': html('x'.repeat(5000)),
      'https://pdf.invalid/robots.txt': text(''),
      'https://pdf.invalid/': { status: 200, headers: { 'content-type': 'application/pdf' }, body: '%PDF' },
      'https://unread.invalid/robots.txt': { status: 500, headers: {}, body: '' },
      'https://unread.invalid/': html('<p>x</p>'),
      'https://norobots.invalid/': html('<p>x</p>'),
    })
    const fetcher = createPoliteFetcher({ transport: net.transport, resolveHost: publicResolver, policy: { minIntervalMs: 0, timeoutMs: 30, maxBytes: 1000 } })
    const outcomes = await Promise.all(['https://slow.invalid/', 'https://big.invalid/', 'https://pdf.invalid/', 'https://unread.invalid/', 'https://norobots.invalid/'].map((u) => fetcher.get(u, 'html')))
    check(
      'AC11 bounded: a hanging server times out, an oversized body is cut off, a PDF is not HTML, an unreadable robots.txt means no crawl, a missing one means no rules',
      outcomes.map((o) => (o.ok ? 'ok' : o.code)),
      ['timeout', 'too_large', 'unsupported_content_type', 'robots_unavailable', 'ok']
    )
  }
  check('AC12 recorded URLs keep no credentials', redactUrl('https://api.invalid/items?token=abc&page=2&api_key=x#frag'), 'https://api.invalid/items?page=2')

  // ── Crawling a site ──

  {
    const net = ownerSiteRoutes()
    const time = virtualTime()
    const fetcher = createPoliteFetcher({ transport: net.transport, resolveHost: publicResolver, now: time.now, sleep: time.sleep, clock: () => '2026-10-10T09:00:00.000Z' })
    const crawl = await crawlCompanySite('nordfeld-precision.invalid', { fetcher, clock: time.now })
    const fetched = net.pageRequests().map((r) => new URL(r.url).pathname).sort()
    check(
      'AC13 the useful pages are read — home, products, industries, capabilities, about — each once',
      [crawl.ok, fetched],
      [true, ['/', '/about-us', '/capabilities', '/industries/automotive', '/industries/medical', '/products', '/products/aluminium-housings']]
    )
    check(
      'AC14 and nothing else: no contact page, imprint, privacy, login, cart, news, careers, PDF, query string, other subdomain, other site, or robots-disallowed path',
      fetched.filter((p) => /contact|impressum|datenschutz|login|cart|news|careers|\.pdf|internal/.test(p)).length + net.pageRequests().filter((r) => !r.url.startsWith(OWNER_SITE)).length,
      0
    )
    check(
      'AC15 duplicate addresses collapse: /products, /products/ and ?utm_source=nav are one page',
      net.pageRequests().filter((r) => new URL(r.url).pathname.replace(/\/$/, '') === '/products').length,
      1
    )
    check('AC16 robots.txt is read once per site, before any page', net.requests[0].url, `${OWNER_SITE}/robots.txt`)
    check(
      'AC17 page kinds come from the address and the link text',
      [pageKindOf(new URL('https://x.invalid/produkte'), ''), pageKindOf(new URL('https://x.invalid/ueber-uns'), ''), pageKindOf(new URL('https://x.invalid/x'), 'Our solutions'), pageKindOf(new URL('https://x.invalid/kontakt'), 'Kontakt'), pageKindOf(new URL('https://x.invalid/blog/post'), 'Products news')],
      ['products', 'about', 'solutions', null, null]
    )
    check('AC18 addresses are compared without fragments, tracking or trailing slashes', canonicalPageUrl('https://X.invalid/a/?utm_campaign=z&b=1#top'), 'https://x.invalid/a?b=1')
  }
  {
    const net = bigSiteRoutes()
    const crawl = await crawlCompanySite(BIG_SITE, { fetcher: fixtureFetcher(net.transport), maxPages: 5 })
    check('AC19 the page ceiling counts fetches: five asked, five fetched, stopped by the limit', [net.pageRequests().length, crawl.ok && crawl.report.stoppedBy], [5, 'page_limit'])
    const greedy = bigSiteRoutes()
    await crawlCompanySite(BIG_SITE, { fetcher: fixtureFetcher(greedy.transport), maxPages: 500 })
    check('AC20 and there is a hard ceiling no caller can raise', greedy.pageRequests().length, CRAWL_HARD_MAX_PAGES)
    const deep = bigSiteRoutes()
    await crawlCompanySite(BIG_SITE, { fetcher: fixtureFetcher(deep.transport), maxPages: 20, maxDepth: 2 })
    check('AC21 depth is limited: a page three links from home is not read at depth two', deep.pageRequests().some((r) => r.url.endsWith('/solutions/a/b/c')), false)
    const slow = bigSiteRoutes()
    const time = virtualTime()
    const budgeted = await crawlCompanySite(BIG_SITE, { fetcher: createPoliteFetcher({ transport: slow.transport, resolveHost: publicResolver, now: time.now, sleep: time.sleep, policy: { minIntervalMs: 5000 } }), clock: time.now, timeBudgetMs: 12_000, maxPages: 20 })
    check('AC22 the time budget stops a crawl: at 5 s a page, a 12 s budget reads a handful', [budgeted.ok && budgeted.report.stoppedBy, slow.pageRequests().length <= 4], ['time_budget', true])
  }
  {
    const net = fixtureTransport({
      'https://moved.invalid/robots.txt': text(''),
      'https://moved.invalid/': { status: 301, headers: { location: 'https://elsewhere.invalid/' } },
    })
    const off = await crawlCompanySite('https://moved.invalid', { fetcher: fixtureFetcher(net.transport) })
    const bad = await Promise.all(['not a url', 'javascript:alert(1)', 'http://localhost:3000', ''].map((u) => crawlCompanySite(u, { fetcher: fixtureFetcher(net.transport) })))
    check(
      'AC23 a site that redirects off itself is not followed; bad addresses are refused without a request',
      [off.ok ? 'ok' : off.code, bad.map((b) => (b.ok ? 'ok' : b.code)), net.requests.map((r) => r.url)],
      ['out_of_scope', ['invalid_site', 'invalid_site', 'invalid_site', 'invalid_site'], ['https://moved.invalid/robots.txt', 'https://moved.invalid/']]
    )
  }
  {
    const net = fixtureTransport({
      'https://twins.invalid/robots.txt': text(''),
      'https://twins.invalid/': html('<a href="/products">P</a><a href="/produkte">P2</a>'),
      'https://twins.invalid/products': html('<h1>Products</h1><h2>Same thing</h2>'),
      'https://twins.invalid/produkte': html('<h1>Products</h1><h2>Same thing</h2>'),
    })
    const twins = await crawlCompanySite('twins.invalid', { fetcher: fixtureFetcher(net.transport) })
    check('AC24 the same content under two addresses is one page of evidence', [twins.ok && twins.pages.length, twins.ok && twins.report.skipped.duplicate_content], [2, 1])
  }
  {
    const page = extractPage(
      `<html lang="de"><head><title>A &amp; B</title><meta name="description" content="Pr&auml;zision &#8211; seit 1994"><script type="application/ld+json">{"@graph":[{"@type":"WebSite"},{"@type":"Organization","name":"A&B GmbH","address":{"addressCountry":{"name":"DE"}}}]}</script></head>
       <body><nav><ul><li><a href="/x">Menu item</a></li></ul></nav><script>var s="<h2>no</h2>"</script><style>h2{}</style>
       <h2>Real heading</h2><ul><li>Outer<ul><li>Inner</li></ul></li></ul><p>One<br>two</p><footer><p>Footer text</p></footer></body></html>`,
      'https://ab.invalid/'
    )
    check(
      'AC25 extraction reads title, meta, JSON-LD in a graph, headings, nested items and paragraphs; drops scripts and styles; marks navigation and footers',
      [page.title, page.metaDescription, page.organization, page.lang, page.headings, page.items, page.paragraphs, page.links],
      [
        'A & B',
        'Präzision – seit 1994',
        { name: 'A&B GmbH', url: null, description: null, country: 'DE' },
        'de',
        [{ level: 2, text: 'Real heading', inNav: false }],
        [{ text: 'Menu item', inNav: true }, { text: 'Inner', inNav: false }, { text: 'Outer', inNav: false }],
        [{ text: 'One two', inNav: false }, { text: 'Footer text', inNav: true }],
        [{ href: 'https://ab.invalid/x', text: 'Menu item', inNav: true }],
      ]
    )
  }

  // ══════════ AD. Product Brain ══════════

  const statement = {
    field: 'what_we_do',
    text: 'We sell precision aluminium components for medical equipment. We are looking for OEM customers and distributors in DACH.',
  }
  const read = interpretOwnerStatements([statement])
  const brief = (facts: BrainFact[]) => facts.map((f) => `${f.kind}:${f.value}:${f.origin}:${f.basis ?? '-'}`).sort()
  check(
    'AD1 the brief’s own example, read into structure — every piece an ANALYSIS with the rule it came from',
    brief(read),
    [
      'application:Medical equipment:analysis:application_from_for',
      'customer_type:OEMs:analysis:customer_type_phrase',
      'market:Austria:analysis:region_expansion',
      'market:DACH:analysis:market_phrase',
      'market:Germany:analysis:region_expansion',
      'market:Switzerland:analysis:region_expansion',
      'partner_type:Distributors:analysis:partner_type_phrase',
      'product:Precision aluminium components:analysis:offering_statement',
    ]
  )
  check(
    'AD2 and each quotes the owner’s own sentence as its evidence',
    read.every((f) => f.evidence.length > 0 && f.evidence.every((e) => e.source === 'owner_statement' && e.field === 'what_we_do' && statement.text.includes(e.quote.replace(/^DACH — /, '')))),
    true
  )
  const inferred = inferFromFacts(read)
  check(
    'AD3 components for medical equipment → medical equipment manufacturers as likely customers: ABC’s reading, labelled as one',
    brief(inferred),
    ['customer_type:Medical equipment manufacturers:analysis:components_imply_manufacturer_customers']
  )

  const site = ownerSiteRoutes()
  const siteCrawl = await crawlCompanySite(OWNER_SITE, { fetcher: fixtureFetcher(site.transport) })
  const websiteFacts = siteCrawl.ok ? extractFromWebsite(siteCrawl.pages) : []
  const has = (kind: string, value: string, origin = 'source') => websiteFacts.some((f) => f.kind === kind && f.value === value && f.origin === origin)
  check(
    'AD4 from the website, deterministically: name from structured data, summary from the meta description, products from product headings, certifications, materials, capabilities, industry and markets from text',
    [
      has('company_name', 'Nordfeld Precision GmbH'),
      has('summary', 'Nordfeld Precision manufactures precision aluminium components for medical equipment manufacturers across Europe.'),
      has('country', 'DE'),
      has('product', 'Aluminium housings for medical imaging'),
      has('product', 'CNC-machined enclosures'),
      has('product', 'Heat sinks'),
      has('certification', 'ISO 13485'),
      has('certification', 'ISO 9001'),
      has('material', 'Aluminium'),
      has('capability', 'CNC machining'),
      has('capability', 'Anodising'),
      has('capability', '5-axis machining'),
      has('industry', 'Medical technology'),
      has('market', 'Europe', 'analysis'),
      has('customer_type', 'Medical equipment manufacturers', 'analysis'),
      has('application', 'Medical imaging', 'analysis'),
    ],
    Array(16).fill(true)
  )
  check(
    'AD5 every website fact says where it came from: the page, when it was read, and the words it rests on',
    websiteFacts.every((f) => f.evidence.length > 0 && f.evidence.every((e) => e.source === 'website' && e.url?.startsWith(OWNER_SITE) && e.retrievedAt && e.quote.length > 0)),
    true
  )
  check(
    'AD6 menus, footers, buttons and scripts are never facts',
    [websiteFacts.some((f) => /Read more|Products again|Automotive · Energy|ISO 99999|Login|Menu/i.test(f.value)), has('industry', 'Aerospace')],
    [false, false]
  )
  check(
    'AD7 no personal data: the managing director’s email and phone appear in no fact and no quote',
    JSON.stringify(websiteFacts).match(/hans\.weber@|555 0100|Hans Weber/g),
    null
  )
  check(
    'AD8 SOURCE FACT ≠ ABC ANALYSIS: a source fact never carries a rule, an analysis always does',
    [websiteFacts.filter((f) => f.origin === 'source').every((f) => f.basis === null), [...websiteFacts, ...read, ...inferred].filter((f) => f.origin === 'analysis').every((f) => f.basis !== null)],
    [true, true]
  )
  check('AD9 a fact phrase is a name for something, not a sentence, a button or a number', [isFactPhrase('Aluminium housings'), isFactPhrase('Read more'), isFactPhrase('We are the leading supplier of everything you can imagine in Europe.'), isFactPhrase('2026'), isFactPhrase('mail@x.invalid')], [true, false, false, false, false])
  check('AD10 one fact however it is written', [factKey('product', 'Aluminium housings'), factKey('product', 'aluminium housing')], ['product:aluminium housing', 'product:aluminium housing'])

  const profile: CompanyIntentProfile = {
    id: 'p1', userId: ctx.OWNER, companyName: 'Nordfeld Precision', whatWeDo: statement.text,
    whatWeSell: ['Precision aluminium components'], whatWeBuy: [], whoWeWantToMeet: null,
    targetIndustries: [], targetCompanyTypes: [], capabilities: [], technologies: [], materials: [], certifications: [], geographies: [],
  }
  const owner = ownerFacts(profile, [], { company: null, website: OWNER_SITE })
  check(
    'AD11 OWNER FACTS are the profile as typed — confirmed, origin owner — and never proposed back to the owner',
    [owner.every((f) => f.origin === 'owner' && f.status === 'confirmed'), planBrainWrite(combineFacts(read, websiteFacts), [], owner).insert.some((f) => f.key === factKey('product', 'Precision aluminium components'))],
    [true, false]
  )

  const stored = (f: BrainFact, id: string, status: StoredBrainFact['status']): StoredBrainFact => ({ ...f, id, status })
  const facts = combineFacts(read, websiteFacts)
  const heat = facts.find((f) => f.value === 'Heat sinks') as BrainFact
  const iso = facts.find((f) => f.value === 'ISO 9001') as BrainFact
  const oem = facts.find((f) => f.value === 'OEMs') as BrainFact
  const gone: StoredBrainFact = { ...heat, id: 'gone', key: 'product:gone', value: 'Gone', status: 'proposed' }
  const plan = planBrainWrite(facts, [stored(heat, 'h', 'rejected'), stored(iso, 'i', 'confirmed'), gone, stored({ ...oem, evidence: [{ source: 'owner_statement', field: 'x', quote: 'old' }] }, 'o', 'proposed')], owner)
  check(
    'AD12 decisions stand: a rejected fact is not proposed again, a confirmed one is not touched, a stale proposal is withdrawn, new evidence refreshes without changing the decision',
    [plan.insert.some((f) => f.key === heat.key), plan.insert.some((f) => f.key === iso.key), plan.remove, plan.update.map((f) => [f.id, f.status])],
    [false, false, ['gone'], [['o', 'proposed']]]
  )
  check(
    'AD13 a confirmed fact no longer on the website is kept — one re-read is not a reason to take back what the owner agreed with',
    planBrainWrite([], [stored(iso, 'i', 'confirmed')], owner).remove,
    []
  )

  const proposedOnly = projectBrainForMatching(profile, facts.map((f, i) => stored(f, `f${i}`, 'proposed')))
  check('AD14 proposed facts move nothing: the profile the engine sees is the owner’s own', [proposedOnly.contributed.length, JSON.stringify(proposedOnly.profile) === JSON.stringify(profile)], [0, true])
  const confirmedAll = projectBrainForMatching(profile, facts.map((f, i) => stored(f, `f${i}`, 'confirmed')))
  check(
    'AD15 confirmed facts feed the lists the engine already reads — no new engine input, no rewritten engine',
    [
      confirmedAll.profile.targetCompanyTypes.includes('OEMs'),
      confirmedAll.profile.targetIndustries.includes('Medical equipment'),
      confirmedAll.profile.geographies.includes('Germany'),
      confirmedAll.profile.certifications.includes('ISO 13485'),
      confirmedAll.profile.whatWeSell.filter((v) => v === 'Precision aluminium components').length,
    ],
    [true, true, true, true, 1]
  )
  check(
    'AD16 and the owner’s own words win every tie in the explanation',
    [confirmedAll.termOrigins.get('precision')?.origin, confirmedAll.termOrigins.get('oem')?.origin, confirmedAll.termOrigins.get('imaging')?.origin],
    ['owner', 'analysis', 'source']
  )
  check('AD17 the version on a match says the brain contributed, and only when it did', [matchInputsVersion(ENGINE_VERSION, proposedOnly), matchInputsVersion(ENGINE_VERSION, confirmedAll)], ['deterministic-v1', 'deterministic-v1+brain-v1'])

  const summary = brainSummary(assembleBrain(owner, facts.map((f, i) => stored(f, `f${i}`, f === heat ? 'rejected' : 'proposed'))))
  check(
    'AD18 THIS IS HOW ABC UNDERSTANDS YOUR BUSINESS: five plain sections, the owner’s words first, each item labelled with whose it is',
    [
      summary.sections.map((s) => s.label),
      summary.sections[0].items[0],
      summary.sections.flatMap((s) => s.items).every((i) => ['You said', 'From your website', 'ABC’s reading'].includes(i.label)),
      summary.sections.flatMap((s) => s.items).some((i) => i.value === 'Heat sinks'),
      summary.pending > 0,
      BRAIN_SECTIONS.length,
    ],
    [
      ['We make and sell', 'Our typical customers', 'Main applications', 'Markets', 'What sets us apart'],
      { id: null, value: 'Precision aluminium components', origin: 'owner', status: 'confirmed', label: 'You said' },
      true,
      false,
      true,
      5,
    ]
  )

  // ── Against a real database, as the owner, through RLS ──

  const { db: bdb } = await ctx.freshDatabase()
  await ctx.seedAccount(bdb, ctx.OWNER, 'brain-owner')
  await ctx.seedAccount(bdb, ctx.OTHER, 'brain-other')
  await ctx.rowsOf(bdb, "update public.abc_profiles set company = 'Nordfeld Precision', website = 'nordfeld-precision.invalid' where id = $1", [ctx.OWNER])
  await ctx.rowsOf(
    bdb,
    "insert into public.intel_company_profiles (user_id, company_name, what_we_do, what_we_sell) values ($1, 'Nordfeld Precision', $2, array['Precision aluminium components'])",
    [ctx.OWNER, statement.text]
  )
  const session = pgClient(ctx, bdb, 'authenticated', ctx.OWNER)
  const service = pgClient(ctx, bdb, 'service_role')
  const brainSite = ownerSiteRoutes()
  const analysed = await analyzeOwnerBusiness({ session, service, ownerId: ctx.OWNER, fetcher: fixtureFetcher(brainSite.transport, '2026-10-10T09:00:00.000Z'), now: () => new Date('2026-10-10T09:00:00Z') })
  check(
    'AD19 real database: analysing the owner’s business reads their website from their ABC profile and stores ABC’s part as proposals',
    [
      analysed.ok,
      analysed.ok && analysed.written.inserted > 10,
      await count(ctx, bdb, "select count(*)::int as n from public.intel_brain_facts where user_id = $1 and status = 'proposed'", [ctx.OWNER]),
      await count(ctx, bdb, "select count(*)::int as n from public.intel_brain_documents where user_id = $1 and document_kind = 'website_page'", [ctx.OWNER]),
    ],
    [true, true, analysed.ok ? analysed.written.inserted : -1, 7]
  )
  check(
    'AD20 no owner fact is copied into the brain tables — what the owner typed stays where they typed it',
    await count(ctx, bdb, "select count(*)::int as n from public.intel_brain_facts where value_key = $1", [factKey('product', 'Precision aluminium components')]),
    0
  )
  const cooldown = await analyzeOwnerBusiness({ session, service, ownerId: ctx.OWNER, fetcher: fixtureFetcher(ownerSiteRoutes().transport, '2026-10-10T09:05:00.000Z'), now: () => new Date('2026-10-10T09:05:00Z') })
  check('AD21 reading the same website again within ten minutes is refused', cooldown.ok ? 'ok' : cooldown.code, 'cooldown')

  check(
    'AD22 the database holds the lines: no fact without evidence, no analysis without a rule, no source fact with one, no decision without a moment',
    [
      await ctx.refusal(bdb, 'service_role', "insert into public.intel_brain_facts (user_id, kind, value, value_key, origin, evidence, extractor_version) values ($1, 'product', 'X', 'product:x', 'source', '[]', 'v')", [ctx.OWNER]),
      await ctx.refusal(bdb, 'service_role', "insert into public.intel_brain_facts (user_id, kind, value, value_key, origin, evidence, extractor_version) values ($1, 'product', 'X', 'product:x', 'analysis', '[{\"quote\":\"x\"}]', 'v')", [ctx.OWNER]),
      await ctx.refusal(bdb, 'service_role', "insert into public.intel_brain_facts (user_id, kind, value, value_key, origin, basis, evidence, extractor_version) values ($1, 'product', 'X', 'product:x', 'source', 'offering_statement', '[{\"quote\":\"x\"}]', 'v')", [ctx.OWNER]),
      await ctx.refusal(bdb, 'service_role', "insert into public.intel_brain_facts (user_id, kind, value, value_key, origin, evidence, status, extractor_version) values ($1, 'product', 'X', 'product:x', 'source', '[{\"quote\":\"x\"}]', 'confirmed', 'v')", [ctx.OWNER]),
    ],
    ['check', 'check', 'check', 'check']
  )

  const someFact = (await ctx.rowsOf<{ id: string }>(bdb, "select id::text from public.intel_brain_facts where user_id = $1 and origin = 'analysis' limit 1", [ctx.OWNER]))[0]?.id ?? '00000000-0000-4000-8000-000000000000'
  check(
    'AD23 the owner decides and ABC extracts: the owner may confirm or reject, and may not rewrite what ABC read or turn an inference into a source fact',
    [
      await ctx.refusal(bdb, 'authenticated', "update public.intel_brain_facts set value = 'Forged' where id = $1", [someFact], ctx.OWNER),
      await ctx.refusal(bdb, 'authenticated', "update public.intel_brain_facts set origin = 'source', basis = null where id = $1", [someFact], ctx.OWNER),
      await ctx.refusal(bdb, 'authenticated', "update public.intel_brain_facts set evidence = '[{\"quote\":\"made up\"}]' where id = $1", [someFact], ctx.OWNER),
      await ctx.refusal(bdb, 'authenticated', "insert into public.intel_brain_facts (user_id, kind, value, value_key, origin, evidence, extractor_version) values ($1, 'product', 'X', 'product:x', 'source', '[{\"quote\":\"x\"}]', 'v')", [ctx.OWNER], ctx.OWNER),
      await ctx.refusal(bdb, 'authenticated', "insert into public.intel_brain_documents (user_id, document_kind, url, content_hash, extractor_version, retrieved_at) values ($1, 'website_page', 'https://x.invalid', 'h', 'v', now())", [ctx.OWNER], ctx.OWNER),
    ],
    ['permission denied', 'permission denied', 'permission denied', 'permission denied', 'permission denied']
  )
  check(
    'AD24 owner isolation: another account sees none of this owner’s brain, cannot decide on it, and anon has no access at all',
    [
      await count(ctx, bdb, 'select count(*)::int as n from public.intel_brain_facts'),
      (await ctx.asRole<{ n: number }>(bdb, 'authenticated', 'select count(*)::int as n from public.intel_brain_facts', [], ctx.OTHER)).rows[0].n,
      (await ctx.asRole<{ n: number }>(bdb, 'authenticated', 'select count(*)::int as n from public.intel_brain_documents', [], ctx.OTHER)).rows[0].n,
      await ctx.asRole<{ id: string }>(bdb, 'authenticated', "update public.intel_brain_facts set status = 'rejected', decided_at = now() where id = $1 returning id", [someFact], ctx.OTHER).then((r) => r.rows.length, () => 'refused after reading'),
      (await loadStoredBrainFacts(pgClient(ctx, bdb, 'authenticated', ctx.OTHER), ctx.OWNER)).length,
      await ctx.refusal(bdb, 'anon', 'select count(*) from public.intel_brain_facts'),
      await ctx.refusal(bdb, 'anon', 'select count(*) from public.intel_brain_documents'),
    ],
    [analysed.ok ? analysed.written.inserted : -1, 0, 0, 0, 0, 'permission denied', 'permission denied']
  )

  const beforeConfirm = projectBrainForMatching(profile, await loadStoredBrainFacts(session, ctx.OWNER))
  const confirmed = await decideBrainFacts(session, ctx.OWNER, 'confirm', 'all_proposed', new Date('2026-10-10T09:10:00Z'))
  const afterConfirm = projectBrainForMatching(profile, await loadStoredBrainFacts(session, ctx.OWNER))
  check(
    'AD25 "Looks right" confirms every open proposal through the owner’s own session — and only then do the facts reach matching',
    [beforeConfirm.contributed.length, confirmed.ok, confirmed.changed > 0, afterConfirm.contributed.length > 0],
    [0, true, true, true]
  )
  const rejectTarget = (await ctx.rowsOf<{ id: string }>(bdb, "select id::text from public.intel_brain_facts where user_id = $1 and value = 'Heat sinks'", [ctx.OWNER]))[0]?.id ?? '00000000-0000-4000-8000-000000000000'
  await decideBrainFacts(session, ctx.OWNER, 'reject', [rejectTarget])
  const reanalysed = await analyzeOwnerBusiness({ session, service, ownerId: ctx.OWNER, fetcher: fixtureFetcher(ownerSiteRoutes().transport, '2026-10-10T10:00:00.000Z'), now: () => new Date('2026-10-10T10:00:00Z') })
  const view = await loadBrainView(session, ctx.OWNER)
  check(
    'AD26 a rejected fact stays rejected through a re-read of the same website, and disappears from the summary',
    [
      reanalysed.ok,
      (await ctx.rowsOf<{ status: string }>(bdb, 'select status from public.intel_brain_facts where id = $1', [rejectTarget])).map((r) => r.status),
      view.summary.sections.flatMap((s) => s.items).some((i) => i.value === 'Heat sinks'),
      view.summary.pending,
    ],
    [true, ['rejected'], false, 0]
  )
  const downSite = await analyzeOwnerBusiness({
    session,
    service,
    ownerId: ctx.OWNER,
    fetcher: fixtureFetcher(fixtureTransport({ [`${OWNER_SITE}/robots.txt`]: { status: 503, headers: {}, body: '' } }).transport),
    now: () => new Date('2026-10-10T11:00:00Z'),
  })
  check(
    'AD27 a website that cannot be read this time has not changed its mind: nothing ABC read before is withdrawn',
    [downSite.ok, await count(ctx, bdb, "select count(*)::int as n from public.intel_brain_facts where user_id = $1 and status <> 'rejected'", [ctx.OWNER]) >= (analysed.ok ? analysed.written.inserted - 1 : 0)],
    [true, true]
  )
  const noAiSite = fixtureTransport({
    'https://no-ai.invalid/robots.txt': text('User-agent: GPTBot\nDisallow: /\n\nUser-agent: CCBot\nDisallow: /\n'),
    'https://no-ai.invalid/': html('<h1>Would be readable by a generic crawler</h1>'),
  })
  const optedOut = await analyzeOwnerBusiness({
    session,
    service,
    ownerId: ctx.OWNER,
    website: 'https://no-ai.invalid',
    fetcher: fixtureFetcher(noAiSite.transport, '2026-10-10T12:00:00.000Z'),
    now: () => new Date('2026-10-10T12:00:00Z'),
  })
  check(
    'AD27a a website that opts out of AI crawlers is not read — only its robots.txt is — the owner is told why, and what they wrote still counts',
    [optedOut.ok, optedOut.ok && optedOut.websiteRead, noAiSite.pageRequests().length, optedOut.ok && optedOut.view.summary.sections.length > 0],
    [true, 'refused_ai_opt_out', 0, true]
  )
  check(
    'AD28 the brain route: behind the guard, the owner from the session, confirm and reject only, no send',
    [
      ctx.code('app/api/event-intelligence/brain/route.ts').includes('requireEventIntelligence()'),
      /body\??\.(userId|user_id|ownerId|owner_id)/.test(ctx.code('app/api/event-intelligence/brain/route.ts')),
      /fetch\(|mailto:|wa\.me|sendEmail|resend/i.test(ctx.code('app/api/event-intelligence/brain/route.ts')),
    ],
    [true, false, false]
  )

  // ══════════ AE. Into matching, what to show, and the Expo Mission ══════════

  const helixRecord = medicaFixtureRecords()[0]
  const helixListing = mapListing(helixRecord, MEDICA_FIELDS)
  const candidate = (() => {
    if (!helixListing.ok) throw new Error('fixture')
    const e = helixListing.exhibitor
    const company: IntelCompany = toCompany({ id: 'c-helix', display_name: e.companyName, name_normalized: 'helix imaging systems', website_domain: 'helix-imaging.invalid', country: e.country, description_public: e.companyDescription, categories: e.companyCategories })
    const presence = toPresence({ id: 'p-helix', event_id: 'e', company_id: 'c-helix', exhibitor_display_name: e.companyName, hall: e.hall, stand: e.stand, event_categories: e.eventCategories, event_description: null, products_services: e.productsServices, listing_url: e.listingUrl, status: 'listed', first_seen_at: 'x', last_seen_at: 'x' })
    return { company, presence }
  })()
  const objective: EventObjective = { id: 'o', userId: ctx.OWNER, eventId: 'e', profileId: 'p1', goals: null, sellFocus: [], buyFocus: [], partnerFocus: [], priorityIndustries: [], priorityGeographies: [], notes: null }
  const bare: CompanyIntentProfile = { ...profile, whatWeDo: null }
  const withoutBrain = deterministicMatchEngine.score({ profile: bare, objective, candidate })
  const brainFacts = combineFacts(read, websiteFacts, inferred).map((f, i) => stored(f, `x${i}`, 'confirmed'))
  const projection = projectBrainForMatching(bare, brainFacts)
  const withBrain = deterministicMatchEngine.score({ profile: projection.profile, objective, candidate })
  const customer = withBrain.find((m) => m.matchType === 'customer')
  check(
    'AE1 the brief’s example, with the real engine: "aluminium components for medical equipment" finds Helix Imaging (diagnostic imaging, medical equipment OEM, Germany) as a potential customer only once the owner confirmed what ABC understood',
    [withoutBrain.find((m) => m.matchType === 'customer')?.score ?? 0, Boolean(customer), (customer?.score ?? 0) > (withoutBrain.find((m) => m.matchType === 'customer')?.score ?? 0)],
    [withoutBrain.find((m) => m.matchType === 'customer')?.score ?? 0, true, true]
  )
  check(
    'AE2 and it stays explainable in three parts: TARGET FACTS quoted from the listing, ABC ANALYSIS citing them, YOUR BUSINESS saying whose words matched',
    [
      (customer?.evidence ?? []).some((e) => e.value === 'Medical equipment OEM'),
      (customer?.reasons ?? []).every((r) => r.evidenceIndex.length > 0 && r.evidenceIndex.every((i) => i < (customer?.evidence.length ?? 0))),
      ownerSideOfMatch(customer?.evidence ?? [], projection.termOrigins).some((o) => o.origin !== 'owner'),
      /probability|guarantee|will buy|certain/i.test(JSON.stringify(customer?.reasons ?? [])),
    ],
    [true, true, true, false]
  )
  check('AE3 the matching engine itself is untouched by this iteration', ctx.git('diff', '--name-only', 'HEAD', '--', 'lib/event-intelligence/scoring.ts') + ctx.git('diff', '--name-only', '9a757f9', '--', 'lib/event-intelligence/scoring.ts'), '')
  check(
    'AE4 matching a whole fair with the brain is the same deterministic function: two runs, one answer',
    JSON.stringify(matchEvent(projection.profile, objective, [candidate.presence], new Map([[candidate.company.id, candidate.company]]))) === JSON.stringify(matchEvent(projection.profile, objective, [candidate.presence], new Map([[candidate.company.id, candidate.company]]))),
    true
  )
  check(
    'AE5 the match route adds only confirmed brain facts and stamps the version',
    [
      ctx.code('app/api/event-intelligence/match/route.ts').includes('projectBrainForMatching(profile, await loadStoredBrainFacts(supabase, ownerId))'),
      ctx.code('app/api/event-intelligence/match/route.ts').includes('engine_version: engineVersion'),
    ],
    [true, true]
  )

  const products: EventProduct[] = [
    { id: 'pr1', userId: ctx.OWNER, name: 'Aluminium housings', description: 'Housings for CT and MRI systems', productTags: ['imaging'], industryTags: ['medical'], useCaseTags: [], sortOrder: 0 },
    { id: 'pr2', userId: ctx.OWNER, name: 'Heat sinks', description: null, productTags: [], industryTags: [], useCaseTags: [], sortOrder: 1 },
  ]
  const suggestion = suggestWhatToShow(customer?.evidence ?? [], products)
  check(
    'AE6 WHAT TO SHOW: the product whose own words share the most with the listing, with the shared words as the reason; no overlap, no suggestion',
    [suggestion?.productName, (suggestion?.sharedTerms.length ?? 0) > 0, suggestWhatToShow([{ field: 'products', value: 'Orthopaedic implants' }], products)],
    ['Aluminium housings', true, null]
  )
  const missionFacts: MissionFacts = {
    event: { key: 'medica-2026', name: 'MEDICA 2026', startsOn: '2026-11-16', endsOn: '2026-11-19', city: 'Düsseldorf', venue: null },
    today: '2026-10-20',
    setupComplete: true,
    exhibitors: 12,
    matchedCompanies: 3,
    opportunities: [],
    targets: [
      { matchId: 'm1', company: 'Helix Imaging Systems GmbH', hall: '10', stand: 'B21', matchType: 'customer', score: 70, why: 'x', listing: [], targetId: 't1', status: 'saved', priority: 1, met: false, brief: null, suggestedShow: 'Aluminium housings' },
    ],
    meetings: [],
    crmConnected: false,
  }
  const suggested = nextMissionAction(missionFacts)
  const chosen = nextMissionAction({ ...missionFacts, targets: [{ ...missionFacts.targets[0], brief: { status: 'draft', topic: 'Housings', productName: 'Heat sinks' } }] })
  check(
    'AE7 the Expo Mission shows ABC’s suggestion as ABC’s — and the owner’s own choice always wins',
    [suggested.lines.find((l) => l.text === 'Aluminium housings')?.label, chosen.lines.find((l) => l.label === 'Show')?.text, chosen.lines.some((l) => l.label === 'ABC suggests showing')],
    ['ABC suggests showing', 'Heat sinks', false]
  )
  check(
    'AE8 one primary action still: the suggestion is a line, not a second button',
    [suggested.stage, suggested.primary.kind, suggested.primary.label],
    ['prepare_target', 'link', 'Prepare this conversation']
  )
  check(
    'AE9 TARGET ≠ ENCOUNTER, INVITATION ≠ MEETING: nothing new writes contacts, encounters, targets or briefs',
    [
      'lib/event-intelligence/source-run.ts',
      'lib/event-intelligence/product-brain.ts',
      'lib/event-intelligence/brain-data.ts',
      'lib/event-intelligence/what-to-show.ts',
      'lib/event-intelligence/website/crawl.ts',
      'app/api/event-intelligence/brain/route.ts',
    ].filter((file) => /scanned_contacts|contact_encounters|intel_meeting_targets|intel_meeting_briefs|insert into public\.(scanned|contact)/.test(ctx.code(file))),
    []
  )
  check(
    'AE10 no new navigation, and every screen added since the Mission is owner-only progressive disclosure',
    [
      ctx.git('diff', '--name-only', '--diff-filter=A', '9a757f9', '--', 'app').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).filter((f) => f.endsWith('page.tsx')),
      ctx.git('diff', '--name-only', '9a757f9', '--', 'components/layout', 'app/home/page.tsx'),
    ],
    [
      /*
        The benchmark (§17) is the one screen added since the Expo Mission, and
        deliberately so: checking ABC's work is the owner's own business, reached
        by a quiet link on the fair's overview. The navigation itself is still
        untouched, which is what the second half of this check holds.
      */
      ['app/events/intelligence/[eventKey]/benchmark/page.tsx'],
      '',
    ]
  )
  check(
    'AE11 the Expo Mission never shows the engine: no source health, runs, crawl or provider on the mission or Home card',
    /source[_ ]health|intel_source_runs|crawl|provider|apify|robots/i.test(ctx.code('components/event-intelligence/MissionView.tsx') + ctx.code('components/event-intelligence/ExpoMissionCard.tsx')),
    false
  )
  check(
    'AE12 the brain and the engine live behind the same flag as everything else',
    [ctx.code('app/api/event-intelligence/brain/route.ts').indexOf('requireEventIntelligence') < ctx.code('app/api/event-intelligence/brain/route.ts').indexOf('analyzeOwnerBusiness({'), /NEXT_PUBLIC_/.test(ctx.code('lib/event-intelligence/sources/http.ts') + ctx.code('lib/event-intelligence/sources/apify.ts'))],
    [true, false]
  )
  check('AE13 the new migration is new, additive, and edits nothing that shipped', [ctx.git('ls-tree', '--name-only', '9a757f9', '--', 'supabase/migrations/20260921120000_event_data_engine.sql'), /\bdrop\s+(table|column|constraint)\b|alter\s+table\s+public\.\w+\s+(drop|alter\s+column)/i.test(ctx.code('supabase/migrations/20260921120000_event_data_engine.sql'))], ['', false])
  check('AE14 the edition key still carries the year', [eventEditionKey('MEDICA', 2026), eventEditionKey('MEDICA', 2027)], ['medica-2026', 'medica-2027'])

  // ── The one owner-facing surface: THIS IS HOW ABC UNDERSTANDS YOUR BUSINESS ──

  const card = ctx.code('components/event-intelligence/ProductBrainCard.tsx')
  check(
    'AE15 one card, one concept: the heading, "Looks right" and "Edit", each item labelled with whose words it is',
    [
      card.includes('This is how ABC understands your business'),
      card.includes("'Looks right'"),
      card.includes('>\n                Edit\n') || card.includes('Edit\n'),
      card.includes('{item.label}'),
      card.includes('aria-labelledby="brain-title"'),
    ],
    [true, true, true, true, true]
  )
  check(
    'AE16 no admin surface: no sources, runs, crawl reports, evidence dumps or taxonomy on the card, and no second primary action',
    [
      // The note explaining a refused read is owner-facing copy ("asks AI crawlers not to read it"), not an admin surface.
      /source[_ ]?health|intel_source|crawl|robots|evidence|basis|taxonomy|provider/i.test(
        card.replace(/const WEBSITE_NOTE[\s\S]*?\n}\n/, '').replace(/Reading your website|read my website/gi, '')
      ),
      /variant="gold"|<Button(?![^>]*variant=)/.test(card),
    ],
    [false, false]
  )
  check(
    'AE17 the owner’s own words cannot be removed from the card — only ABC’s reading can; the owner edits their words in the form',
    card.includes("editing && item.origin !== 'owner' && item.id"),
    true
  )
  check(
    'AE18 touch targets and live status: every card control is ≥44px, the busy state is announced, errors are alerts',
    [(card.match(/touch-target/g) ?? []).length >= 1, card.includes('aria-live="polite"'), card.includes('role="alert"'), ctx.code('components/ui/abc/Button.tsx').includes('touch-target')],
    [true, true, true, true]
  )
  check(
    'AE19 the card lives on Refine only — progressive disclosure — not on Home, the mission, or the navigation',
    [
      ctx.code('components/event-intelligence/SetupView.tsx').includes('<ProductBrainCard'),
      /ProductBrainCard/.test(ctx.code('components/event-intelligence/MissionView.tsx') + ctx.code('components/event-intelligence/ExpoMissionCard.tsx') + ctx.code('app/home/page.tsx')),
    ],
    [true, false]
  )
  check(
    'AE20 when the website is not read, the owner is told why rather than shown nothing',
    [card.includes('refused_ai_opt_out'), card.includes('asks AI crawlers not to read it')],
    [true, true]
  )
  void FIXTURE_ORIGIN
}

// ─────────────────────────── scale ───────────────────────────

export type EngineScaleRow = { rows: number; runMs: number; refreshMs: number; statements: number; refreshStatements: number; brainMs: number }

/** Source runs at fair scale, local PGlite only — never a statement about hosted Supabase. */
export async function measureEngineScale(ctx: SuiteContext, sizes: number[]): Promise<EngineScaleRow[]> {
  const out: EngineScaleRow[] = []
  for (const rows of sizes) {
    const { db } = await ctx.freshDatabase()
    const counter = { statements: 0 }
    const store = ctx.pgliteIngestStore(db, counter)
    const runs = pgliteRunStore(ctx, db)
    const records = generatedRecords(rows)
    const clk = ticker('2026-10-01T00:00:00Z')
    const adapter = () => medicaFixtureAdapter(() => records, { pageSize: 500, maxPages: 20 }).adapter
    const t0 = performance.now()
    const run = await runEventSource(adapter(), MEDICA_REF, { ingestStore: store, runStore: runs, now: clk })
    const runMs = Math.round(performance.now() - t0)
    const statements = counter.statements
    counter.statements = 0
    const t1 = performance.now()
    const refresh = await runEventSource(adapter(), MEDICA_REF, { ingestStore: store, runStore: runs, now: clk })
    const refreshMs = Math.round(performance.now() - t1)
    if (run.status !== 'published' || refresh.status !== 'published') throw new Error(`scale run ${rows} not published`)
    const t2 = performance.now()
    const profile: CompanyIntentProfile = { id: 'p', userId: ctx.OWNER, companyName: null, whatWeDo: null, whatWeSell: ['Aluminium housings'], whatWeBuy: [], whoWeWantToMeet: null, targetIndustries: [], targetCompanyTypes: [], capabilities: [], technologies: [], materials: [], certifications: [], geographies: [] }
    const facts = interpretOwnerStatements([{ field: 'x', text: 'We sell precision aluminium components for medical equipment. We are looking for OEM customers and distributors in DACH.' }]).map((f, i) => ({ ...f, id: `s${i}`, status: 'confirmed' as const }))
    projectBrainForMatching(profile, facts)
    const brainMs = Math.round(performance.now() - t2)
    out.push({ rows, runMs, refreshMs, statements, refreshStatements: counter.statements, brainMs })
  }
  return out
}
