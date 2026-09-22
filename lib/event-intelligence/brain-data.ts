import type { SupabaseClient } from '@supabase/supabase-js'
import type { createServerComponentClient } from '@/lib/supabase-server'
import { loadIntentProfile, loadProducts } from '@/lib/event-intelligence/data'
import {
  BRAIN_FACT_KINDS,
  BRAIN_VERSION,
  assembleBrain,
  brainSummary,
  combineFacts,
  extractFromWebsite,
  inferFromFacts,
  interpretOwnerStatements,
  ownerFacts,
  planBrainWrite,
  type AnalysisRule,
  type BrainEvidence,
  type BrainFact,
  type BrainFactKind,
  type BrainSummary,
  type OwnerAccount,
  type OwnerStatement,
  type StoredBrainFact,
} from '@/lib/event-intelligence/product-brain'
import { checkUrl, createPoliteFetcher, type PoliteFetcher } from '@/lib/event-intelligence/sources/http'
import { crawlCompanySite, type CrawlReport } from '@/lib/event-intelligence/website/crawl'

/**
 * The Product Brain, read and written.
 *
 * Reads go through the owner's own client, so RLS is doing its job, and every
 * query also filters on `user_id`. Writes of what ABC read and concluded go
 * through the service role — `authenticated` may only confirm or reject — and
 * every written row is stamped with the owner id the caller took from the
 * session. Nothing here accepts an owner id from a request body.
 */

type Row = Record<string, unknown>
type Client = SupabaseClient | ReturnType<typeof createServerComponentClient>

const FACT_COLUMNS = 'id, kind, value, value_key, origin, basis, evidence, status'

const KINDS = new Set<string>(BRAIN_FACT_KINDS)

function toEvidence(value: unknown): BrainEvidence[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((e): e is Row => Boolean(e) && typeof e === 'object')
    .map((e) => ({
      source: (['owner_profile', 'owner_product', 'owner_statement', 'website', 'document'].includes(String(e.source))
        ? e.source
        : 'document') as BrainEvidence['source'],
      field: String(e.field ?? ''),
      quote: String(e.quote ?? ''),
      ...(typeof e.url === 'string' ? { url: e.url } : {}),
      ...(typeof e.pageKind === 'string' ? { pageKind: e.pageKind as BrainEvidence['pageKind'] } : {}),
      ...(typeof e.retrievedAt === 'string' ? { retrievedAt: e.retrievedAt } : {}),
    }))
}

export function toBrainFact(row: Row): StoredBrainFact | null {
  const kind = String(row.kind)
  if (!KINDS.has(kind)) return null
  const origin = row.origin === 'analysis' ? 'analysis' : 'source'
  return {
    id: String(row.id),
    kind: kind as BrainFactKind,
    value: String(row.value),
    key: String(row.value_key),
    origin,
    basis: origin === 'analysis' ? ((row.basis as AnalysisRule | null) ?? null) : null,
    evidence: toEvidence(row.evidence),
    status: row.status === 'confirmed' ? 'confirmed' : row.status === 'rejected' ? 'rejected' : 'proposed',
  }
}

export async function loadStoredBrainFacts(supabase: Client, ownerId: string): Promise<StoredBrainFact[]> {
  const { data, error } = await supabase
    .from('intel_brain_facts')
    .select(FACT_COLUMNS)
    .eq('user_id', ownerId)
    .order('kind', { ascending: true })
    .order('value_key', { ascending: true })
  if (error) {
    console.error('[event-intelligence/brain] fact query failed:', error.code ?? 'unknown')
    return []
  }
  return ((data ?? []) as Row[]).map(toBrainFact).filter((f): f is StoredBrainFact => Boolean(f))
}

type AccountRow = OwnerAccount & { productDescription: string | null; idealCustomer: string | null }

async function loadAccount(supabase: Client, ownerId: string): Promise<AccountRow> {
  const { data, error } = await supabase
    .from('abc_profiles')
    .select('company, website, product_description, icp')
    .eq('id', ownerId)
    .maybeSingle()
  if (error || !data) return { company: null, website: null, productDescription: null, idealCustomer: null }
  const row = data as Row
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  return {
    company: text(row.company),
    website: text(row.website),
    productDescription: text(row.product_description),
    idealCustomer: text(row.icp),
  }
}

async function objectiveGoals(supabase: Client, ownerId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('intel_event_objectives')
    .select('goals')
    .eq('user_id', ownerId)
    .order('updated_at', { ascending: false })
    .limit(5)
  if (error) return []
  return [...new Set(((data ?? []) as Row[]).map((r) => (typeof r.goals === 'string' ? r.goals.trim() : '')).filter(Boolean))]
}

/** Everything the owner has written that the brain reads — all of it already in ABC. */
export async function loadBrainInputs(supabase: Client, ownerId: string) {
  const [profile, products, account, goals] = await Promise.all([
    loadIntentProfile(supabase, ownerId),
    loadProducts(supabase, ownerId),
    loadAccount(supabase, ownerId),
    objectiveGoals(supabase, ownerId),
  ])
  const statements: OwnerStatement[] = [
    { field: 'what_we_do', text: profile?.whatWeDo ?? '' },
    { field: 'who_we_want_to_meet', text: profile?.whoWeWantToMeet ?? '' },
    { field: 'abc_profile.product_description', text: account.productDescription ?? '' },
    { field: 'abc_profile.icp', text: account.idealCustomer ?? '' },
    ...goals.map((text) => ({ field: 'event goals', text })),
  ].filter((s) => s.text)
  return { profile, products, account, statements }
}

export type BrainView = {
  facts: BrainFact[]
  summary: BrainSummary
  website: string | null
  lastReadAt: string | null
}

export async function loadBrainView(supabase: Client, ownerId: string): Promise<BrainView> {
  const [{ profile, products, account }, stored, last] = await Promise.all([
    loadBrainInputs(supabase, ownerId),
    loadStoredBrainFacts(supabase, ownerId),
    lastDocumentRead(supabase, ownerId),
  ])
  const facts = assembleBrain(ownerFacts(profile, products, account), stored)
  return { facts, summary: brainSummary(facts), website: account.website, lastReadAt: last }
}

async function lastDocumentRead(supabase: Client, ownerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('intel_brain_documents')
    .select('retrieved_at')
    .eq('user_id', ownerId)
    .order('retrieved_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return String((data as Row).retrieved_at)
}

/** How soon the same owner may ask ABC to read a website again. */
export const ANALYSIS_COOLDOWN_MS = 10 * 60 * 1000

/**
 * Whether the website was read, and if not, why — so the owner is told the
 * true thing. `refused_ai_opt_out` is common: many sites ask AI crawlers to
 * stay out, and ABC honours that on the owner's own site too, because it
 * cannot know the person asking is the site's owner.
 */
export type WebsiteRead = 'read' | 'not_attempted' | 'refused_ai_opt_out' | 'refused_robots' | 'failed'

export type AnalysisResult =
  | { ok: true; view: BrainView; crawl: CrawlReport | null; websiteRead: WebsiteRead; written: { inserted: number; updated: number; removed: number } }
  | { ok: false; code: 'cooldown' | 'invalid_website' | 'write_failed' }

/**
 * Read the owner's website (if there is one) and what they wrote, derive the
 * brain, and store ABC's part of it as proposals.
 *
 * `session` reads as the owner; `service` writes ABC's findings, stamped with
 * `ownerId`, which the caller must have taken from the session.
 */
export async function analyzeOwnerBusiness(input: {
  session: Client
  service: SupabaseClient
  ownerId: string
  website?: string | null
  fetcher?: PoliteFetcher
  now?: () => Date
  crawl?: { maxPages?: number; timeBudgetMs?: number }
}): Promise<AnalysisResult> {
  const now = input.now ?? (() => new Date())
  const { session, service, ownerId } = input
  const { profile, products, account, statements } = await loadBrainInputs(session, ownerId)

  const rawSite = (input.website ?? account.website ?? '').trim()
  const website = rawSite ? (/^https?:\/\//i.test(rawSite) ? rawSite : `https://${rawSite}`) : null
  if (website && !checkUrl(website).ok) return { ok: false, code: 'invalid_website' }

  if (website) {
    const last = await lastDocumentRead(session, ownerId)
    if (last && now().getTime() - new Date(last).getTime() < ANALYSIS_COOLDOWN_MS) return { ok: false, code: 'cooldown' }
  }

  const stored = await loadStoredBrainFacts(service, ownerId)
  const owner = ownerFacts(profile, products, account)

  let crawlReport: CrawlReport | null = null
  let websiteFacts: BrainFact[] = []
  let pages: Awaited<ReturnType<typeof crawlCompanySite>> | null = null
  if (website) {
    pages = await crawlCompanySite(website, {
      fetcher: input.fetcher ?? createPoliteFetcher(),
      maxPages: input.crawl?.maxPages,
      timeBudgetMs: input.crawl?.timeBudgetMs,
    })
    crawlReport = pages.report
    if (pages.ok) websiteFacts = extractFromWebsite(pages.pages)
  }
  if (!pages || !pages.ok) {
    // A site that could not be read this time has not changed its mind: keep what it said before.
    websiteFacts = stored.filter((f) => f.status !== 'rejected' && f.evidence.every((e) => e.source === 'website'))
  }

  const read = combineFacts(websiteFacts, interpretOwnerStatements(statements))
  const derived = combineFacts(read, inferFromFacts([...owner, ...read]))
  const plan = planBrainWrite(derived, stored, owner)
  const stamp = now().toISOString()

  const factRow = (f: BrainFact) => ({
    user_id: ownerId,
    kind: f.kind,
    value: f.value.slice(0, 300),
    value_key: f.key,
    origin: f.origin,
    basis: f.origin === 'analysis' ? f.basis : null,
    evidence: f.evidence,
    status: 'proposed',
    decided_at: null,
    extractor_version: BRAIN_VERSION,
    updated_at: stamp,
  })

  try {
    if (pages?.ok && pages.pages.length > 0) {
      const { error } = await service.from('intel_brain_documents').upsert(
        pages.pages.map((page) => ({
          user_id: ownerId,
          document_kind: 'website_page',
          url: page.url,
          title: page.content.title,
          page_kind: page.kind,
          content_hash: page.contentHash,
          extractor_version: BRAIN_VERSION,
          retrieved_at: page.retrievedAt,
        })),
        { onConflict: 'user_id,url' }
      )
      if (error) throw error
    }
    if (plan.insert.length > 0) {
      const { error } = await service.from('intel_brain_facts').insert(plan.insert.map(factRow))
      if (error) throw error
    }
    for (const f of plan.update) {
      const { error } = await service
        .from('intel_brain_facts')
        .update({ evidence: f.evidence, origin: f.origin, basis: f.origin === 'analysis' ? f.basis : null, extractor_version: BRAIN_VERSION, updated_at: stamp })
        .eq('user_id', ownerId)
        .eq('id', f.id)
      if (error) throw error
    }
    if (plan.remove.length > 0) {
      const { error } = await service.from('intel_brain_facts').delete().eq('user_id', ownerId).in('id', plan.remove)
      if (error) throw error
    }
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : 'unknown'
    console.error('[event-intelligence/brain] write failed:', code)
    return { ok: false, code: 'write_failed' }
  }

  return {
    ok: true,
    view: await loadBrainView(session, ownerId),
    crawl: crawlReport,
    websiteRead: !pages
      ? 'not_attempted'
      : pages.ok
        ? 'read'
        : pages.code === 'robots_ai_opt_out'
          ? 'refused_ai_opt_out'
          : pages.code === 'robots_disallowed'
            ? 'refused_robots'
            : 'failed',
    written: { inserted: plan.insert.length, updated: plan.update.length, removed: plan.remove.length },
  }
}

/**
 * The owner's decision: "Looks right" confirms every open proposal; rejecting
 * one fact removes it from their brain and keeps it from being proposed again.
 *
 * Through the owner's own client. The grant lets `authenticated` write
 * status, decided_at and updated_at and nothing else, so this cannot change
 * what ABC read — only whether the owner agrees with it.
 */
export async function decideBrainFacts(
  session: Client,
  ownerId: string,
  decision: 'confirm' | 'reject',
  factIds: string[] | 'all_proposed',
  now: Date = new Date()
): Promise<{ ok: boolean; changed: number }> {
  let query = session
    .from('intel_brain_facts')
    .update({ status: decision === 'confirm' ? 'confirmed' : 'rejected', decided_at: now.toISOString(), updated_at: now.toISOString() })
    .eq('user_id', ownerId)
  if (factIds === 'all_proposed') query = query.eq('status', 'proposed')
  else if (factIds.length === 0) return { ok: true, changed: 0 }
  else query = query.in('id', factIds)
  const { data, error } = await query.select('id')
  if (error) {
    console.error('[event-intelligence/brain] decision failed:', error.code ?? 'unknown')
    return { ok: false, changed: 0 }
  }
  return { ok: true, changed: ((data ?? []) as Row[]).length }
}
