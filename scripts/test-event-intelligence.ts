/**
 * ABC Event & Expo Intelligence regression suite.
 *
 * Run with `npm run test:event-intelligence` from the repository root.
 *
 * Same convention as the other suites: a standalone file executed by `tsx`,
 * behavioural wherever the code can be called, source-level only where a
 * browser would be needed. Security is proved against a real Postgres — PGlite
 * applies `schema.sql` and every migration, and the isolation checks run as the
 * actual `authenticated` and `anon` roles with a JWT subject set, so an RLS
 * policy or a missing REVOKE fails here rather than in production.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'

import { eventKeyFromName } from '@/lib/events/workspace'
import { eventIntelligenceEnabled, EVENT_INTELLIGENCE_FLAG } from '@/lib/event-intelligence/flag'
import {
  FIXTURE_EVENT,
  FIXTURE_EXHIBITORS,
} from '@/lib/event-intelligence/fixtures/abc-industrial-future-expo'
import {
  ingestEvent,
  planIngest,
  resolveCompanyIdentity,
  type CompanyRecord,
  type IngestStore,
} from '@/lib/event-intelligence/ingest'
import { parseEventObjective, parseIntentProfile, parseList } from '@/lib/event-intelligence/intent'
import {
  BRIEF_STATUS_HINT,
  BRIEF_STATUS_LABEL,
  UPLOAD_SUPPORTED,
  briefStatusFor,
  buildShareText,
  canMarkReady,
  emailHandoffUrl,
  eventPhaseOn,
  firstPartyNotice,
  materialVisible,
  parseMaterial,
  parseProduct,
  safeMaterialUrl,
  whatsappHandoffUrl,
  type ShareInput,
} from '@/lib/event-intelligence/profile'
import {
  RESERVED_EVENT_KEYS,
  eventEditionKey,
  isReservedEventKey,
  resolveEventEdition,
} from '@/lib/event-intelligence/event-identity'
import {
  buildImportPreview,
  importableExhibitors,
  markAlreadyImported,
} from '@/lib/event-intelligence/import-preview'
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  parseImport,
  readImportRequest,
} from '@/lib/event-intelligence/import-request'
import { toCompany, toPresence } from '@/lib/event-intelligence/data'
import {
  buildMatchRows,
  filterCounts,
  locationLabel,
  matchesFilter,
  sourceDisplayName,
  sourceFacts,
  type MatchRow,
} from '@/lib/event-intelligence/view'
import {
  EMPTY_PLAN_QUERY,
  applyPlanQuery,
  buildPlan,
  planHalls,
  planSummary,
  planTypeCounts,
  type PlanEntry,
  type PlanGroup,
} from '@/lib/event-intelligence/plan'
import {
  EMPTY_MATCH_QUERY,
  MATCH_PAGE_SIZE,
  MATCH_PAYLOAD_LIMIT,
  applyMatchQuery,
  hallOptions,
  sortMatches,
  typeCounts,
  type MatchSort,
} from '@/lib/event-intelligence/match-query'
import {
  deterministicMatchEngine,
  ENGINE_VERSION,
  matchEvent,
  MIN_SCORE,
  WEAK_SCORE,
} from '@/lib/event-intelligence/scoring'
import { DEMO_EVENT_REF, JsonFixtureProvider } from '@/lib/event-intelligence/providers/json-fixture'
import {
  DatasetEventProvider,
  parseCsvDataset,
  parseCsvRows,
  parseJsonDataset,
} from '@/lib/event-intelligence/providers/import-file'
import {
  contentHash,
  normalizeCompanyName,
  normalizeDomain,
  sourceList,
  sourceText,
  terms,
  termsOfAll,
} from '@/lib/event-intelligence/normalize'
import {
  displayTargetStatus,
  type CompanyIntentProfile,
  type EventObjective,
  type MatchType,
  type MeetingTarget,
  type StoredMatch,
} from '@/lib/event-intelligence/types'

const ROOT = process.cwd()
let passed = 0
const failures: string[] = []

function check(label: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    passed++
    return
  }
  failures.push(`${label}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`)
}

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*--.*$/gm, '')

const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()

const MIGRATION = 'supabase/migrations/20260919120000_event_expo_intelligence.sql'

/**
 * The release this feature branched from.
 *
 * Checks that assert "nothing that shipped was touched" compare against this
 * rather than against the working tree, so they keep meaning the same thing
 * however many commits the feature branch grows.
 */
const BASE_REF = 'origin/release-final-blocker-fixes'

/** The presence columns, spelled once. */
const PRESENCE_SQL =
  'id, event_id, company_id, exhibitor_display_name, hall, stand, event_categories, event_description, products_services, listing_url, status, first_seen_at, last_seen_at'

/*
  The same pinned set the account-deletion suite keeps, for the same reasons:
  no Realtime publication, no unaccent, no storage.objects, and two files applied
  to production by hand out of order. Pinned rather than ignored, so this suite
  also notices a migration that starts failing for a new reason.
*/
const ENVIRONMENT_ONLY = [
  '20260624160000_enrichment_status.sql',
  '20260628160000_salesforce_data_model.sql',
  '20260708160000_scan_status.sql',
  '20260722160000_profile_username.sql',
  '20260723160000_clean_legacy_usernames.sql',
  '20260810200000_enrichment_status_realtime.sql',
  '20260816120000_card_media_bucket_and_policies.sql',
  '20260918120000_card_media_no_public_listing.sql',
]

const OWNER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

const INTEL_OWNER_TABLES = [
  'intel_company_profiles',
  'intel_event_objectives',
  'intel_matches',
  'intel_meeting_targets',
]

/*
  The Smart Event Profile's own owner-scoped tables. Listed apart from
  INTEL_OWNER_TABLES because that list drives the per-row isolation loop below,
  which seeds exactly one row in each — these four are seeded in their own
  section instead. Both lists together are what the schema-wide checks use.
*/
const INTEL_PROFILE_TABLES = [
  'intel_brief_materials',
  'intel_event_materials',
  'intel_meeting_briefs',
  'intel_products',
]

const INTEL_PUBLIC_TABLES = [
  'intel_companies',
  'intel_company_presences',
  'intel_events',
  'intel_source_records',
]

// ─────────────────────────── DATABASE ───────────────────────────

async function freshDatabase(): Promise<{ db: PGlite; skipped: string[] }> {
  const db = new PGlite()
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;

    -- Supabase's own default privileges: every new table in public is handed to
    -- all three API roles. The migrations revoke from there, and if one forgets
    -- to, the privilege checks below are what notice.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `)

  await db.exec(read('supabase/schema.sql').replace(/create extension[^;]+;/i, ''))
  await db.exec('alter table public.abc_profiles add column if not exists card_bio text')

  const skipped: string[] = []
  for (const file of fs.readdirSync(path.join(ROOT, 'supabase/migrations')).sort()) {
    try {
      await db.exec(read(`supabase/migrations/${file}`))
    } catch {
      skipped.push(file)
    }
  }
  return { db, skipped }
}

type Role = 'service_role' | 'authenticated' | 'anon'

/** One statement under a role, in its own transaction so nothing interleaves. */
async function asRole<T = Record<string, unknown>>(
  db: PGlite,
  role: Role | null,
  sql: string,
  params: unknown[] = [],
  sub?: string
) {
  return db.transaction(async (tx) => {
    if (sub) await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [sub])
    if (role) await tx.exec(`set local role ${role}`)
    return tx.query<T>(sql, params)
  })
}

/** Did this statement fail, and with what? '' means it succeeded. */
async function refusal(
  db: PGlite,
  role: Role,
  sql: string,
  params: unknown[] = [],
  sub?: string
): Promise<string> {
  try {
    await asRole(db, role, sql, params, sub)
    return ''
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/permission denied/i.test(message)) return 'permission denied'
    if (/violates row-level security/i.test(message)) return 'rls'
    if (/violates foreign key constraint/i.test(message)) return 'foreign key'
    if (/violates check constraint/i.test(message)) return 'check'
    if (/duplicate key|violates unique constraint/i.test(message)) return 'unique'
    return message.slice(0, 80)
  }
}

const rowsOf = async <T = Record<string, unknown>>(db: PGlite, sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows

/** An account with a profile, one contact and one encounter of their own. */
async function seedAccount(db: PGlite, owner: string, tag: string) {
  await db.query('insert into auth.users (id, email) values ($1, $2)', [owner, `${tag}@example.test`])
  // A trigger in the release already creates the profile row for a new auth
  // user, so this fills it in rather than insisting on inserting it.
  await db.query(
    'insert into public.abc_profiles (id, full_name) values ($1, $2) on conflict (id) do update set full_name = excluded.full_name',
    [owner, `${tag} person`]
  )

  const contact = (
    await rowsOf<{ id: string }>(
      db,
      "insert into public.scanned_contacts (user_id, name, company) values ($1, $2, 'Acme') returning id",
      [owner, `${tag} contact`]
    )
  )[0].id

  const encounter = (
    await rowsOf<{ id: string }>(
      db,
      "insert into public.contact_encounters (contact_id, user_id, event) values ($1, $2, 'ABC Industrial Future Expo') returning id",
      [contact, owner]
    )
  )[0].id

  return { contact, encounter }
}

/** The whole private chain for one owner: profile, objective, match, target. */
async function seedIntel(db: PGlite, owner: string, eventId: string, presenceId: string) {
  const profile = (
    await rowsOf<{ id: string }>(
      db,
      "insert into public.intel_company_profiles (user_id, company_name, what_we_do) values ($1, 'Owner Co', 'CNC aluminium parts') returning id",
      [owner]
    )
  )[0].id

  const objective = (
    await rowsOf<{ id: string }>(
      db,
      "insert into public.intel_event_objectives (user_id, event_id, profile_id, goals) values ($1, $2, $3, 'Find robot makers') returning id",
      [owner, eventId, profile]
    )
  )[0].id

  const match = (
    await rowsOf<{ id: string }>(
      db,
      "insert into public.intel_matches (user_id, objective_id, presence_id, match_type, score, engine_version) values ($1, $2, $3, 'customer', 88, 'test') returning id",
      [owner, objective, presenceId]
    )
  )[0].id

  const target = (
    await rowsOf<{ id: string }>(
      db,
      "insert into public.intel_meeting_targets (user_id, match_id, event_id, presence_id, private_note) values ($1, $2, $3, $4, 'ask about housings') returning id",
      [owner, match, eventId, presenceId]
    )
  )[0].id

  return { profile, objective, match, target }
}

/**
 * The ingest store over PGlite.
 *
 * A second implementation of `IngestStore`, so the orchestration in
 * `ingest.ts` — resolution order, idempotency, provenance, withdrawal — is
 * driven against a real Postgres with the real constraints, indexes and
 * privileges from the migration.
 *
 * Batched like the Supabase one, and counted: `counter.statements` is how the
 * suite asserts that importing 2,000 exhibitors does not issue 16,000
 * statements. Each write takes the whole set as one jsonb parameter, because
 * unnest() flattens a 2-D array and so cannot carry a per-row text[].
 */
function pgliteIngestStore(db: PGlite, counter?: { statements: number }): IngestStore {
  const count = () => {
    if (counter) counter.statements++
  }

  const COMPANY_COLUMNS =
    'id, display_name, name_normalized, website_domain, country, description_public, categories, merge_candidate_of'

  const toCompanyRecord = (row: Record<string, unknown>): CompanyRecord => ({
    id: String(row.id),
    displayName: String(row.display_name ?? ''),
    nameNormalized: String(row.name_normalized ?? ''),
    websiteDomain: (row.website_domain as string | null) ?? null,
    country: (row.country as string | null) ?? null,
    descriptionPublic: (row.description_public as string | null) ?? null,
    categories: Array.isArray(row.categories) ? (row.categories as string[]) : [],
    mergeCandidateOf: (row.merge_candidate_of as string | null) ?? null,
  })

  const companiesWhere = async (column: string, cast: string, values: string[]): Promise<CompanyRecord[]> => {
    if (values.length === 0) return []
    count()
    const rows = await rowsOf(
      db,
      `select ${COMPANY_COLUMNS} from public.intel_companies where ${column} = any($1::${cast}[])`,
      [values]
    )
    return rows.map(toCompanyRecord)
  }

  const json = (rows: unknown[]) => JSON.stringify(rows)

  return {
    async upsertEvent(input) {
      count()
      const rows = await rowsOf<{ id: string }>(
        db,
        `insert into public.intel_events (event_key, name, edition_year, organizer, venue, city, country, starts_on, ends_on, website_url)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict (event_key) do update set
           name = excluded.name, edition_year = excluded.edition_year, organizer = excluded.organizer,
           venue = excluded.venue, city = excluded.city, country = excluded.country,
           starts_on = excluded.starts_on, ends_on = excluded.ends_on, website_url = excluded.website_url,
           updated_at = now()
         returning id`,
        [
          input.eventKey, input.name, input.editionYear, input.organizer, input.venue,
          input.city, input.country, input.startsOn, input.endsOn, input.websiteUrl,
        ]
      )
      return { id: rows[0].id }
    },

    findCompaniesByDomains: (domains) => companiesWhere('website_domain', 'text', domains),
    findCompaniesByNames: (names) => companiesWhere('name_normalized', 'text', names),
    findCompaniesByIds: (ids) => companiesWhere('id', 'uuid', ids),

    async findPresencesForEvent(eventId) {
      count()
      const rows = await rowsOf<{ id: string; company_id: string }>(
        db,
        'select id, company_id from public.intel_company_presences where event_id = $1',
        [eventId]
      )
      return rows.map((row) => ({ id: row.id, companyId: row.company_id }))
    },

    async findPresenceSources(provider, providerRecordIds, payloadVersion) {
      if (providerRecordIds.length === 0) return []
      count()
      const rows = await rowsOf<{ provider_record_id: string; content_hash: string; entity_id: string }>(
        db,
        `select provider_record_id, content_hash, entity_id
           from public.intel_source_records
          where provider = $1 and payload_version = $2 and entity_type = 'presence'
            and provider_record_id = any($3::text[])`,
        [provider, payloadVersion, providerRecordIds]
      )
      return rows.map((row) => ({
        providerRecordId: row.provider_record_id,
        contentHash: row.content_hash,
        entityId: row.entity_id,
      }))
    },

    async insertCompanies(rows) {
      if (rows.length === 0) return
      count()
      await db.query(
        `insert into public.intel_companies
           (id, display_name, name_normalized, website_domain, country, description_public, categories, merge_candidate_of)
         select t.id, t.display_name, t.name_normalized, t.website_domain, t.country, t.description_public,
                coalesce(array(select jsonb_array_elements_text(t.categories)), '{}')::text[],
                t.merge_candidate_of
           from jsonb_to_recordset($1::jsonb) as t(
             id uuid, display_name text, name_normalized text, website_domain text,
             country text, description_public text, categories jsonb, merge_candidate_of uuid)`,
        [
          json(
            rows.map((r) => ({
              id: r.id,
              display_name: r.displayName,
              name_normalized: r.nameNormalized,
              website_domain: r.websiteDomain,
              country: r.country,
              description_public: r.descriptionPublic,
              categories: r.categories,
              merge_candidate_of: r.mergeCandidateOf,
            }))
          ),
        ]
      )
    },

    async updateCompanies(rows) {
      if (rows.length === 0) return
      count()
      await db.query(
        `update public.intel_companies c set
           display_name = t.display_name,
           name_normalized = t.name_normalized,
           website_domain = t.website_domain,
           country = t.country,
           description_public = t.description_public,
           categories = coalesce(array(select jsonb_array_elements_text(t.categories)), '{}')::text[],
           merge_candidate_of = t.merge_candidate_of,
           updated_at = now()
         from jsonb_to_recordset($1::jsonb) as t(
           id uuid, display_name text, name_normalized text, website_domain text,
           country text, description_public text, categories jsonb, merge_candidate_of uuid)
         where c.id = t.id`,
        [
          json(
            rows.map((r) => ({
              id: r.id,
              display_name: r.displayName,
              name_normalized: r.nameNormalized,
              website_domain: r.websiteDomain,
              country: r.country,
              description_public: r.descriptionPublic,
              categories: r.categories,
              merge_candidate_of: r.mergeCandidateOf,
            }))
          ),
        ]
      )
    },

    async insertPresences(rows) {
      if (rows.length === 0) return
      count()
      await db.query(
        `insert into public.intel_company_presences
           (id, event_id, company_id, exhibitor_display_name, hall, stand, event_categories,
            event_description, products_services, listing_url, first_seen_at, last_seen_at)
         select t.id, t.event_id, t.company_id, t.exhibitor_display_name, t.hall, t.stand,
                coalesce(array(select jsonb_array_elements_text(t.event_categories)), '{}')::text[],
                t.event_description,
                coalesce(array(select jsonb_array_elements_text(t.products_services)), '{}')::text[],
                t.listing_url, t.seen, t.seen
           from jsonb_to_recordset($1::jsonb) as t(
             id uuid, event_id uuid, company_id uuid, exhibitor_display_name text, hall text, stand text,
             event_categories jsonb, event_description text, products_services jsonb, listing_url text,
             seen timestamptz)`,
        [
          json(
            rows.map((r) => ({
              id: r.id,
              event_id: r.eventId,
              company_id: r.companyId,
              exhibitor_display_name: r.exhibitorDisplayName,
              hall: r.hall,
              stand: r.stand,
              event_categories: r.eventCategories,
              event_description: r.eventDescription,
              products_services: r.productsServices,
              listing_url: r.listingUrl,
              seen: r.lastSeenAt,
            }))
          ),
        ]
      )
    },

    async updatePresences(rows) {
      if (rows.length === 0) return
      count()
      await db.query(
        `update public.intel_company_presences p set
           exhibitor_display_name = t.exhibitor_display_name,
           hall = t.hall,
           stand = t.stand,
           event_categories = coalesce(array(select jsonb_array_elements_text(t.event_categories)), '{}')::text[],
           event_description = t.event_description,
           products_services = coalesce(array(select jsonb_array_elements_text(t.products_services)), '{}')::text[],
           listing_url = t.listing_url,
           status = 'listed',
           last_seen_at = t.seen,
           updated_at = now()
         from jsonb_to_recordset($1::jsonb) as t(
           id uuid, exhibitor_display_name text, hall text, stand text, event_categories jsonb,
           event_description text, products_services jsonb, listing_url text, seen timestamptz)
         where p.id = t.id`,
        [
          json(
            rows.map((r) => ({
              id: r.id,
              exhibitor_display_name: r.exhibitorDisplayName,
              hall: r.hall,
              stand: r.stand,
              event_categories: r.eventCategories,
              event_description: r.eventDescription,
              products_services: r.productsServices,
              listing_url: r.listingUrl,
              seen: r.lastSeenAt,
            }))
          ),
        ]
      )
    },

    async touchPresences(ids, lastSeenAt) {
      if (ids.length === 0) return
      count()
      await db.query(
        "update public.intel_company_presences set last_seen_at = $2, status = 'listed' where id = any($1::uuid[])",
        [ids, lastSeenAt]
      )
    },

    async markMissingPresencesWithdrawn(eventId, fetchedAt) {
      count()
      const rows = await rowsOf<{ id: string }>(
        db,
        `update public.intel_company_presences
            set status = 'withdrawn', updated_at = now()
          where event_id = $1 and status = 'listed' and last_seen_at < $2
          returning id`,
        [eventId, fetchedAt]
      )
      return rows.length
    },

    async recordSources(rows) {
      if (rows.length === 0) return
      count()
      await db.query(
        `insert into public.intel_source_records
           (provider, provider_record_id, payload_version, source_url, entity_type, entity_id,
            content_hash, fetched_at, source_updated_at)
         select t.provider, t.provider_record_id, t.payload_version, t.source_url, t.entity_type,
                t.entity_id, t.content_hash, t.fetched_at, t.source_updated_at
           from jsonb_to_recordset($1::jsonb) as t(
             provider text, provider_record_id text, payload_version text, source_url text,
             entity_type text, entity_id uuid, content_hash text, fetched_at timestamptz,
             source_updated_at timestamptz)
         on conflict (provider, provider_record_id, payload_version) do update set
           source_url = excluded.source_url, entity_type = excluded.entity_type,
           entity_id = excluded.entity_id, content_hash = excluded.content_hash,
           fetched_at = excluded.fetched_at, source_updated_at = excluded.source_updated_at`,
        [
          json(
            rows.map((r) => ({
              provider: r.provider,
              provider_record_id: r.providerRecordId,
              payload_version: r.payloadVersion,
              source_url: r.sourceUrl,
              entity_type: r.entityType,
              entity_id: r.entityId,
              content_hash: r.contentHash,
              fetched_at: r.fetchedAt,
              source_updated_at: r.sourceUpdatedAt,
            }))
          ),
        ]
      )
    },
  }
}

// ─────────────────────────── RUN ───────────────────────────

async function run() {
  // ══════════ A. Feature flag ══════════

  check('A1 the flag is off when the variable is absent', eventIntelligenceEnabled({}), false)
  check('A2 the flag is off when the variable is empty', eventIntelligenceEnabled({ [EVENT_INTELLIGENCE_FLAG]: '' }), false)
  check(
    'A3 only explicit affirmatives enable it',
    ['1', 'true', 'TRUE', ' on ', 'yes'].map((v) => eventIntelligenceEnabled({ [EVENT_INTELLIGENCE_FLAG]: v })),
    [true, true, true, true, true]
  )
  check(
    'A4 anything else is off, so a typo cannot ship the feature',
    ['0', 'false', 'off', 'no', 'enabled', 'ture', 'maybe'].map((v) =>
      eventIntelligenceEnabled({ [EVENT_INTELLIGENCE_FLAG]: v })
    ),
    [false, false, false, false, false, false, false]
  )
  check(
    'A5 the flag is server-only — no NEXT_PUBLIC_ name anywhere in the feature',
    /NEXT_PUBLIC_[A-Z_]*(EVENT_INTEL|INTELLIGENCE)/.test(
      code('lib/event-intelligence/flag.ts') + EVENT_INTELLIGENCE_FLAG
    ),
    false
  )

  // ══════════ B. Normalisation ══════════

  check('B1 legal forms are dropped from a company name', normalizeCompanyName('Helios Motion Systems GmbH'), 'helios motion systems')
  check('B2 accents and punctuation fold, and a dotted legal form is still a legal form', normalizeCompanyName('Vectôr-Bearing Technologies, S.A.'), 'vector bearing technologies')
  check('B2a a legal form written as separate words is left alone rather than guessed at', normalizeCompanyName('Atlas Automation S a r l'), 'atlas automation s a r l')
  check('B3 a legal form that is not a suffix is kept', normalizeCompanyName('Corp Technologies AG'), 'corp technologies')
  check('B4 a name made only of a legal form survives', normalizeCompanyName('GmbH'), 'gmbh')
  check(
    'B5 domains fold to a bare registrable host',
    ['https://www.Example.com/about?x=1', 'example.com', 'WWW.EXAMPLE.COM.'].map((v) => normalizeDomain(v)),
    ['example.com', 'example.com', 'example.com']
  )
  check(
    'B6 a domain that is not a real host is null rather than a guess',
    ['', '   ', 'localhost', 'not a domain', null, undefined].map((v) => normalizeDomain(v)),
    [null, null, null, null, null, null]
  )
  check('B7 a subdomain is not flattened — it may be a different organisation', normalizeDomain('parts.example.com'), 'parts.example.com')
  check('B8 stop words and plurals collapse', terms('Precision Bearings and Motion Solutions'), ['precision', 'bearing', 'motion'])
  check('B9 words ending in ss survive singularisation', terms('stainless brass'), ['stainless', 'brass'])
  check('B10 terms de-duplicate across a list', termsOfAll(['robot grippers', 'Grippers for robots']), ['robot', 'gripper'])
  check(
    'B11 blank-cell conventions become null, so a missing hall stays missing',
    ['', '  ', '-', 'n/a', 'N/A', 'none', 'TBD'].map((v) => sourceText(v)),
    [null, null, null, null, null, null, null]
  )
  check('B12 real source text is preserved as written', sourceText('  Hall  6 '), 'Hall 6')
  check('B13 source lists drop blanks and duplicates, keeping order', sourceList(['Robotics', '', 'robotics', 'n/a', 'Automation']), ['Robotics', 'Automation'])
  check('B14 the content hash is stable across key order', contentHash({ a: 1, b: [2, 3] }) === contentHash({ b: [2, 3], a: 1 }), true)
  check('B15 the content hash changes with the content', contentHash({ a: 1 }) === contentHash({ a: 2 }), false)

  // ══════════ C. Derived target status ══════════

  check('C1 a saved target with no encounter is not met', displayTargetStatus({ status: 'saved', metEncounterId: null }), 'saved')
  check('C2 a planned target with no encounter is not met', displayTargetStatus({ status: 'planned', metEncounterId: null }), 'planned')
  check('C3 met is derived from a linked encounter and nothing else', displayTargetStatus({ status: 'planned', metEncounterId: 'enc-1' }), 'met')
  check('C4 a skipped target that was in fact met reports met', displayTargetStatus({ status: 'skipped', metEncounterId: 'enc-1' }), 'met')

  // ══════════ D. Migration, schema and security ══════════

  const { db, skipped } = await freshDatabase()

  check('D1 every migration applies in PGlite except the pinned environment-only set', skipped, ENVIRONMENT_ONLY)

  const intelTables = await rowsOf<{ table_name: string }>(
    db,
    "select table_name from information_schema.tables where table_schema='public' and table_name like 'intel\\_%' order by table_name"
  )
  check(
    'D2 every table the feature owns exists',
    intelTables.map((r) => r.table_name),
    [...INTEL_PUBLIC_TABLES, ...INTEL_OWNER_TABLES, ...INTEL_PROFILE_TABLES].sort()
  )

  const rls = await rowsOf<{ relname: string; relrowsecurity: boolean }>(
    db,
    "select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname like 'intel\\_%' order by relname"
  )
  check(
    'D3 row-level security is enabled on every one of them',
    rls.filter((r) => !r.relrowsecurity).map((r) => r.relname),
    []
  )

  const ownerColumns = await rowsOf<{ table_name: string }>(
    db,
    "select table_name from information_schema.columns where table_schema='public' and table_name like 'intel\\_%' and column_name = 'user_id' order by table_name"
  )
  check(
    'D4 exactly the private tables carry an owner — the public graph has no user_id to leak',
    ownerColumns.map((r) => r.table_name),
    [...INTEL_OWNER_TABLES, ...INTEL_PROFILE_TABLES].sort()
  )

  // ── Seed two accounts and one shared public event ──

  await seedAccount(db, OWNER, 'owner')
  await seedAccount(db, OTHER, 'other')

  const eventId = (
    await rowsOf<{ id: string }>(
      db,
      "insert into public.intel_events (event_key, name, city, country) values ('abc-industrial-future-expo', 'ABC Industrial Future Expo', 'Berlin', 'DE') returning id"
    )
  )[0].id

  const companyId = (
    await rowsOf<{ id: string }>(
      db,
      "insert into public.intel_companies (display_name, name_normalized, website_domain) values ('NordWerk Robotics', 'nordwerk robotics', 'nordwerk.test') returning id"
    )
  )[0].id

  const presenceId = (
    await rowsOf<{ id: string }>(
      db,
      "insert into public.intel_company_presences (event_id, company_id, hall, stand) values ($1, $2, '6', 'B42') returning id",
      [eventId, companyId]
    )
  )[0].id

  const ownerIntel = await seedIntel(db, OWNER, eventId, presenceId)
  const otherIntel = await seedIntel(db, OTHER, eventId, presenceId)
  const otherEncounter = (
    await rowsOf<{ id: string }>(db, 'select id from public.contact_encounters where user_id = $1', [OTHER])
  )[0].id
  const ownerEncounter = (
    await rowsOf<{ id: string }>(db, 'select id from public.contact_encounters where user_id = $1', [OWNER])
  )[0].id

  // ── Owner isolation ──

  for (const table of INTEL_OWNER_TABLES) {
    const visible = await asRole<{ n: number }>(
      db,
      'authenticated',
      `select count(*)::int as n from public.${table}`,
      [],
      OWNER
    )
    check(`E1 ${table}: an owner sees only their own rows`, visible.rows[0].n, 1)
  }

  check(
    'E2 one account cannot read another account intent',
    (
      await asRole<{ n: number }>(
        db,
        'authenticated',
        'select count(*)::int as n from public.intel_company_profiles where user_id = $1',
        [OTHER],
        OWNER
      )
    ).rows[0].n,
    0
  )

  check(
    'E3 one account cannot edit another account objective',
    (
      await asRole<{ n: number }>(
        db,
        'authenticated',
        "update public.intel_event_objectives set goals = 'hijacked' where id = $1 returning 1 as n",
        [otherIntel.objective],
        OWNER
      )
    ).rows.length,
    0
  )

  check(
    'E4 one account cannot read another account private target note',
    (
      await asRole<{ n: number }>(
        db,
        'authenticated',
        'select count(*)::int as n from public.intel_meeting_targets where id = $1',
        [otherIntel.target],
        OWNER
      )
    ).rows[0].n,
    0
  )

  check(
    'E5 one account cannot delete another account target',
    (
      await asRole(db, 'authenticated', 'delete from public.intel_meeting_targets where id = $1 returning 1', [
        otherIntel.target,
      ], OWNER)
    ).rows.length,
    0
  )

  check(
    'E6 a client cannot name somebody else as the owner of a row it inserts',
    await refusal(
      db,
      'authenticated',
      "insert into public.intel_meeting_targets (user_id, match_id, event_id, presence_id) values ($1, $2, $3, $4)",
      [OTHER, otherIntel.match, eventId, presenceId],
      OWNER
    ),
    'rls'
  )

  // ── The encounter bridge ──

  check(
    'F1 a target can link an encounter its own owner recorded',
    (
      await asRole(
        db,
        'authenticated',
        'update public.intel_meeting_targets set met_encounter_id = $1 where id = $2 returning 1',
        [ownerEncounter, ownerIntel.target],
        OWNER
      )
    ).rows.length,
    1
  )

  check(
    'F2 a target cannot link an encounter belonging to another account',
    await refusal(
      db,
      'authenticated',
      'update public.intel_meeting_targets set met_encounter_id = $1 where id = $2',
      [otherEncounter, ownerIntel.target],
      OWNER
    ),
    'foreign key'
  )

  check(
    "F3 'met' cannot be written as a status — it is only ever derived from a real encounter",
    await refusal(
      db,
      'authenticated',
      "update public.intel_meeting_targets set status = 'met' where id = $1",
      [ownerIntel.target],
      OWNER
    ),
    'check'
  )

  check(
    'F4 nothing in the migration inserts into contact_encounters — a target never creates a meeting',
    /insert\s+into\s+public\.contact_encounters/i.test(code(MIGRATION)),
    false
  )

  const encounterCountBefore = (
    await rowsOf<{ n: number }>(db, 'select count(*)::int as n from public.contact_encounters')
  )[0].n
  check('F5 seeding targets created no encounters (TARGET != ENCOUNTER)', encounterCountBefore, 2)

  // Deleting the contact removes the encounter; the target survives, unlinked.
  await db.query('delete from public.scanned_contacts where user_id = $1', [OWNER])
  const afterUnlink = (
    await rowsOf<{ met_encounter_id: string | null; status: string; private_note: string }>(
      db,
      'select met_encounter_id, status, private_note from public.intel_meeting_targets where id = $1',
      [ownerIntel.target]
    )
  )[0]
  check(
    'F6 deleting the meeting reverts the target instead of destroying the owner private state',
    { linked: afterUnlink.met_encounter_id, status: afterUnlink.status, note: afterUnlink.private_note },
    { linked: null, status: 'saved', note: 'ask about housings' }
  )

  // ── Privileges ──

  check(
    'G1 a client cannot write its own match — a score is ABC conclusion, not a client claim',
    await refusal(
      db,
      'authenticated',
      "insert into public.intel_matches (user_id, objective_id, presence_id, match_type, score, engine_version) values ($1, $2, $3, 'customer', 100, 'forged')",
      [OWNER, ownerIntel.objective, presenceId],
      OWNER
    ),
    'permission denied'
  )

  check(
    'G2 a client cannot rewrite the score of a match it can read',
    await refusal(db, 'authenticated', 'update public.intel_matches set score = 100 where id = $1', [ownerIntel.match], OWNER),
    'permission denied'
  )

  for (const table of INTEL_PUBLIC_TABLES) {
    check(
      `G3 ${table}: a signed-in client cannot write shared reference data`,
      await refusal(db, 'authenticated', `delete from public.${table}`, [], OWNER),
      'permission denied'
    )
  }

  for (const table of [...INTEL_PUBLIC_TABLES, ...INTEL_OWNER_TABLES]) {
    check(
      `G4 ${table}: anon can read nothing`,
      await refusal(db, 'anon', `select count(*) from public.${table}`),
      'permission denied'
    )
  }

  const anonGrants = await rowsOf<{ table_name: string }>(
    db,
    "select distinct table_name from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','PUBLIC') and table_name like 'intel\\_%'"
  )
  check('G5 no grant of any kind reaches anon or PUBLIC', anonGrants.map((r) => r.table_name), [])

  const ownerWritable = await rowsOf<{ column_name: string }>(
    db,
    "select column_name from information_schema.column_privileges where table_schema='public' and table_name='intel_meeting_targets' and grantee='authenticated' and privilege_type='UPDATE' order by column_name"
  )
  check(
    'G6 only the owner decisions are updatable — not which match or fair a target is about',
    ownerWritable.map((r) => r.column_name),
    ['met_encounter_id', 'priority', 'private_note', 'scheduled_for', 'status', 'updated_at']
  )

  // ── Account deletion ──

  const beforeDeletion = await rowsOf<{ n: number }>(
    db,
    `select (select count(*) from public.intel_company_profiles where user_id = $1)
          + (select count(*) from public.intel_event_objectives where user_id = $1)
          + (select count(*) from public.intel_matches where user_id = $1)
          + (select count(*) from public.intel_meeting_targets where user_id = $1) as n`,
    [OWNER]
  )
  check('H1 the owner has intelligence rows before deletion', Number(beforeDeletion[0].n), 4)

  await db.query('select public.remove_account_data($1)', [OWNER])

  const afterDeletion = await rowsOf<{ n: number }>(
    db,
    `select (select count(*) from public.intel_company_profiles where user_id = $1)
          + (select count(*) from public.intel_event_objectives where user_id = $1)
          + (select count(*) from public.intel_matches where user_id = $1)
          + (select count(*) from public.intel_meeting_targets where user_id = $1) as n`,
    [OWNER]
  )
  check('H2 deleting the account removes every intelligence row it owned', Number(afterDeletion[0].n), 0)

  const survivors = await rowsOf<{ n: number }>(
    db,
    `select (select count(*) from public.intel_events)
          + (select count(*) from public.intel_companies)
          + (select count(*) from public.intel_company_presences) as n`
  )
  check('H3 the shared event graph survives — it describes a fair, not an account', Number(survivors[0].n), 3)

  const otherSurvives = await rowsOf<{ n: number }>(
    db,
    'select count(*)::int as n from public.intel_meeting_targets where user_id = $1',
    [OTHER]
  )
  check('H4 the other account keeps its own targets', otherSurvives[0].n, 1)

  // ── Release safety ──

  const migrationSource = code(MIGRATION)
  check(
    'I1 the migration writes nothing to the relationship graph',
    /\b(insert\s+into|update|delete\s+from)\s+public\.(scanned_contacts|contact_encounters|scan_batches|scan_batch_items|crm_\w+|followup_sequences|abc_profiles)\b/i.test(
      migrationSource
    ),
    false
  )
  check(
    'I2 the migration does not redefine remove_account_data — deletion reaches the new tables by cascade',
    /function\s+public\.remove_account_data/i.test(migrationSource),
    false
  )
  /*
    Additive means additive. `--diff-filter=MD` asks only for files that were
    modified or deleted relative to the release, so a new migration does not
    show up here and an edited or renumbered one does — which is the thing that
    would break a deployment that has already applied it.
  */
  check(
    'I3 no migration that shipped was edited or removed on this branch',
    git('diff', '--diff-filter=MD', '--name-only', BASE_REF, '--', 'supabase/migrations')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    []
  )
  check('I4 the feature migration exists and is new', fs.existsSync(path.join(ROOT, MIGRATION)), true)
  check(
    'I5 the feature migration is not part of the release it branched from',
    git('ls-tree', '--name-only', BASE_REF, '--', MIGRATION),
    ''
  )

  // ══════════ J. Ingestion ══════════

  const { db: idb } = await freshDatabase()
  const store = pgliteIngestStore(idb)
  const provider = new JsonFixtureProvider()
  let clock = 0
  const tick = () => new Date(Date.UTC(2026, 8, 20, 0, 0, clock++)).toISOString()

  const first = await ingestEvent(provider, DEMO_EVENT_REF, store, tick)

  check(
    'J1 the synthetic fair imports, and its key is the one the Event Workspace would derive',
    { key: first.eventKey, seen: first.exhibitorsSeen },
    { key: eventKeyFromName(FIXTURE_EVENT.name), seen: FIXTURE_EXHIBITORS.length }
  )

  check(
    'J2 21 listings become 19 companies — two duplicates resolved, the lookalike kept apart',
    { created: first.companiesCreated, matched: first.companiesMatched },
    { created: 19, matched: 2 }
  )

  const nordwerk = await rowsOf<{ n: number }>(
    idb,
    "select count(*)::int as n from public.intel_companies where website_domain = 'nordwerk-robotics.invalid'"
  )
  check('J3 the same company listed twice under different names is one company', nordwerk[0].n, 1)

  const nordwerkPresences = await rowsOf<{ n: number }>(
    idb,
    `select count(*)::int as n from public.intel_company_presences p
       join public.intel_companies c on c.id = p.company_id
      where c.website_domain = 'nordwerk-robotics.invalid'`
  )
  check('J4 and it stands in one place, not two', nordwerkPresences[0].n, 1)

  const vector = await rowsOf<{ country: string | null; merge_candidate_of: string | null }>(
    idb,
    "select country, merge_candidate_of from public.intel_companies where name_normalized = 'vector bearing technologies' order by country"
  )
  check(
    'J5 same name, different country, no domain: kept apart and flagged, never merged',
    { rows: vector.length, countries: vector.map((r) => r.country), flagged: vector.filter((r) => r.merge_candidate_of).length },
    { rows: 2, countries: ['DE', 'US'], flagged: 1 }
  )

  const atlas = await rowsOf<{ n: number }>(
    idb,
    "select count(*)::int as n from public.intel_companies where name_normalized = 'atlas automation'"
  )
  check('J6 same name, same country, neither with a domain: merged into one', atlas[0].n, 1)

  const missing = await rowsOf<{ display: string; hall: string | null; stand: string | null }>(
    idb,
    `select coalesce(p.exhibitor_display_name, c.display_name) as display, p.hall, p.stand
       from public.intel_company_presences p join public.intel_companies c on c.id = p.company_id
      where p.hall is null or p.stand is null order by display`
  )
  check(
    'J7 a hall or stand the source did not give is stored as missing, not invented',
    missing,
    [
      { display: 'Certus Test Laboratories', hall: null, stand: null },
      { display: 'Pallas Handling Systems', hall: '7', stand: null },
    ]
  )

  // count(distinct p.id), because a presence that two listings merged into has
  // two source records and a plain count(*) would report the join, not the rows.
  const provenance = await rowsOf<{ n: number; without: number }>(
    idb,
    `select count(distinct p.id)::int as n,
            count(distinct p.id) filter (where s.id is null)::int as without
       from public.intel_company_presences p
       left join public.intel_source_records s on s.entity_id = p.id and s.entity_type = 'presence'`
  )
  check('J8 every presence is traceable to at least one source record', { presences: provenance[0].n, without: provenance[0].without }, { presences: 19, without: 0 })

  const eventSource = await rowsOf<{ provider: string; source_url: string; fetched_at: string }>(
    idb,
    "select provider, source_url, fetched_at::text from public.intel_source_records where entity_type = 'event'"
  )
  check(
    'J9 the event carries its provider, its source URL and when it was fetched',
    { provider: eventSource[0].provider, url: eventSource[0].source_url, fetched: Boolean(eventSource[0].fetched_at) },
    { provider: 'fixture:abc-industrial-future-expo', url: FIXTURE_EVENT.sourceUrl, fetched: true }
  )

  // ── Re-import: nothing may change ──

  const beforeRerun = await rowsOf<{ snapshot: string }>(
    idb,
    `select md5(string_agg(t.row_text, '|' order by t.row_text)) as snapshot from (
       select concat_ws(':', id::text, event_id::text, company_id::text, hall, stand, event_description, status, updated_at::text) as row_text
         from public.intel_company_presences
     ) t`
  )

  const second = await ingestEvent(provider, DEMO_EVENT_REF, store, tick)

  const afterRerun = await rowsOf<{ snapshot: string }>(
    idb,
    `select md5(string_agg(t.row_text, '|' order by t.row_text)) as snapshot from (
       select concat_ws(':', id::text, event_id::text, company_id::text, hall, stand, event_description, status, updated_at::text) as row_text
         from public.intel_company_presences
     ) t`
  )

  check(
    'J10 importing the same data again creates nothing and updates nothing',
    {
      companiesCreated: second.companiesCreated,
      presencesCreated: second.presencesCreated,
      presencesUpdated: second.presencesUpdated,
      presencesUnchanged: second.presencesUnchanged,
      withdrawn: second.presencesWithdrawn,
    },
    { companiesCreated: 0, presencesCreated: 0, presencesUpdated: 0, presencesUnchanged: 21, withdrawn: 0 }
  )
  check('J11 and no row was rewritten', afterRerun[0].snapshot, beforeRerun[0].snapshot)

  const totals = await rowsOf<{ companies: number; presences: number; sources: number }>(
    idb,
    `select (select count(*) from public.intel_companies)::int as companies,
            (select count(*) from public.intel_company_presences)::int as presences,
            (select count(*) from public.intel_source_records)::int as sources`
  )
  // 22 source records: one per listing, plus one for the event itself.
  check('J12 a second import duplicates no company, presence or source record', totals[0], {
    companies: 19,
    presences: 19,
    sources: 22,
  })

  // ── Refresh: a changed stand, and one exhibitor gone ──

  const movedStand = FIXTURE_EXHIBITORS.map((e) =>
    e.providerRecordId === 'exh-001' ? { ...e, stand: 'B48', sourceUpdatedAt: '2026-10-01T09:00:00.000Z' } : e
  ).filter((e) => e.providerRecordId !== 'exh-030')

  const third = await ingestEvent(
    new JsonFixtureProvider({ event: FIXTURE_EVENT, exhibitors: movedStand }),
    DEMO_EVENT_REF,
    store,
    tick
  )

  check(
    'J13 a refresh updates only what changed and withdraws what is gone',
    { updated: third.presencesUpdated, unchanged: third.presencesUnchanged, withdrawn: third.presencesWithdrawn, created: third.presencesCreated },
    { updated: 1, unchanged: 19, withdrawn: 1, created: 0 }
  )

  const nordwerkStand = await rowsOf<{ stand: string }>(
    idb,
    `select p.stand from public.intel_company_presences p join public.intel_companies c on c.id = p.company_id
      where c.website_domain = 'nordwerk-robotics.invalid'`
  )
  check('J14 the moved stand is the new one', nordwerkStand[0].stand, 'B48')

  const withdrawn = await rowsOf<{ display_name: string; n: number }>(
    idb,
    `select c.display_name, count(*)::int as n from public.intel_company_presences p
       join public.intel_companies c on c.id = p.company_id
      where p.status = 'withdrawn' group by c.display_name`
  )
  check(
    'J15 a withdrawn exhibitor is marked, not deleted — a saved target must not dangle',
    withdrawn,
    [{ display_name: 'Gastro Expo Catering', n: 1 }]
  )

  // ── The seam holds ──

  const ingestSource = code('lib/event-intelligence/ingest.ts')
  check(
    'J16 core ingestion knows nothing about any named provider',
    /apify|scrape|crawler|puppeteer|actor/i.test(ingestSource),
    false
  )
  check(
    'J17 no Apify dependency was added',
    Object.keys({
      ...(JSON.parse(read('package.json')).dependencies ?? {}),
      ...(JSON.parse(read('package.json')).devDependencies ?? {}),
    }).filter((name) => /apify/i.test(name)),
    []
  )
  check(
    'J18 the fixture reaches for no network and no credential',
    /fetch\(|https?:\/\/(?!example\.invalid)|process\.env/.test(
      code('lib/event-intelligence/providers/json-fixture.ts')
    ),
    false
  )
  check(
    'J19 no personal data is ingested — the provider contract has no field for it',
    /\b(email|phone|firstName|lastName|contactName|linkedin)\b/i.test(code('lib/event-intelligence/provider.ts')),
    false
  )

  // ══════════ K. What the owner typed ══════════

  check('K1 a list may be typed with new lines, commas or semicolons', parseList('Bearings\nSeals, Gaskets; Springs'), [
    'Bearings',
    'Seals',
    'Gaskets',
    'Springs',
  ])
  check('K2 pasted bullets lose their bullet', parseList('- Bearings\n• Seals\n* Springs'), ['Bearings', 'Seals', 'Springs'])
  check('K3 duplicates and blanks drop out, order is kept', parseList('Bearings,,bearings, Seals'), ['Bearings', 'Seals'])

  const minimal = parseIntentProfile({ whatWeDo: 'We machine aluminium parts.' })
  check('K4 one answer is enough to get started', minimal.ok && minimal.value.whatWeDo, 'We machine aluminium parts.')

  const sellOnly = parseIntentProfile({ whatWeSell: 'CNC aluminium components' })
  check('K5 what you sell alone is enough too', sellOnly.ok, true)

  const empty = parseIntentProfile({ companyName: 'Nordfeld Precision' })
  check(
    'K6 a profile with nothing to match on is refused, and says why',
    empty.ok === false && empty.error.includes('does, sells or needs'),
    true
  )

  const tooMany = parseIntentProfile({
    whatWeDo: 'Machining',
    whatWeSell: Array.from({ length: 41 }, (_, i) => `Part ${i}`).join('\n'),
  })
  check('K7 an over-long list is refused rather than silently truncated', tooMany.ok === false && /too many entries/.test(tooMany.error), true)

  const longItem = parseIntentProfile({ whatWeDo: 'Machining', whatWeSell: 'x'.repeat(121) })
  check('K8 an over-long entry is refused rather than cut in half', longItem.ok === false && /over 120 characters/.test(longItem.error), true)

  const blankObjective = parseEventObjective({})
  check(
    'K9 an empty objective is a real answer — use the general profile for this fair',
    blankObjective.ok && blankObjective.value.goals,
    null
  )

  const objective = parseEventObjective({ sellFocus: 'Housings\nPrototypes', goals: '  Find customers  ' })
  check('K10 an objective keeps what was written, trimmed', objective.ok && { goals: objective.value.goals, sell: objective.value.sellFocus }, {
    goals: 'Find customers',
    sell: ['Housings', 'Prototypes'],
  })

  // ══════════ L. The feature is off, and honestly so ══════════

  const guard = code('lib/event-intelligence/route-guard.ts')
  check('L1 routes check the flag before the session, so a disabled build cannot be probed', guard.indexOf('eventIntelligenceEnabled') < guard.indexOf('auth.getUser'), true)
  check('L2 a disabled route answers 404, not 403 — the address is not a thing', /status: 404/.test(guard) && !/status: 403/.test(guard), true)
  check(
    'L3 the owner id comes from the session, never from the request body',
    /user\.id/.test(guard) && !/body\.(userId|user_id|ownerId)/.test(guard),
    true
  )

  /*
    Every route file under the namespace, at any depth. It walks rather than
    listing the top level, because a nested route — /import/preview — is exactly
    the kind of surface that gets added later and would otherwise never be
    checked for the flag gate.
  */
  const walkRoutes = (relative: string): string[] => {
    const out: string[] = []
    for (const entry of fs.readdirSync(path.join(ROOT, relative), { withFileTypes: true })) {
      if (entry.isDirectory()) out.push(...walkRoutes(`${relative}/${entry.name}`))
      else if (entry.name === 'route.ts') out.push(`${relative}/${entry.name}`)
    }
    return out
  }
  const intelRoutes = walkRoutes('app/api/event-intelligence')

  check('L4 there is at least one API route to check', intelRoutes.length > 0, true)
  check(
    'L5 every Event Intelligence API route goes through the guard',
    intelRoutes.filter((route) => !code(route).includes('requireEventIntelligence')),
    []
  )

  const intelPages = ['app/events/intelligence/page.tsx']
  for (const dir of fs.readdirSync(path.join(ROOT, 'app/events/intelligence'), { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    const walk = (relative: string) => {
      for (const entry of fs.readdirSync(path.join(ROOT, relative), { withFileTypes: true })) {
        if (entry.isDirectory()) walk(`${relative}/${entry.name}`)
        else if (entry.name === 'page.tsx') intelPages.push(`${relative}/${entry.name}`)
      }
    }
    walk(`app/events/intelligence/${dir.name}`)
  }

  check(
    'L6 every Event Intelligence page is gated by the flag and answers notFound when it is off',
    intelPages.filter((page) => {
      const source = code(page)
      const gated =
        source.includes('eventIntelligenceContext') || source.includes('eventIntelligenceEnabled')
      return !(gated && source.includes('notFound()'))
    }),
    []
  )

  check(
    'L7 the entry point on /events renders nothing when the feature is off',
    code('components/events/EventsListView.tsx').includes('{intelligence ? (') &&
      code('app/events/page.tsx').includes('intelligence={eventIntelligenceEnabled()}'),
    true
  )

  check(
    'L8 no client component reads the flag — it is a server decision',
    fs
      .readdirSync(path.join(ROOT, 'components/event-intelligence'))
      .filter((file) => {
        const source = code(`components/event-intelligence/${file}`)
        return source.includes("'use client'") && source.includes('ABC_EVENT_INTELLIGENCE')
      }),
    []
  )

  check(
    'L9 nothing in the feature imports the AI client — V1 is deterministic',
    fs
      .readdirSync(path.join(ROOT, 'lib/event-intelligence'), { recursive: true } as { recursive: true })
      .filter((entry): entry is string => typeof entry === 'string' && entry.endsWith('.ts'))
      .filter((file) => /@\/lib\/claude|@anthropic-ai/.test(code(`lib/event-intelligence/${file}`))),
    []
  )

  /*
    Two routes hold the service role, and both have a reason that is about
    authority rather than convenience: 'import' writes shared reference data
    that belongs to no account, and 'match' writes scores, which are ABC's
    conclusion and must not be forgeable by the account they are about. Any
    third route appearing here is a finding.
  */
  check(
    'L10 the service role is held only by the routes whose writes are not the owner to make',
    intelRoutes.filter((route) => code(route).includes('createServiceClient')),
    [
      'app/api/event-intelligence/import/commit/route.ts',
      'app/api/event-intelligence/import/route.ts',
      'app/api/event-intelligence/match/route.ts',
    ]
  )
  check(
    'L10a the preview route has no write path at all — it cannot reach the shared graph',
    code('app/api/event-intelligence/import/preview/route.ts').includes('createServiceClient'),
    false
  )

  check(
    'L11 no route reads an owner id from the request — ownership comes from the session',
    intelRoutes.filter((route) =>
      /body\??\.(userId|user_id|ownerId|owner_id)|searchParams\.get\(['"](userId|user_id|ownerId|owner_id)/.test(code(route))
    ),
    []
  )

  // ══════════ M. Matching ══════════

  /*
    A synthetic owner to match the synthetic fair against: a precision machining
    company that sells machined aluminium parts, needs bearings and coating, and
    would like to talk to design offices. Chosen so the three directions have to
    behave differently — if the engine collapsed them into one relevance number,
    several checks below would agree with each other and all of them would fail.
  */
  const DEMO_PROFILE: CompanyIntentProfile = {
    id: 'profile-1',
    userId: OWNER,
    companyName: 'Nordfeld Precision',
    whatWeDo: 'We manufacture precision CNC-machined aluminium parts.',
    whatWeSell: ['CNC aluminium components', 'Machined housings', 'Prototype production'],
    whatWeBuy: ['Special bearings'],
    whoWeWantToMeet: 'Manufacturers of industrial robots, electric motors and automation systems',
    targetIndustries: ['Robotics', 'Electric motors', 'Automation'],
    targetCompanyTypes: ['Machine builders'],
    capabilities: ['CNC machining', 'Aluminium housings'],
    technologies: [],
    materials: ['Aluminium'],
    certifications: [],
    geographies: ['DE'],
  }

  const DEMO_OBJECTIVE: EventObjective = {
    id: 'objective-1',
    userId: OWNER,
    eventId: 'event-1',
    profileId: 'profile-1',
    goals: null,
    sellFocus: [],
    buyFocus: ['Anodising', 'Surface coating'],
    partnerFocus: ['Engineering design', 'Prototyping'],
    priorityIndustries: [],
    priorityGeographies: [],
    notes: null,
  }

  // The real graph, as ingestion left it in section J.
  const presenceRows = await rowsOf(idb, `select ${PRESENCE_SQL} from public.intel_company_presences order by id`)
  const companyRows = await rowsOf(idb, 'select id, display_name, name_normalized, website_domain, country, description_public, categories, merge_candidate_of from public.intel_companies')
  const allPresences = presenceRows.map(toPresence)
  const allCompanies = new Map(companyRows.map((row) => [String(row.id), toCompany(row)]))
  const nameOf = (presenceId: string) => {
    const presence = allPresences.find((p) => p.id === presenceId)
    return presence ? allCompanies.get(presence.companyId)?.displayName ?? '?' : '?'
  }

  const matched = matchEvent(DEMO_PROFILE, DEMO_OBJECTIVE, allPresences, allCompanies)
  // Names are matched loosely because a company keeps whatever the listing
  // called it — 'Helios Motion Systems GmbH', not the tidy form.
  const byCompany = (name: string, type: MatchType) =>
    matched.find((m) => nameOf(m.presenceId).startsWith(name) && m.matchType === type)

  check(
    'M1 the three directions produce different companies, not one list relabelled',
    (['customer', 'supplier', 'partner'] as MatchType[]).map(
      (type) => matched.filter((m) => m.matchType === type).length > 0
    ),
    [true, true, true]
  )

  check(
    'M2 a motor manufacturer that lists machined housings is a customer, not a supplier',
    { customer: Boolean(byCompany('Helios Motion Systems', 'customer')), supplier: Boolean(byCompany('Helios Motion Systems', 'supplier')) },
    { customer: true, supplier: false }
  )

  check(
    'M3 a bearing maker is a supplier, because they sell what the owner said they buy',
    Boolean(byCompany('Vector Bearing Technologies', 'supplier')),
    true
  )

  check(
    'M4 a design office the owner wanted to talk to is a partner',
    Boolean(byCompany('Meridian Engineering Design', 'partner')),
    true
  )

  for (const irrelevant of ['Gastro Expo Catering', 'Industrie Verlag Publishing', 'Brightline Staffing', 'Solaris Facility Services']) {
    check(
      `M5 ${irrelevant} produces no match at all — a non-match is an answer`,
      matched.filter((m) => nameOf(m.presenceId).startsWith(irrelevant)).length,
      0
    )
  }

  const again = matchEvent(DEMO_PROFILE, DEMO_OBJECTIVE, allPresences, allCompanies)
  check('M6 the same inputs produce byte-identical output, every time', JSON.stringify(again), JSON.stringify(matched))

  check(
    'M7 every reason cites evidence — no claim reaches the screen unsupported',
    matched.flatMap((m) => m.reasons.filter((r) => r.evidenceIndex.length === 0)),
    []
  )

  check(
    'M8 every cited evidence index points at real evidence',
    matched.flatMap((m) =>
      m.reasons.flatMap((r) => r.evidenceIndex.filter((i) => !m.evidence[i]))
    ),
    []
  )

  check(
    'M9 evidence quotes the listing verbatim rather than paraphrasing it',
    matched.every((m) =>
      m.evidence.every((e) => {
        const presence = allPresences.find((p) => p.id === m.presenceId)!
        const company = allCompanies.get(presence.companyId)!
        const sourceValues = [
          ...company.categories,
          ...presence.eventCategories,
          ...presence.productsServices,
          company.descriptionPublic,
          presence.eventDescription,
          company.country,
        ].filter(Boolean)
        return sourceValues.includes(e.value)
      })
    ),
    true
  )

  check('M10 no score falls outside 0–100', matched.filter((m) => m.score < 0 || m.score > 100), [])
  check(`M11 nothing below the ${MIN_SCORE} threshold is shown at all`, matched.filter((m) => m.score < MIN_SCORE), [])
  check('M12 the list is ordered strongest first', matched.map((m) => m.score), [...matched.map((m) => m.score)].sort((a, b) => b - a))

  const weakOnes = matched.filter((m) => m.score <= WEAK_SCORE)
  check(
    'M13 a thin match is flagged as thin rather than presented like a strong one',
    weakOnes.every((m) => m.warnings.includes('weak_signal')),
    true
  )
  check('M14 and a strong one is not', matched.filter((m) => m.score > WEAK_SCORE).every((m) => !m.warnings.includes('weak_signal')), true)

  const noStand = matched.find((m) => nameOf(m.presenceId).startsWith('Pallas Handling Systems'))
  check(
    'M15 a missing stand is reported as missing, not filled in',
    noStand ? { hall: noStand.warnings.includes('no_hall'), stand: noStand.warnings.includes('no_stand') } : 'no match',
    { hall: false, stand: true }
  )

  /*
    Certus lists neither hall nor stand. It does not match this owner at all —
    testing services are not something they said they buy — so it is scored
    against an owner who *did* ask for testing, which is the only honest way to
    look at what its warnings say.
  */
  const certus = allPresences.find((p) => nameOf(p.id).startsWith('Certus Test Laboratories'))!
  const certusMatch = deterministicMatchEngine.score({
    profile: { ...DEMO_PROFILE, whatWeBuy: ['Materials testing', 'Certification'] },
    objective: { ...DEMO_OBJECTIVE, buyFocus: [] },
    candidate: { presence: certus, company: allCompanies.get(certus.companyId)! },
  })
  check(
    'M16 neither hall nor stand is reported as two separate absences',
    certusMatch.length > 0
      ? [certusMatch[0].warnings.includes('no_hall'), certusMatch[0].warnings.includes('no_stand')]
      : 'no match',
    [true, true]
  )
  check(
    'M16a an owner who never asked for testing is not sent to a testing lab',
    matched.filter((m) => nameOf(m.presenceId).startsWith('Certus Test Laboratories')).length,
    0
  )

  const withdrawnPresence = allPresences.find((p) => p.status === 'withdrawn')
  check(
    'M17 a withdrawn exhibitor is never suggested — the source already retracted them',
    matched.filter((m) => m.presenceId === withdrawnPresence?.id).length,
    0
  )

  /*
    Geography alone must not make a match. Being in the same country as somebody
    is a coincidence of address, and a list built on it would be the exhibitor
    directory sorted by nationality.
  */
  const geographyOnly = matchEvent(
    { ...DEMO_PROFILE, whatWeDo: 'Zzzqq', whatWeSell: [], whatWeBuy: [], whoWeWantToMeet: null, targetIndustries: [], targetCompanyTypes: [], capabilities: [], materials: [], geographies: ['DE'] },
    { ...DEMO_OBJECTIVE, buyFocus: [], partnerFocus: [] },
    allPresences,
    allCompanies
  )
  check('M18 a shared country on its own is not a reason to meet anybody', geographyOnly, [])

  /*
    The sparse listing. Solaris states almost nothing, so even a profile written
    to match its one word must be told the reasoning had nothing to work from.
  */
  const sparse = allPresences.find((p) => nameOf(p.id).startsWith('Solaris Facility Services'))!
  const sparseMatch = deterministicMatchEngine.score({
    profile: { ...DEMO_PROFILE, whatWeBuy: ['Facility services'], targetIndustries: [] },
    objective: { ...DEMO_OBJECTIVE, buyFocus: [] },
    candidate: { presence: sparse, company: allCompanies.get(sparse.companyId)! },
  })
  check(
    'M19 a listing with nothing in it is flagged sparse if it is shown at all',
    sparseMatch.every((m) => m.warnings.includes('sparse_listing')),
    true
  )

  check(
    'M20 an owner who said nothing gets nothing rather than the whole directory',
    matchEvent(
      { ...DEMO_PROFILE, whatWeDo: null, whatWeSell: [], whatWeBuy: [], whoWeWantToMeet: null, targetIndustries: [], targetCompanyTypes: [], capabilities: [], materials: [], technologies: [], geographies: [] },
      { ...DEMO_OBJECTIVE, buyFocus: [], partnerFocus: [], priorityIndustries: [], priorityGeographies: [], goals: null },
      allPresences,
      allCompanies
    ),
    []
  )

  /*
    The ranking itself, pinned. These are the numbers a reader of the match list
    will see, and they are the whole product: a motor manufacturer that lists
    machined housings should beat a bearing distributor the owner never asked
    about, and a catering company should not appear at all. If a weight changes,
    this is where it becomes visible rather than in somebody's trade-fair week.
  */
  check(
    'M26 the strongest match is the motor manufacturer whose listing names what the owner makes',
    matched.slice(0, 1).map((m) => [nameOf(m.presenceId), m.matchType, m.score]),
    [['Helios Motion Systems GmbH', 'customer', 80]]
  )

  check(
    'M27 the best supplier is the one selling exactly what the owner said they buy',
    matched
      .filter((m) => m.matchType === 'supplier')
      .slice(0, 2)
      .map((m) => [nameOf(m.presenceId), m.score]),
    [
      ['Ferrite Surface Coatings', 58],
      ['Vector Bearing Technologies', 50],
    ]
  )

  check(
    'M28 an owner who named no partnership interest is offered no partners',
    matchEvent({ ...DEMO_PROFILE }, { ...DEMO_OBJECTIVE, partnerFocus: [] }, allPresences, allCompanies).filter(
      (m) => m.matchType === 'partner'
    ),
    []
  )

  check(
    'M29 no reason leads with geography — where a company is registered is not why to meet them',
    matched.filter((m) => m.reasons[0]?.signal === 'geography'),
    []
  )

  check(
    'M21 matching reads the listing and the owner intent, and nothing else',
    /scanned_contacts|contact_encounters|scan_batch|crm_|followup/i.test(code('lib/event-intelligence/scoring.ts')),
    false
  )
  check('M22 the engine is pure — no clock, no randomness, no network', /Date\.now|new Date|Math\.random|fetch\(/.test(code('lib/event-intelligence/scoring.ts')), false)
  check('M23 the score is versioned so a result can be reproduced later', ENGINE_VERSION, 'deterministic-v1')

  check(
    'M24 re-running matching cannot delete a target somebody saved',
    code('app/api/event-intelligence/match/route.ts').includes('protectedIds') &&
      code('app/api/event-intelligence/match/route.ts').includes('intel_meeting_targets'),
    true
  )
  check(
    'M25 matches are written with the service role, never by the client',
    code('app/api/event-intelligence/match/route.ts').includes('createServiceClient'),
    true
  )

  // ══════════ N. The match experience ══════════

  check(
    'N1 a hall and a stand read as one address',
    locationLabel({ hall: '6', stand: 'B42' }),
    'Hall 6 · Stand B42'
  )
  check(
    'N2 a missing stand is said out loud, not left blank',
    locationLabel({ hall: '7', stand: null }),
    'Hall 7 · Stand not listed'
  )
  check(
    'N3 a stand with no hall is the same problem the other way round',
    locationLabel({ hall: null, stand: 'G02' }),
    'Stand G02 · Hall not listed'
  )
  check(
    'N4 neither is stated plainly rather than guessed from the other',
    locationLabel({ hall: null, stand: null }),
    'Location not listed'
  )

  const viewPresences = new Map(allPresences.map((p) => [p.id, p]))
  const storedRows: StoredMatch[] = matched.slice(0, 4).map((m, index) => ({
    ...m,
    id: `match-${index}`,
    userId: OWNER,
    objectiveId: 'objective-1',
    engineVersion: ENGINE_VERSION,
    matchedAt: '2026-09-20T00:00:00.000Z',
  }))

  const savedTarget: MeetingTarget = {
    id: 'target-1',
    userId: OWNER,
    matchId: 'match-1',
    eventId: 'event-1',
    presenceId: storedRows[1].presenceId,
    status: 'saved',
    priority: 1,
    privateNote: 'Ask about housings',
    scheduledFor: null,
    metEncounterId: null,
  }

  const viewRows = buildMatchRows(storedRows, viewPresences, allCompanies, [savedTarget])

  check('N5 every stored match becomes a row', viewRows.length, storedRows.length)
  check('N6 rows are ordered strongest first', viewRows.map((r) => r.score), [...viewRows.map((r) => r.score)].sort((a, b) => b - a))
  check(
    'N7 a saved match is marked saved and carries its target',
    viewRows.filter((r) => r.saved).map((r) => ({ target: r.targetId, priority: r.priority, status: r.status })),
    [{ target: 'target-1', priority: 1, status: 'saved' }]
  )
  check(
    'N8 the row shows one line of reasoning, not the whole analysis',
    viewRows.every((r) => r.headline === null || !r.headline.includes('\n')),
    true
  )

  check('N9 the filters count what they filter', filterCounts(viewRows).all, viewRows.length)
  check(
    'N10 each filter selects only its own kind',
    (['customer', 'supplier', 'partner'] as MatchType[]).map((type) =>
      viewRows.filter((r) => matchesFilter(r, type)).every((r) => r.matchType === type)
    ),
    [true, true, true]
  )
  check(
    'N11 the saved filter selects only saved rows',
    viewRows.filter((r) => matchesFilter(r, 'saved')).map((r) => r.targetId),
    ['target-1']
  )

  /*
    The separation this whole feature stands on: the facts panel is built only
    from stored source values, so no sentence ABC wrote can appear in it.
  */
  const factPresence = allPresences.find((p) => nameOf(p.id).startsWith('NordWerk Robotics'))!
  const factCompany = allCompanies.get(factPresence.companyId)
  const facts = sourceFacts(factPresence, factCompany)
  const sourceValues = new Set([
    ...(factCompany?.categories ?? []),
    ...factPresence.eventCategories,
    ...factPresence.productsServices,
    factCompany?.descriptionPublic,
    factPresence.eventDescription,
    factCompany?.country,
    factCompany?.websiteDomain,
  ])
  check(
    'N12 every value in the facts panel is a value the source actually stored',
    facts.flatMap((f) => f.values).filter((v) => !sourceValues.has(v)),
    []
  )

  const analysisPhrases = matched.flatMap((m) => m.reasons.map((r) => r.statement))
  check(
    'N13 and no sentence ABC wrote leaks into it',
    facts.flatMap((f) => f.values).filter((v) => analysisPhrases.includes(v)),
    []
  )

  const detail = code('components/event-intelligence/MatchDetailView.tsx')
  check('N14 the detail names the listing and the analysis as two different things', detail.includes('From the listing') && detail.includes('ABC analysis'), true)
  check(
    'N15 the analysis section renders reasons with the evidence they rest on',
    detail.includes('evidenceByField') && detail.includes('reason.statement'),
    true
  )
  check(
    'N16 the score is described as fit, never as a prediction',
    // Claim wording, not the disclaimer. The screen is *required* to say "not a
    // prediction that they will buy", so searching for "will buy" would fail on
    // the very sentence that makes the number safe to show.
    /win probability|probability of|likelihood of|chance of clos|conversion rate|close rate/i.test(detail),
    false
  )
  check(
    'N17 and it says so in words on the screen',
    detail.includes('not a prediction that they will buy'),
    true
  )
  check(
    'N18 no conversation prose is fabricated — the deterministic engine writes none',
    /Conversation starter|Questions to ask|I noticed your team/i.test(detail),
    false
  )
  check(
    'N19 the private note says it stays private',
    detail.includes('Never sent anywhere'),
    true
  )
  check(
    'N20 provenance is shown, not hidden',
    detail.includes('Source:') && detail.includes('fetched'),
    true
  )

  const listView = code('components/event-intelligence/MatchList.tsx')
  check('N21 the filter row scrolls rather than overflowing', listView.includes('abc-scroll-x'), true)
  check('N22 rows and controls are full-height touch targets', listView.includes('min-h-[44px]') && listView.includes('h-11'), true)
  for (const [label, src] of [
    ['list', listView],
    ['detail', detail],
    ['event', code('components/event-intelligence/EventIntelligenceView.tsx')],
    ['hub', code('components/event-intelligence/IntelligenceHub.tsx')],
    ['setup', code('components/event-intelligence/SetupView.tsx')],
  ] as const) {
    // `max-w-` and `min-w-` are constraints, not fixed widths.
    check(`N23 ${label} sets no fixed pixel width`, /(?<![a-z-])w-\[\d+px\]/.test(src), false)
    // Truncation is asked of the screens where a name shares a row with
    // something else. A page heading is allowed to wrap onto a second line;
    // a name in a list row beside a score and a button is not.
    if (label === 'list' || label === 'hub') {
      check(`N24 ${label} truncates a long name rather than widening the row`, src.includes('truncate'), true)
    }
  }

  check(
    'N25 a target cannot be set to met through the API',
    code('app/api/event-intelligence/targets/route.ts').includes("['saved', 'planned', 'skipped']"),
    true
  )
  check(
    'N26 the event and stand a target points at are derived, never taken from the client',
    !/body\?\.(eventId|presenceId)/.test(code('app/api/event-intelligence/targets/route.ts')),
    true
  )

  // ══════════ O. The plan ══════════

  const planPresences = new Map(allPresences.map((p) => [p.id, p]))
  const planMatches = new Map(storedRows.map((m) => [m.id, m]))

  const planTargets: MeetingTarget[] = [
    { ...savedTarget, id: 't-a', matchId: 'match-0', presenceId: storedRows[0].presenceId, priority: 2, privateNote: null },
    { ...savedTarget, id: 't-b', matchId: 'match-1', presenceId: storedRows[1].presenceId, priority: 1, privateNote: 'Ask about housings' },
    { ...savedTarget, id: 't-c', matchId: 'match-2', presenceId: storedRows[2].presenceId, priority: 1, privateNote: null },
    { ...savedTarget, id: 't-d', matchId: 'match-3', presenceId: storedRows[3].presenceId, priority: 3, privateNote: null, status: 'skipped' },
  ]

  const plan = buildPlan(planTargets, planPresences, allCompanies, planMatches)

  check(
    'O1 the plan is grouped by the priority the owner set, most important first',
    plan.map((group) => [group.priority, group.entries.length]),
    [[1, 2], [2, 1], [3, 1]]
  )
  check('O2 a priority nobody used is not an empty heading', plan.filter((g) => g.entries.length === 0), [])
  check(
    'O3 every entry says where to go, including when the listing does not know',
    plan.flatMap((g) => g.entries).filter((e) => !e.location),
    []
  )
  check(
    'O4 each entry carries the kind of opportunity and the score it came from',
    plan.flatMap((g) => g.entries).filter((e) => e.matchTypeLabel === null || e.score === null),
    []
  )
  check(
    'O5 the private note travels with the plan',
    plan.flatMap((g) => g.entries).find((e) => e.targetId === 't-b')?.privateNote,
    'Ask about housings'
  )

  const summary = planSummary(plan)
  check('O6 the summary counts what is left to do, not what was skipped', { total: summary.total, remaining: summary.remaining }, { total: 4, remaining: 3 })

  /*
    Hall ordering. A plain string sort puts Hall 10 before Hall 2, which reads
    as a mistake to somebody standing in front of Hall 2.
  */
  const hallTargets: MeetingTarget[] = ['10', '2', null, 'West'].map((hall, index) => ({
    ...savedTarget,
    id: `h-${index}`,
    matchId: `hm-${index}`,
    presenceId: `hp-${index}`,
    priority: 1,
  }))
  const hallPresences = new Map(
    (['10', '2', null, 'West'] as (string | null)[]).map((hall, index) => [
      `hp-${index}`,
      { ...allPresences[0], id: `hp-${index}`, companyId: 'hc', hall, stand: 'A1' },
    ])
  )
  const hallCompanies = new Map([['hc', { ...allCompanies.values().next().value!, id: 'hc', displayName: 'Hall Test' }]])
  const hallPlan = buildPlan(hallTargets, hallPresences, hallCompanies, new Map())
  check(
    'O7 halls sort as numbers, with named and missing halls after them',
    hallPlan[0].entries.map((e) => e.hall),
    ['2', '10', 'West', null]
  )

  const planView = code('components/event-intelligence/PlanView.tsx')
  check('O8 the plan promises no route and no schedule', /optimi[sz]ed route|fastest route|itinerary|we will schedule/i.test(planView), false)
  check('O9 and says so on the screen', planView.includes('not'), true)
  check('O10 the plan is a column of cards, not a table forced onto a phone', /<table|<thead|<tbody/i.test(planView), false)
  check('O11 the plan sets no fixed pixel width', /(?<![a-z-])w-\[\d+px\]/.test(planView), false)
  check(
    'O12 there is no event_plans table — the plan is derived from targets',
    /intel_event_plans|event_plans/.test(code(MIGRATION)),
    false
  )

  // ══════════ P. The encounter bridge ══════════

  /*
    A fresh database, because section H deleted the owner's account to prove the
    cascade. These are the two invariants the whole feature rests on, so they
    run against real Postgres and the real constraints rather than against a
    mock that would agree with whatever the code happened to do.
  */
  const { db: bdb } = await freshDatabase()
  await seedAccount(bdb, OWNER, 'bridge-owner')
  await seedAccount(bdb, OTHER, 'bridge-other')

  const bEvent = (
    await rowsOf<{ id: string }>(
      bdb,
      "insert into public.intel_events (event_key, name) values ('abc-industrial-future-expo', 'ABC Industrial Future Expo') returning id"
    )
  )[0].id
  const bCompany = (
    await rowsOf<{ id: string }>(
      bdb,
      "insert into public.intel_companies (display_name, name_normalized) values ('NordWerk Robotics', 'nordwerk robotics') returning id"
    )
  )[0].id
  const bPresence = (
    await rowsOf<{ id: string }>(
      bdb,
      "insert into public.intel_company_presences (event_id, company_id, hall, stand) values ($1, $2, '6', 'B42') returning id",
      [bEvent, bCompany]
    )
  )[0].id

  const bridgeIntel = await seedIntel(bdb, OWNER, bEvent, bPresence)
  const ownerEnc = (await rowsOf<{ id: string }>(bdb, 'select id from public.contact_encounters where user_id = $1', [OWNER]))[0].id
  const otherEnc = (await rowsOf<{ id: string }>(bdb, 'select id from public.contact_encounters where user_id = $1', [OTHER]))[0].id

  const countOf = async (table: string, owner?: string) =>
    (
      await rowsOf<{ n: number }>(
        bdb,
        owner
          ? `select count(*)::int as n from public.${table} where user_id = $1`
          : `select count(*)::int as n from public.${table}`,
        owner ? [owner] : []
      )
    )[0].n

  const contactsBefore = await countOf('scanned_contacts')
  const encountersBefore = await countOf('contact_encounters')

  check(
    'P1 a target nobody has linked is still only a target',
    (
      await rowsOf<{ status: string; met_encounter_id: string | null }>(
        bdb,
        'select status, met_encounter_id from public.intel_meeting_targets where id = $1',
        [bridgeIntel.target]
      )
    )[0],
    { status: 'saved', met_encounter_id: null }
  )

  check(
    'P2 saving a target created no contact and no meeting (TARGET != ENCOUNTER)',
    { contacts: await countOf('scanned_contacts'), encounters: await countOf('contact_encounters') },
    { contacts: contactsBefore, encounters: encountersBefore }
  )

  check(
    'P3 a meeting the owner really recorded can be linked',
    (
      await asRole(
        bdb,
        'authenticated',
        'update public.intel_meeting_targets set met_encounter_id = $1 where id = $2 returning 1',
        [ownerEnc, bridgeIntel.target],
        OWNER
      )
    ).rows.length,
    1
  )

  check(
    'P4 and linking still creates no person and no meeting',
    { contacts: await countOf('scanned_contacts'), encounters: await countOf('contact_encounters') },
    { contacts: contactsBefore, encounters: encountersBefore }
  )

  check(
    'P5 another account meeting cannot be linked, whatever a route does',
    await refusal(
      bdb,
      'authenticated',
      'update public.intel_meeting_targets set met_encounter_id = $1 where id = $2',
      [otherEnc, bridgeIntel.target],
      OWNER
    ),
    'foreign key'
  )

  /*
    PERSON != ENCOUNTER, still. Meeting the same person at a second fair adds an
    encounter to the contact they already are; it does not add a contact, and
    nothing in this feature makes it one.
  */
  const existingContact = (
    await rowsOf<{ contact_id: string }>(
      bdb,
      'select contact_id from public.contact_encounters where user_id = $1 limit 1',
      [OWNER]
    )
  )[0].contact_id

  await bdb.query(
    "insert into public.contact_encounters (contact_id, user_id, event) values ($1, $2, 'A Second Fair 2027')",
    [existingContact, OWNER]
  )

  check(
    'P6 a second meeting with the same person is a second encounter, not a second contact',
    { contacts: await countOf('scanned_contacts', OWNER), encounters: await countOf('contact_encounters', OWNER) },
    { contacts: 1, encounters: 2 }
  )

  const featureSources = [
    'app/api/event-intelligence/targets/route.ts',
    'app/api/event-intelligence/match/route.ts',
    'app/api/event-intelligence/profile/route.ts',
    'app/api/event-intelligence/objective/route.ts',
    'app/api/event-intelligence/import/route.ts',
    'lib/event-intelligence/data.ts',
    'lib/event-intelligence/ingest.ts',
    'components/event-intelligence/MatchDetailView.tsx',
  ]
    .map((file) => code(file))
    .join('\n')

  check(
    'P7 nothing in the feature writes to the relationship graph',
    /from\('(scanned_contacts|contact_encounters|scan_batches|scan_batch_items)'\)[\s\S]{0,160}\.(insert|upsert|update|delete)\(/.test(
      featureSources
    ),
    false
  )

  check(
    'P8 it only ever reads it',
    /from\('contact_encounters'\)[\s\S]{0,80}\.select\(/.test(code('lib/event-intelligence/data.ts')),
    true
  )

  check(
    'P9 a meeting is offered against the fair it names, by the workspace own rule',
    code('lib/event-intelligence/data.ts').includes('eventKeyFromName') &&
      code('lib/event-intelligence/data.ts').includes('eventDisplayName'),
    true
  )

  check(
    'P10 the detail screen can link a meeting and has no control that would create one',
    code('components/event-intelligence/MatchDetailView.tsx').includes('metEncounterId') &&
      !/create[^\n]{0,20}(encounter|meeting)|new meeting/i.test(
        code('components/event-intelligence/MatchDetailView.tsx')
      ),
    true
  )

  check(
    'P11 unlinking is possible, because somebody will link the wrong meeting',
    code('app/api/event-intelligence/targets/route.ts').includes('patch.met_encounter_id = null'),
    true
  )

  // ══════════ Q. Found in responsive QA, pinned so they stay fixed ══════════

  check(
    'Q1 a source is named for the reader, never by its provider id',
    [sourceDisplayName('fixture:abc-industrial-future-expo'), sourceDisplayName('apify:some-actor'), sourceDisplayName('csv')],
    ['Synthetic demo data', 'Event directory', 'Event directory']
  )
  check(
    'Q2 the detail screen never prints the raw provider id',
    /Source: \{source\.provider\}/.test(code('components/event-intelligence/MatchDetailView.tsx')) ||
      !code('components/event-intelligence/MatchDetailView.tsx').includes('sourceDisplayName(source.provider)'),
    false
  )
  check(
    'Q3 no screen names a scraping vendor',
    ['MatchDetailView', 'MatchList', 'EventIntelligenceView', 'IntelligenceHub', 'PlanView', 'SetupView', 'ImportDemoData', 'RunMatching']
      .filter((file) => /apify|scrap|crawl/i.test(code(`components/event-intelligence/${file}.tsx`))),
    []
  )

  /*
    The app's root font size is 14px on phones, so a rem-based `h-11` renders
    at 38.5px, not 44. Measured at 390px wide; the codebase's answer is the
    px-based `touch-target` utility, and icon-only controls must carry it.
  */
  check(
    'Q4 icon-only controls in the list use the px-based touch target',
    (code('components/event-intelligence/MatchList.tsx').match(/touch-target inline-flex h-11 w-11/g) ?? []).length,
    2
  )
  check(
    'Q5 back links are full-height targets on every screen',
    ['EventIntelligenceView', 'MatchDetailView', 'PlanView', 'SetupView'].filter(
      (file) => !code(`components/event-intelligence/${file}.tsx`).includes('inline-flex min-h-[44px] items-center gap-1.5')
    ),
    []
  )
  check(
    'Q6 customer and supplier are not drawn in the same colour',
    (() => {
      const source = code('components/event-intelligence/MatchList.tsx')
      const tint = (type: string) => source.match(new RegExp(`${type}: '([^']+)'`))?.[1]
      return new Set([tint('customer'), tint('supplier'), tint('partner')]).size
    })(),
    3
  )

  // ══════════ S. Event data from a file (CSV / JSON) ══════════

  check(
    'S1 quoted fields, embedded commas and doubled quotes survive',
    parseCsvRows('name,note\n"Acme, Inc.","He said ""yes"""'),
    [
      ['name', 'note'],
      ['Acme, Inc.', 'He said "yes"'],
    ]
  )
  check(
    'S2 a new line inside quotes is part of the field, not a new row',
    parseCsvRows('name,note\n"Acme","line one\nline two"').length,
    2
  )
  check('S3 CRLF from Windows does not leave a stray carriage return', parseCsvRows('a,b\r\n1,2')[1], ['1', '2'])
  check(
    'S4 Excel UTF-8 BOM does not corrupt the first header',
    parseCsvRows('﻿name,hall')[0][0],
    'name'
  )
  check(
    'S5 a semicolon export is read as a semicolon export',
    parseCsvRows('name;hall;stand\nNordWerk;6;B42')[1],
    ['NordWerk', '6', 'B42']
  )
  check('S6 blank lines are not records', parseCsvRows('a,b\n\n1,2\n\n').length, 2)

  const csv = [
    'Exhibitor Name;Hall;Stand No;Website;Country;Product Groups;Description;Profile URL',
    // The multi-value cell is quoted, because the separator inside it is also
    // the delimiter — which is how Excel writes it, and exactly what a parser
    // that does not honour quotes gets wrong.
    'NordWerk Robotics;6;B42;https://nordwerk-robotics.invalid;DE;"Robotics; Automation";Robotic grippers and modular automation.;https://example.invalid/e/1',
    'Pallas Handling Systems;7;;https://pallas-handling.invalid;DE;Handling technology;Pick-and-place units.;https://example.invalid/e/2',
    ';;;;;;;',
    'No Identity Ltd;4;A1;;DE;Misc;Nothing to identify them by.;',
  ].join('\n')

  const csvResult = parseCsvDataset(csv, FIXTURE_EVENT, 'csv:organiser-export')

  check('S7 a semicolon export with aliased headers parses', csvResult.ok, true)
  if (csvResult.ok) {
    check('S8 two identifiable exhibitors, the blank row ignored', csvResult.dataset.exhibitors.length, 2)
    check(
      'S9 a missing stand stays missing rather than becoming an empty string',
      csvResult.dataset.exhibitors.map((e) => [e.companyName, e.hall, e.stand]),
      [
        ['NordWerk Robotics', '6', 'B42'],
        ['Pallas Handling Systems', '7', null],
      ]
    )
    check(
      'S10 a multi-value cell splits into a list',
      csvResult.dataset.exhibitors[0].eventCategories,
      ['Robotics', 'Automation']
    )
    check(
      'S11 a row with nothing stable to identify it is refused, not numbered',
      csvResult.warnings.some((w) => w.includes('no id, listing URL or website')),
      true
    )
    check(
      'S12 identity comes from the listing URL when there is no id column',
      csvResult.dataset.exhibitors[0].providerRecordId,
      'https://example.invalid/e/1'
    )
  }

  check(
    'S13 a file with no company-name column says which columns it wanted',
    (() => {
      const bad = parseCsvDataset('hall,stand\n6,B42', FIXTURE_EVENT)
      return !bad.ok && bad.error.includes('company')
    })(),
    true
  )
  check(
    'S14 an empty file is refused with a sentence, not a crash',
    (() => {
      const empty = parseCsvDataset('', FIXTURE_EVENT)
      return !empty.ok && empty.error.length > 0
    })(),
    true
  )

  check(
    'S15 malformed JSON is refused with a sentence',
    (() => {
      const bad = parseJsonDataset('{oops', FIXTURE_EVENT)
      return !bad.ok && bad.error.includes('not valid JSON')
    })(),
    true
  )
  const jsonResult = parseJsonDataset(
    JSON.stringify({
      exhibitors: [
        { id: 'x1', name: 'Vector Bearing Technologies', booth: 'F07', hall: '3', products: ['Special bearings'] },
        { name: 'No Id Here' },
        'not an object',
      ],
    }),
    FIXTURE_EVENT,
    'json:upload'
  )
  check('S16 a JSON document is read through the same cleaners', jsonResult.ok, true)
  if (jsonResult.ok) {
    check(
      'S17 aliases are accepted and junk entries dropped',
      jsonResult.dataset.exhibitors.map((e) => [e.companyName, e.stand, e.productsServices]),
      [['Vector Bearing Technologies', 'F07', ['Special bearings']]]
    )
  }

  /*
    The point of the seam: a CSV import goes through the same ingestion, with
    the same dedup, provenance and idempotency, and ABC's core is not told which
    kind of file it came from.
  */
  const { db: cdb } = await freshDatabase()
  const csvStore = pgliteIngestStore(cdb)
  let csvClock = 0
  const csvTick = () => new Date(Date.UTC(2026, 8, 25, 0, 0, csvClock++)).toISOString()

  if (csvResult.ok) {
    const csvProvider = new DatasetEventProvider(csvResult.dataset)
    const firstRun = await ingestEvent(csvProvider, { providerEventId: FIXTURE_EVENT.providerRecordId }, csvStore, csvTick)
    const secondRun = await ingestEvent(csvProvider, { providerEventId: FIXTURE_EVENT.providerRecordId }, csvStore, csvTick)

    check(
      'S18 a CSV import runs through the same ingestion as any other source',
      { companies: firstRun.companiesCreated, presences: firstRun.presencesCreated },
      { companies: 2, presences: 2 }
    )
    check(
      'S19 and re-importing the same file changes nothing',
      { created: secondRun.presencesCreated, updated: secondRun.presencesUpdated, unchanged: secondRun.presencesUnchanged },
      { created: 0, updated: 0, unchanged: 2 }
    )
    check(
      'S20 provenance records the file, not a vendor',
      (
        await rowsOf<{ provider: string }>(
          cdb,
          "select distinct provider from public.intel_source_records where entity_type = 'presence'"
        )
      ).map((r) => r.provider),
      ['csv:organiser-export']
    )
    check(
      'S21 and the reader is told it came from a directory, not from a file format',
      sourceDisplayName('csv:organiser-export'),
      'Event directory'
    )
  }

  check(
    'S22 the file parsers reach for no network and no credential',
    /fetch\(|process\.env|https?:\/\//.test(code('lib/event-intelligence/providers/import-file.ts')),
    false
  )

  // ══════════ T. Event edition identity ══════════

  check(
    'T1 annual editions are distinct when the year is in the name',
    ['Ambiente 2026', 'Ambiente 2027', 'Hannover Messe 2026', 'Hannover Messe 2027'].map((n) => eventEditionKey(n)),
    ['ambiente-2026', 'ambiente-2027', 'hannover-messe-2026', 'hannover-messe-2027']
  )
  check(
    'T2 and distinct when it is not — the year comes from the edition',
    [eventEditionKey('Ambiente', 2026), eventEditionKey('Ambiente', 2027)],
    ['ambiente-2026', 'ambiente-2027']
  )
  check(
    'T3 a year already in the name is not repeated, so the workspace bridge still lands',
    [eventEditionKey('Ambiente 2026', 2026), eventKeyFromName('Ambiente 2026')],
    ['ambiente-2026', 'ambiente-2026']
  )
  check(
    'T4 a number that is not the year does not count as the year',
    eventEditionKey('Hall 6 Expo', 2027),
    'hall-6-expo-2027'
  )
  check(
    'T5 an edition without a year is refused — that is what stops two years becoming one row',
    (() => {
      const result = resolveEventEdition({ name: 'Ambiente' })
      return !result.ok && result.error.includes('year')
    })(),
    true
  )
  check(
    'T6 an edition with no name is refused',
    (() => {
      const result = resolveEventEdition({ editionYear: 2027 })
      return !result.ok
    })(),
    true
  )
  check(
    'T7 a reserved segment cannot become an event key',
    [isReservedEventKey('import'), isReservedEventKey('intelligence'), isReservedEventKey('ambiente-2027')],
    [true, true, false]
  )
  check(
    'T8 every reserved key is a real screen that exists',
    RESERVED_EVENT_KEYS.filter(
      (key) =>
        !fs.existsSync(path.join(ROOT, `app/events/${key}/page.tsx`)) &&
        !fs.existsSync(path.join(ROOT, `app/events/intelligence/${key}/page.tsx`))
    ),
    []
  )

  /*
    Two editions of one fair, in the database, with one company at both. This is
    COMPANY != EVENT PRESENCE stated as data: one company row, two presences,
    each with its own stand, and neither edition's listing disturbing the other.
  */
  const { db: edb } = await freshDatabase()
  const editionStore = pgliteIngestStore(edb)
  let editionClock = 0
  const editionTick = () => new Date(Date.UTC(2026, 9, 1, 0, 0, editionClock++)).toISOString()

  const editionOf = (year: number, stand: string) => ({
    event: {
      providerRecordId: `ambiente-${year}`,
      name: 'Ambiente',
      editionYear: year,
      city: 'Frankfurt',
      country: 'DE',
    },
    exhibitors: [
      {
        providerRecordId: `amb-${year}-nordwerk`,
        companyName: 'NordWerk Robotics',
        website: 'https://nordwerk-robotics.invalid',
        country: 'DE',
        companyDescription: 'Robotic grippers and modular automation equipment.',
        companyCategories: ['Robotics'],
        hall: '6',
        stand,
        eventCategories: ['Robotics'],
        productsServices: ['Robotic grippers'],
      },
    ],
    id: 'csv:upload',
  })

  for (const [year, stand] of [
    [2026, 'B42'],
    [2027, 'C11'],
  ] as const) {
    const dataset = editionOf(year, stand)
    // The key the import flow would compute, not one hand-written here.
    dataset.event.providerRecordId = eventEditionKey(dataset.event.name, year)
    await ingestEvent(
      new DatasetEventProvider({
        ...dataset,
        event: { ...dataset.event, providerRecordId: dataset.event.providerRecordId },
      }),
      { providerEventId: dataset.event.providerRecordId },
      editionStore,
      editionTick
    )
  }

  check(
    'T9 Ambiente 2026 and Ambiente 2027 are two events, not one overwritten row',
    (await rowsOf<{ event_key: string }>(edb, 'select event_key from public.intel_events order by event_key')).map(
      (r) => r.event_key
    ),
    ['ambiente-2026', 'ambiente-2027']
  )
  check(
    'T10 one company exhibiting at both is one company with two presences',
    {
      companies: (await rowsOf<{ n: number }>(edb, 'select count(*)::int as n from public.intel_companies'))[0].n,
      presences: (await rowsOf<{ n: number }>(edb, 'select count(*)::int as n from public.intel_company_presences'))[0].n,
    },
    { companies: 1, presences: 2 }
  )
  check(
    'T11 and each edition keeps its own stand',
    (
      await rowsOf<{ stand: string }>(
        edb,
        `select p.stand from public.intel_company_presences p
           join public.intel_events e on e.id = p.event_id
          order by e.event_key`
      )
    ).map((r) => r.stand),
    ['B42', 'C11']
  )

  // ══════════ U. Import preview and validation ══════════

  const previewExhibitors = [
    { providerRecordId: 'p1', companyName: 'NordWerk Robotics', website: 'https://nordwerk-robotics.invalid', hall: '6', stand: 'B42', companyDescription: 'Robotic grippers and modular automation equipment.', companyCategories: ['Robotics'] },
    { providerRecordId: 'p2', companyName: 'Pallas Handling Systems', website: 'https://pallas-handling.invalid', hall: '7', stand: null, companyDescription: 'Pick-and-place handling equipment for production lines.', companyCategories: ['Handling'] },
    { providerRecordId: 'p3', companyName: 'NordWerk Robotics', website: 'https://nordwerk-robotics.invalid', hall: '6', stand: 'B42', companyDescription: 'Robotic grippers and modular automation equipment.', companyCategories: ['Robotics'] },
    { providerRecordId: 'p4', companyName: 'Sparse Co', website: null, hall: null, stand: null, companyDescription: null, companyCategories: [] },
    { providerRecordId: '', companyName: '', hall: '1', stand: 'A1' },
  ]

  const preview = buildImportPreview(previewExhibitors, ['1 row skipped.'])

  check(
    'U1 a complete row is valid, and nothing about it is a warning',
    preview.records[0].state,
    'valid'
  )
  check(
    'U2 a missing stand is a warning, not a rejection — most real listings have one missing',
    { state: preview.records[1].state, codes: preview.records[1].issues.map((i) => i.code) },
    { state: 'warning', codes: ['no_stand'] }
  )
  check('U3 a repeat of an earlier company is flagged as a duplicate', preview.records[2].duplicateInFile, true)
  check(
    'U4 a row with nothing in it collects warnings but is still importable',
    { state: preview.records[3].state, importable: preview.records[3].state !== 'invalid' },
    { state: 'warning', importable: true }
  )
  check(
    'U5 a row with no company name is invalid and cannot be imported',
    { state: preview.records[4].state, error: preview.records[4].issues.some((i) => i.level === 'error') },
    { state: 'invalid', error: true }
  )
  check(
    'U6 the counts say what will actually be written',
    { total: preview.counts.total, invalid: preview.counts.invalid, duplicate: preview.counts.duplicateInFile, importable: preview.counts.importable },
    { total: 5, invalid: 1, duplicate: 1, importable: 3 }
  )
  check('U7 parser warnings survive into the preview', preview.counts.total > 0 && preview.parserWarnings, ['1 row skipped.'])
  check(
    'U8 only the importable rows are handed to ingestion',
    importableExhibitors(previewExhibitors, preview).map((e) => e.providerRecordId),
    ['p1', 'p2', 'p4']
  )

  const marked = markAlreadyImported(preview, new Set(['nordwerk-robotics.invalid']), new Set())
  check(
    'U9 companies ABC already holds are named as updates rather than new companies',
    { already: marked.counts.alreadyImported, state: marked.records[0].state },
    { already: 2, state: 'warning' }
  )
  check(
    'U10 and they are still imported, because that is how a moved stand arrives',
    marked.counts.importable,
    3
  )

  // ── The request contract ──

  const goodEvent = { name: 'Ambiente', editionYear: 2027, city: 'Frankfurt' }
  check(
    'U11 a format ABC cannot read is refused',
    (() => {
      const result = readImportRequest({ format: 'xlsx', text: 'a', event: goodEvent })
      return !result.ok && result.status === 400
    })(),
    true
  )
  check(
    'U12 an oversized file is refused with its size, not a stack trace',
    (() => {
      const result = readImportRequest({ format: 'csv', text: 'x'.repeat(MAX_IMPORT_BYTES + 1), event: goodEvent })
      return !result.ok && result.status === 413 && /MB/.test(result.error)
    })(),
    true
  )
  check(
    'U13 the provider id is derived from the format, never taken from the client',
    (() => {
      const result = readImportRequest({ format: 'csv', text: 'name\nAcme', event: goodEvent, providerId: 'apify:hacked' })
      return result.ok ? result.request.providerId : 'refused'
    })(),
    'csv:upload'
  )
  check(
    'U14 the event key is computed from the edition, not accepted from the client',
    (() => {
      const result = readImportRequest({ format: 'csv', text: 'name\nAcme', event: { ...goodEvent, eventKey: 'somebody-elses-fair' } })
      return result.ok ? result.request.eventKey : 'refused'
    })(),
    'ambiente-2027'
  )
  check(
    'U15 a file with too many rows is refused before anything is written',
    (() => {
      const rows = ['name,url', ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `Co ${i},https://c${i}.invalid`)].join('\n')
      const read = readImportRequest({ format: 'csv', text: rows, event: goodEvent })
      if (!read.ok) return 'refused at read'
      const parsed = parseImport(read.request)
      return !parsed.ok && /up to/.test(parsed.error) ? 'refused at parse' : 'accepted'
    })(),
    'refused at parse'
  )

  // ══════════ V. Import → match → plan, end to end ══════════

  const { db: vdb } = await freshDatabase()
  await seedAccount(vdb, OWNER, 'slice-owner')
  const sliceStore = pgliteIngestStore(vdb)
  let sliceClock = 0
  const sliceTick = () => new Date(Date.UTC(2026, 9, 5, 0, 0, sliceClock++)).toISOString()

  const sliceCsv = [
    'Company,Hall,Stand,Website,Country,Categories,Description,Profile URL',
    'Helios Motion Systems,6,C18,https://helios-motion.invalid,DE,Electric motors,"Electric motors and servo drives, including machined aluminium motor housings.",https://example.invalid/h',
    'Vector Bearing Technologies,3,F07,https://vector-bearing.invalid,DE,Bearings,"Precision and special bearings for machine tools.",https://example.invalid/v',
    'Gastro Expo Catering,1,E02,https://gastro-expo.invalid,DE,Catering,"Stand catering and hospitality staff.",https://example.invalid/g',
    ',,,,,,,',
  ].join('\n')

  const sliceRead = readImportRequest({ format: 'csv', text: sliceCsv, event: { name: 'Ambiente', editionYear: 2027, city: 'Frankfurt', country: 'DE' } })
  check('V1 the request is accepted', sliceRead.ok, true)

  if (sliceRead.ok) {
    const sliceParsed = parseImport(sliceRead.request)
    check('V2 the CSV parses', sliceParsed.ok, true)

    if (sliceParsed.ok) {
      const slicePreview = buildImportPreview(sliceParsed.dataset.exhibitors, sliceParsed.warnings)
      check(
        'V3 the preview shows three importable companies and no invalid rows',
        { importable: slicePreview.counts.importable, invalid: slicePreview.counts.invalid },
        { importable: 3, invalid: 0 }
      )

      const report = await ingestEvent(
        new DatasetEventProvider({
          event: sliceRead.request.event,
          exhibitors: importableExhibitors(sliceParsed.dataset.exhibitors, slicePreview),
          id: sliceRead.request.providerId,
        }),
        { providerEventId: sliceRead.request.event.providerRecordId },
        sliceStore,
        sliceTick
      )

      check('V4 the import writes the event under its edition key', report.eventKey, 'ambiente-2027')
      check('V5 three companies and three presences', { c: report.companiesCreated, p: report.presencesCreated }, { c: 3, p: 3 })

      // Matching, against the same demo profile used elsewhere.
      const slicePresences = (await rowsOf(vdb, `select ${PRESENCE_SQL} from public.intel_company_presences order by id`)).map(toPresence)
      const sliceCompanies = new Map(
        (await rowsOf(vdb, 'select id, display_name, name_normalized, website_domain, country, description_public, categories, merge_candidate_of from public.intel_companies')).map(
          (row) => [String(row.id), toCompany(row)]
        )
      )
      const sliceMatches = matchEvent(DEMO_PROFILE, DEMO_OBJECTIVE, slicePresences, sliceCompanies)
      const sliceName = (presenceId: string) => {
        const presence = slicePresences.find((p) => p.id === presenceId)
        return presence ? sliceCompanies.get(presence.companyId)?.displayName ?? '?' : '?'
      }

      check(
        'V6 matching an imported list behaves exactly as it does for the fixture',
        sliceMatches.map((m) => [sliceName(m.presenceId), m.matchType]),
        [
          ['Helios Motion Systems', 'customer'],
          ['Vector Bearing Technologies', 'supplier'],
        ]
      )
      check(
        'V7 the caterer imported cleanly and still matches nothing',
        sliceMatches.filter((m) => sliceName(m.presenceId).startsWith('Gastro')).length,
        0
      )
      check(
        'V8 every reason still rests on evidence from the imported listing',
        sliceMatches.flatMap((m) => m.reasons.filter((r) => r.evidenceIndex.length === 0)),
        []
      )

      // Persist a match and save it as a target — the rest of the slice.
      const sliceEventId = (await rowsOf<{ id: string }>(vdb, 'select id from public.intel_events'))[0].id
      const sliceProfile = (await rowsOf<{ id: string }>(vdb, "insert into public.intel_company_profiles (user_id, company_name, what_we_do) values ($1, 'Nordfeld', 'CNC aluminium') returning id", [OWNER]))[0].id
      const sliceObjective = (await rowsOf<{ id: string }>(vdb, 'insert into public.intel_event_objectives (user_id, event_id, profile_id) values ($1, $2, $3) returning id', [OWNER, sliceEventId, sliceProfile]))[0].id
      const topMatch = sliceMatches[0]
      const sliceMatchId = (
        await rowsOf<{ id: string }>(
          vdb,
          "insert into public.intel_matches (user_id, objective_id, presence_id, match_type, score, engine_version, reasons, evidence, warnings) values ($1,$2,$3,$4,$5,'deterministic-v1',$6,$7,$8) returning id",
          [OWNER, sliceObjective, topMatch.presenceId, topMatch.matchType, topMatch.score, JSON.stringify(topMatch.reasons), JSON.stringify(topMatch.evidence), JSON.stringify(topMatch.warnings)]
        )
      )[0].id

      const savedRows = await asRole(
        vdb,
        'authenticated',
        'insert into public.intel_meeting_targets (user_id, match_id, event_id, presence_id, priority) values ($1,$2,$3,$4,1) returning id',
        [OWNER, sliceMatchId, sliceEventId, topMatch.presenceId],
        OWNER
      )
      check('V9 an imported match can be saved to the plan by its owner', savedRows.rows.length, 1)
      check(
        'V10 and saving it created no contact and no meeting (TARGET != ENCOUNTER)',
        {
          contacts: (await rowsOf<{ n: number }>(vdb, 'select count(*)::int as n from public.scanned_contacts where user_id = $1', [OWNER]))[0].n,
          encounters: (await rowsOf<{ n: number }>(vdb, 'select count(*)::int as n from public.contact_encounters where user_id = $1', [OWNER]))[0].n,
        },
        { contacts: 1, encounters: 1 }
      )
      check(
        'V11 provenance survives the whole slice',
        (await rowsOf<{ n: number }>(vdb, "select count(*)::int as n from public.intel_source_records where provider = 'csv:upload'"))[0].n,
        4
      )
    }
  }

  // ══════════ W. Scale ══════════

  /*
    Real trade-fair sizes, not a fixture. Timings are printed rather than
    asserted — a wall-clock threshold on a laptop under load is a flaky test —
    but two things *are* asserted, because they are what actually decides
    whether this works against hosted Postgres:

      * the counts are right at every size, and
      * the number of database statements stays flat as the row count grows.

    The second is the whole point of the batched rewrite. Row-at-a-time was
    ~8 statements per exhibitor; against hosted Postgres each one is a network
    round trip, so 5,000 stands meant ~40,000 of them.
  */
  const buildScaleCsv = (rows: number): string => {
    const out = ['Company,Hall,Stand,Website,Country,Categories,Description,Profile URL']
    for (let i = 0; i < rows; i++) {
      const kind = i % 5
      const category = ['Robotics', 'Electric motors', 'Bearings', 'Catering', 'Publishing'][kind]
      const description = [
        'Robotic grippers and modular automation equipment for industrial manufacturers.',
        'Electric motors, servo drives and machined aluminium motor housings.',
        'Precision and special bearings for machine tools and robotics.',
        'Stand catering, coffee service and hospitality staff.',
        'Trade magazines and industry yearbooks.',
      ][kind]
      out.push(
        `Synthetic Company ${i},${(i % 10) + 1},S${i},https://synthetic-${i}.invalid,DE,${category},"${description}",https://example.invalid/s/${i}`
      )
    }
    return out.join('\n')
  }

  type ScaleResult = {
    rows: number
    parseMs: number
    importMs: number
    reimportMs: number
    matchMs: number
    importStatements: number
    reimportStatements: number
    matches: number
  }

  const scaleResults: ScaleResult[] = []

  for (const rows of [500, 2000, 5000]) {
    const csv = buildScaleCsv(rows)
    const { db: sdb } = await freshDatabase()
    const counter = { statements: 0 }
    const scaleStore = pgliteIngestStore(sdb, counter)
    let scaleClock = 0
    const scaleTick = () => new Date(Date.UTC(2026, 9, 10, 0, 0, scaleClock++)).toISOString()

    const parseStart = Date.now()
    const read = readImportRequest({
      format: 'csv',
      text: csv,
      event: { name: `Scale Test Fair ${rows}`, editionYear: 2027 },
    })
    if (!read.ok) throw new Error(`scale ${rows}: ${read.error}`)
    const parsed = parseImport(read.request)
    if (!parsed.ok) throw new Error(`scale ${rows}: ${parsed.error}`)
    const preview = buildImportPreview(parsed.dataset.exhibitors, parsed.warnings)
    const parseMs = Date.now() - parseStart

    check(`W-${rows}a every row parses and previews as importable`, preview.counts.importable, rows)

    const provider = new DatasetEventProvider({
      event: read.request.event,
      exhibitors: importableExhibitors(parsed.dataset.exhibitors, preview),
      id: read.request.providerId,
    })
    const ref = { providerEventId: read.request.event.providerRecordId }

    counter.statements = 0
    const importStart = Date.now()
    const report = await ingestEvent(provider, ref, scaleStore, scaleTick)
    const importMs = Date.now() - importStart
    const importStatements = counter.statements

    counter.statements = 0
    const reimportStart = Date.now()
    const again = await ingestEvent(provider, ref, scaleStore, scaleTick)
    const reimportMs = Date.now() - reimportStart
    const reimportStatements = counter.statements

    check(
      `W-${rows}b ${rows} companies and ${rows} presences written`,
      { companies: report.companiesCreated, presences: report.presencesCreated },
      { companies: rows, presences: rows }
    )
    check(
      `W-${rows}c a second import of ${rows} rows writes nothing`,
      { created: again.presencesCreated, updated: again.presencesUpdated, unchanged: again.presencesUnchanged },
      { created: 0, updated: 0, unchanged: rows }
    )

    /*
      The ceiling that matters. Statements come from the fixed phases plus one
      per chunk of writes, so they grow with rows/chunk and not with rows. 40 is
      comfortably above what 5,000 rows needs and far below the ~8 per row the
      previous implementation issued.
    */
    check(`W-${rows}d importing ${rows} rows stays under 40 statements`, importStatements <= 40, true)
    check(`W-${rows}e re-importing ${rows} unchanged rows stays under 20`, reimportStatements <= 20, true)

    const presences = (await rowsOf(sdb, `select ${PRESENCE_SQL} from public.intel_company_presences order by id`)).map(toPresence)
    const companies = new Map(
      (
        await rowsOf(
          sdb,
          'select id, display_name, name_normalized, website_domain, country, description_public, categories, merge_candidate_of from public.intel_companies'
        )
      ).map((row) => [String(row.id), toCompany(row)])
    )
    const matchStart = Date.now()
    const matches = matchEvent(DEMO_PROFILE, DEMO_OBJECTIVE, presences, companies)
    const matchMs = Date.now() - matchStart

    check(`W-${rows}f matching ${rows} listings still filters rather than returning everything`, matches.length < rows, true)

    scaleResults.push({
      rows,
      parseMs,
      importMs,
      reimportMs,
      matchMs,
      importStatements,
      reimportStatements,
      matches: matches.length,
    })
  }

  console.log('\n  scale (local PGlite — not hosted Supabase):')
  for (const r of scaleResults) {
    console.log(
      `    ${String(r.rows).padStart(5)} rows · parse ${String(r.parseMs).padStart(5)}ms · import ${String(r.importMs).padStart(5)}ms (${r.importStatements} statements) · re-import ${String(r.reimportMs).padStart(5)}ms (${r.reimportStatements}) · match ${String(r.matchMs).padStart(4)}ms → ${r.matches} matches`
    )
  }

  check(
    'W1 statements stay flat as rows grow — the property hosted Postgres cares about',
    scaleResults[scaleResults.length - 1].importStatements <= scaleResults[0].importStatements * 3,
    true
  )


  // ══════════ X. Match discovery: search, filters, sorting ══════════

  const qRow = (over: Partial<MatchRow>): MatchRow => ({
    matchId: 'm', presenceId: 'p', companyName: 'Acme', matchType: 'customer', score: 50,
    headline: null, location: 'Hall 1 · Stand A1', hasLocation: true, hall: '1', stand: 'A1',
    categories: [], searchText: 'acme', withdrawn: false, weak: false, warnings: [],
    saved: false, targetId: null, priority: null, status: null, ...over,
  })

  const qRows: MatchRow[] = [
    qRow({ matchId: 'a', companyName: 'NordWerk Robotics', matchType: 'customer', score: 80, hall: '6', stand: 'B42', categories: ['Robotics'], searchText: 'nordwerk robotics robotics grippers' }),
    qRow({ matchId: 'b', companyName: 'Vector Bearing Technologies', matchType: 'supplier', score: 50, hall: '3', stand: 'F07', categories: ['Bearings'], searchText: 'vector bearing technologies bearings' }),
    qRow({ matchId: 'c', companyName: 'Meridian Engineering Design', matchType: 'partner', score: 40, hall: '10', stand: null, categories: ['Engineering'], searchText: 'meridian engineering design engineering' }),
    qRow({ matchId: 'd', companyName: 'Atlas Automation', matchType: 'customer', score: 28, hall: '2', stand: 'A03', categories: ['Automation'], searchText: 'atlas automation automation', saved: true, targetId: 't-d' }),
  ]

  check('X1 an empty query returns everything, strongest first', applyMatchQuery(qRows, EMPTY_MATCH_QUERY).map((r) => r.matchId), ['a', 'b', 'c', 'd'])
  check(
    'X2 search matches the company name',
    applyMatchQuery(qRows, { ...EMPTY_MATCH_QUERY, search: 'vector' }).map((r) => r.matchId),
    ['b']
  )
  check(
    'X3 search matches a category or product, not only the name',
    applyMatchQuery(qRows, { ...EMPTY_MATCH_QUERY, search: 'grippers' }).map((r) => r.matchId),
    ['a']
  )
  check(
    'X4 every word must match, so two words narrow rather than widen',
    applyMatchQuery(qRows, { ...EMPTY_MATCH_QUERY, search: 'bearing vector' }).map((r) => r.matchId),
    ['b']
  )
  check('X5 search ignores case and stray spaces', applyMatchQuery(qRows, { ...EMPTY_MATCH_QUERY, search: '  ATLAS  ' }).map((r) => r.matchId), ['d'])
  check(
    'X6 the type filter selects one direction',
    applyMatchQuery(qRows, { ...EMPTY_MATCH_QUERY, type: 'customer' }).map((r) => r.matchId),
    ['a', 'd']
  )
  check(
    'X7 the hall filter selects one hall',
    applyMatchQuery(qRows, { ...EMPTY_MATCH_QUERY, hall: '3' }).map((r) => r.matchId),
    ['b']
  )
  check(
    'X8 "has a stand" hides the ones with nowhere to walk to',
    applyMatchQuery(qRows, { ...EMPTY_MATCH_QUERY, withStandOnly: true }).map((r) => r.matchId),
    ['a', 'b', 'd']
  )
  check(
    'X9 saved only shows what is in the plan',
    applyMatchQuery(qRows, { ...EMPTY_MATCH_QUERY, savedOnly: true }).map((r) => r.matchId),
    ['d']
  )
  check(
    'X10 filters combine',
    applyMatchQuery(qRows, { ...EMPTY_MATCH_QUERY, type: 'customer', withStandOnly: true, search: 'automation' }).map((r) => r.matchId),
    ['d']
  )

  check('X11 sorting by name is alphabetical', applyMatchQuery(qRows, { ...EMPTY_MATCH_QUERY, sort: 'name' }).map((r) => r.companyName[0]), ['A', 'M', 'N', 'V'])
  check(
    'X12 sorting by hall reads 2, 3, 6, 10 — not 10, 2, 3, 6',
    applyMatchQuery(qRows, { ...EMPTY_MATCH_QUERY, sort: 'hall' }).map((r) => r.hall),
    ['2', '3', '6', '10']
  )
  check(
    'X13 a hall the listing never gave sorts last, because it is not a place',
    sortMatches([qRow({ matchId: 'x', hall: null, companyName: 'Zed' }), qRow({ matchId: 'y', hall: '9', companyName: 'Aaa' })], 'hall').map((r) => r.matchId),
    ['y', 'x']
  )
  check(
    'X14 every sort is total, so the list cannot reshuffle between renders',
    (['relevance', 'name', 'hall'] as MatchSort[]).every((sort) => {
      const once = applyMatchQuery(qRows, { ...EMPTY_MATCH_QUERY, sort }).map((r) => r.matchId).join()
      const twice = applyMatchQuery([...qRows].reverse(), { ...EMPTY_MATCH_QUERY, sort }).map((r) => r.matchId).join()
      return once === twice
    }),
    true
  )
  check('X15 sorting does not mutate the caller array', (() => { const before = qRows.map((r) => r.matchId).join(); sortMatches(qRows, 'name'); return qRows.map((r) => r.matchId).join() === before })(), true)

  check(
    'X16 type counts ignore the type filter, so the other chips still guide',
    typeCounts(qRows, { ...EMPTY_MATCH_QUERY, type: 'supplier' }),
    { all: 4, customer: 2, supplier: 1, partner: 1 }
  )
  check(
    'X17 but they do respect the other filters',
    typeCounts(qRows, { ...EMPTY_MATCH_QUERY, withStandOnly: true }),
    { all: 3, customer: 2, supplier: 1, partner: 0 }
  )
  check('X18 hall options are offered in walking order', hallOptions(qRows), ['2', '3', '6', '10'])

  check(
    'X19 the list only hands the browser a bounded number of rows',
    MATCH_PAYLOAD_LIMIT <= 1000 && MATCH_PAGE_SIZE <= 100,
    true
  )
  check(
    'X20 and the page says how many of how many it is showing',
    code('components/event-intelligence/MatchList.tsx').includes('strongest of'),
    true
  )
  check(
    'X21 anything the owner saved is loaded even past the cap',
    code('components/event-intelligence/EventIntelligenceView.tsx').includes('savedBeyondCap'),
    true
  )
  check(
    'X22 search runs on precomputed text rather than lowercasing per keystroke',
    code('lib/event-intelligence/match-query.ts').includes('row.searchText.includes'),
    true
  )
  check(
    'X23 the filter bar offers only dimensions the listing actually holds',
    /trending|recommended for you|popularity|ai rank/i.test(code('components/event-intelligence/MatchList.tsx')),
    false
  )

  // Search and filter controls must be labelled, not just placeheld.
  const listSource = code('components/event-intelligence/MatchList.tsx')
  check('X24 the search box has a real label', listSource.includes('htmlFor="match-search"') && listSource.includes('sr-only'), true)
  check('X25 the selects have labels', listSource.includes('htmlFor="match-hall"') && listSource.includes('htmlFor="match-sort"'), true)
  check('X26 the filter chips report their state to a screen reader', (listSource.match(/aria-pressed/g) ?? []).length >= 3, true)
  check('X27 the chip groups are named', listSource.includes('role="group"') && listSource.includes('aria-label="Filter by what kind of opportunity"'), true)
  check('X28 the result count is announced', listSource.includes('role="status"'), true)

  // ══════════ Y. Event Plan discovery ══════════

  const planEntry = (over: Partial<PlanEntry>): PlanEntry => ({
    targetId: 't', matchId: 'm', companyName: 'Acme', matchType: 'customer', matchTypeLabel: 'Potential customer',
    score: 50, hall: '1', location: 'Hall 1 · Stand A1', hasLocation: true, withdrawn: false,
    status: 'saved', priority: 2, privateNote: null, scheduledFor: null, searchText: 'acme', ...over,
  })

  const planGroups: PlanGroup[] = [
    { priority: 1, label: 'Must meet', entries: [
      planEntry({ targetId: 'p1', companyName: 'Vector Bearing', matchType: 'supplier', hall: '3', score: 50, searchText: 'vector bearing bearings' }),
      planEntry({ targetId: 'p2', companyName: 'NordWerk Robotics', matchType: 'customer', hall: '6', score: 80, searchText: 'nordwerk robotics ask about housings', privateNote: 'Ask about housings' }),
    ] },
    { priority: 2, label: 'Worth meeting', entries: [
      planEntry({ targetId: 'p3', companyName: 'Atlas Automation', matchType: 'customer', hall: '2', score: 28, searchText: 'atlas automation' }),
      planEntry({ targetId: 'p4', companyName: 'Met Already', matchType: 'partner', hall: '2', score: 30, status: 'met', searchText: 'met already' }),
    ] },
  ]

  check(
    'Y1 priority stays the grouping whatever the sort',
    applyPlanQuery(planGroups, { ...EMPTY_PLAN_QUERY, sort: 'name' }).map((g) => g.priority),
    [1, 2]
  )
  check(
    'Y2 sorting by hall orders within the group, not across it',
    applyPlanQuery(planGroups, { ...EMPTY_PLAN_QUERY, sort: 'hall' })[0].entries.map((e) => e.hall),
    ['3', '6']
  )
  check(
    'Y3 a target already met sinks below what is still to do',
    applyPlanQuery(planGroups, { ...EMPTY_PLAN_QUERY, sort: 'name' })[1].entries.map((e) => e.targetId),
    ['p3', 'p4']
  )
  check(
    'Y4 search covers the owner private note, which nobody else can see',
    applyPlanQuery(planGroups, { ...EMPTY_PLAN_QUERY, search: 'housings' }).flatMap((g) => g.entries.map((e) => e.targetId)),
    ['p2']
  )
  check(
    'Y5 filtering by direction empties groups rather than showing empty headings',
    applyPlanQuery(planGroups, { ...EMPTY_PLAN_QUERY, type: 'supplier' }).map((g) => ({ p: g.priority, n: g.entries.length })),
    [{ p: 1, n: 1 }]
  )
  check(
    'Y4a and buildPlan is what folds the note in, not the fixture',
    buildPlan(
      [{ ...savedTarget, id: 'note-t', matchId: 'note-m', presenceId: storedRows[0].presenceId, privateNote: 'Ask about housings' }],
      planPresences,
      allCompanies,
      planMatches
    )[0].entries[0].searchText.includes('housings'),
    true
  )
  check('Y6 hall options come from the plan itself', planHalls(planGroups), ['2', '3', '6'])
  check(
    'Y7 plan type counts ignore the type filter',
    planTypeCounts(planGroups, { ...EMPTY_PLAN_QUERY, type: 'partner' }),
    { all: 4, customer: 2, supplier: 1, partner: 1 }
  )

  const planSource = code('components/event-intelligence/PlanBoard.tsx')
  check('Y8 the plan promises no route and no schedule', /optimi[sz]ed route|fastest route|itinerary|we will schedule|best order to walk/i.test(planSource), false)
  check('Y9 nothing in the plan can mark somebody as met', /set.*status.*met|markAsMet|['"]met['"]\s*:/.test(planSource.replace(/STATUS_LABEL\[[^\]]+\]/g, '')), false)
  check('Y10 a target can be removed, because plans change', planSource.includes('Remove ') && planSource.includes("method: 'DELETE'"), true)
  check('Y11 the plan is cards at every width, never a table', /<table|<thead|<tbody/i.test(planSource), false)
  check('Y12 plan controls are labelled', planSource.includes('htmlFor="plan-search"') && planSource.includes('htmlFor="plan-sort"'), true)
  check('Y13 the plan sets no fixed pixel width', /(?<![a-z-])w-\[\d+px\]/.test(planSource), false)
  check(
    'Y14 the controls only appear once a plan is long enough to need them',
    planSource.includes('total > 6'),
    true
  )


  // ══════════ Z. Smart Event Profile: products, material, briefs ══════════

  check(
    'Z1 ABC can hold images and only links the rest, because the bucket takes images only',
    UPLOAD_SUPPORTED,
    { image: true, video: false, document: false, link: false, offer: false }
  )
  check(
    'Z2 a product needs a name',
    (() => {
      const bad = parseProduct({})
      return !bad.ok && bad.error.length > 0
    })(),
    true
  )
  check(
    'Z3 a product keeps its tags for a later, explicit ordering feature',
    (() => {
      const good = parseProduct({ name: 'Aluminium housings', productTags: 'CNC, aluminium', industryTags: 'Robotics' })
      return good.ok ? [good.value.name, good.value.productTags, good.value.industryTags] : 'refused'
    })(),
    ['Aluminium housings', ['CNC', 'aluminium'], ['Robotics']]
  )

  check(
    'Z4 material needs a title, a kind and a web address',
    [parseMaterial({}).ok, parseMaterial({ title: 'Teaser' }).ok, parseMaterial({ title: 'Teaser', mediaKind: 'video' }).ok],
    [false, false, false]
  )
  check(
    'Z5 a javascript: or data: URL is refused — it would become a link somebody else opens',
    [
      safeMaterialUrl('javascript:alert(1)'),
      safeMaterialUrl('data:text/html,<script>'),
      safeMaterialUrl('file:///etc/passwd'),
      safeMaterialUrl('  example.com/a.pdf '),
    ],
    [null, null, null, 'https://example.com/a.pdf']
  )
  check(
    'Z6 a window that closes before it opens is refused',
    (() => {
      const bad = parseMaterial({
        title: 'Teaser', mediaKind: 'video', url: 'https://example.invalid/v',
        visibleFrom: '2026-11-05T00:00:00Z', visibleUntil: '2026-11-01T00:00:00Z',
      })
      return !bad.ok && /after its start/.test(bad.error)
    })(),
    true
  )

  /* The three moments of a fair, decided from the fair's own dates. */
  const fair = { startsOn: '2026-11-03', endsOn: '2026-11-06' }
  check(
    'Z7 the phase comes from the event dates, not from a guess',
    [
      eventPhaseOn(fair, new Date('2026-10-01T12:00:00Z')),
      eventPhaseOn(fair, new Date('2026-11-04T12:00:00Z')),
      eventPhaseOn(fair, new Date('2026-12-01T12:00:00Z')),
      eventPhaseOn({ startsOn: null, endsOn: null }, new Date('2026-11-04T12:00:00Z')),
    ],
    ['pre', 'live', 'post', null]
  )
  check(
    'Z8 material pinned to a phase shows in that phase and not another',
    [
      materialVisible({ phase: 'pre', visibleFrom: null, visibleUntil: null }, new Date('2026-10-01T12:00:00Z'), 'pre'),
      materialVisible({ phase: 'pre', visibleFrom: null, visibleUntil: null }, new Date('2026-11-04T12:00:00Z'), 'live'),
      materialVisible({ phase: 'any', visibleFrom: null, visibleUntil: null }, new Date('2026-11-04T12:00:00Z'), 'live'),
    ],
    [true, false, true]
  )
  check(
    'Z9 a fair with no dates has no phase, so a phase cannot hide anything',
    materialVisible({ phase: 'live', visibleFrom: null, visibleUntil: null }, new Date('2026-11-04T12:00:00Z'), null),
    true
  )
  check(
    'Z10 an explicit window is honoured on both sides',
    [
      materialVisible({ phase: 'any', visibleFrom: '2026-11-02T00:00:00Z', visibleUntil: null }, new Date('2026-11-01T12:00:00Z'), null),
      materialVisible({ phase: 'any', visibleFrom: null, visibleUntil: '2026-11-02T00:00:00Z' }, new Date('2026-11-03T12:00:00Z'), null),
    ],
    [false, false]
  )

  // ── The brief, and what it refuses to claim ──

  check(
    'Z11 a brief needs a topic and something to show before it is ready',
    [
      canMarkReady({ topic: null, productId: null, materialIds: [] }),
      canMarkReady({ topic: 'Housings', productId: null, materialIds: [] }),
      canMarkReady({ topic: 'Housings', productId: 'p1', materialIds: [] }),
      canMarkReady({ topic: 'Housings', productId: null, materialIds: ['m1'] }),
    ],
    [false, false, true, true]
  )
  check(
    'Z12 there is no status that claims the other side agreed',
    Object.keys(BRIEF_STATUS_LABEL).sort(),
    ['draft', 'ready', 'shared']
  )
  check(
    'Z13 and asking for one is refused',
    ['accepted', 'confirmed', 'scheduled', 'met'].map(
      (s) => briefStatusFor(s, { topic: 'x', productId: 'p', materialIds: [] }).ok
    ),
    [false, false, false, false]
  )
  check(
    'Z14 the shared state says plainly that it is not a reply and not a meeting',
    BRIEF_STATUS_HINT.shared.includes('does not mean they replied') && BRIEF_STATUS_HINT.shared.includes('have met'),
    true
  )
  check(
    'Z15 first-party material is labelled as the owner own claim, not a source fact',
    firstPartyNotice.includes('does not check it') && firstPartyNotice.includes('source fact'),
    true
  )

  // ── Against a real database ──

  const { db: pdb } = await freshDatabase()
  await seedAccount(pdb, OWNER, 'profile-owner')
  await seedAccount(pdb, OTHER, 'profile-other')

  const makeEdition = async (key: string, name: string, year: number) =>
    (
      await rowsOf<{ id: string }>(
        pdb,
        'insert into public.intel_events (event_key, name, edition_year) values ($1,$2,$3) returning id',
        [key, name, year]
      )
    )[0].id

  const amb26 = await makeEdition('ambiente-2026', 'Ambiente', 2026)
  const amb27 = await makeEdition('ambiente-2027', 'Ambiente', 2027)

  const pCompany = (
    await rowsOf<{ id: string }>(
      pdb,
      "insert into public.intel_companies (display_name, name_normalized, website_domain) values ('NordWerk Robotics', 'nordwerk robotics', 'nordwerk.test') returning id"
    )
  )[0].id
  const pPresence26 = (
    await rowsOf<{ id: string }>(
      pdb,
      "insert into public.intel_company_presences (event_id, company_id, hall, stand) values ($1,$2,'6','B42') returning id",
      [amb26, pCompany]
    )
  )[0].id

  const ownerChain = await seedIntel(pdb, OWNER, amb26, pPresence26)
  const otherChain = await seedIntel(pdb, OTHER, amb26, pPresence26)

  const product = (
    await rowsOf<{ id: string }>(
      pdb,
      "insert into public.intel_products (user_id, name) values ($1, 'Aluminium housings') returning id",
      [OWNER]
    )
  )[0].id

  const material26 = (
    await rowsOf<{ id: string }>(
      pdb,
      "insert into public.intel_event_materials (user_id, event_id, product_id, title, media_kind, url, phase) values ($1,$2,$3,'Housings teaser','video','https://example.invalid/v','pre') returning id",
      [OWNER, amb26, product]
    )
  )[0].id

  check(
    'Z16 material made for 2026 does not appear at 2027 — nothing carries forward',
    {
      at2026: (await rowsOf<{ n: number }>(pdb, 'select count(*)::int as n from public.intel_event_materials where event_id = $1', [amb26]))[0].n,
      at2027: (await rowsOf<{ n: number }>(pdb, 'select count(*)::int as n from public.intel_event_materials where event_id = $1', [amb27]))[0].n,
    },
    { at2026: 1, at2027: 0 }
  )

  check(
    'Z17 reusing it at the next edition is an explicit new row',
    (await rowsOf<{ id: string }>(
      pdb,
      "insert into public.intel_event_materials (user_id, event_id, title, media_kind, url) values ($1,$2,'Housings teaser','video','https://example.invalid/v') returning id",
      [OWNER, amb27]
    )).length,
    1
  )

  check(
    'Z18 one account cannot attach another account material to its own product',
    await refusal(
      pdb,
      'authenticated',
      "insert into public.intel_event_materials (user_id, event_id, product_id, title, media_kind, url) values ($1,$2,$3,'Stolen','video','https://example.invalid/x')",
      [OTHER, amb26, product],
      OTHER
    ),
    'foreign key'
  )

  const brief = (
    await rowsOf<{ id: string }>(
      pdb,
      "insert into public.intel_meeting_briefs (user_id, target_id, product_id, topic) values ($1,$2,$3,'Housings for robots') returning id",
      [OWNER, ownerChain.target, product]
    )
  )[0].id

  check(
    'Z19 a brief cannot be filed against another account target',
    await refusal(
      pdb,
      'authenticated',
      "insert into public.intel_meeting_briefs (user_id, target_id, topic) values ($1,$2,'Hijack')",
      [OWNER, otherChain.target],
      OWNER
    ),
    'foreign key'
  )

  check(
    "Z20 'shared' without a moment of sharing is refused by the database",
    await refusal(
      pdb,
      'authenticated',
      "update public.intel_meeting_briefs set status = 'shared' where id = $1",
      [brief],
      OWNER
    ),
    'check'
  )
  check(
    'Z21 and a status the product does not have is refused too',
    await refusal(
      pdb,
      'authenticated',
      "update public.intel_meeting_briefs set status = 'accepted' where id = $1",
      [brief],
      OWNER
    ),
    'check'
  )
  check(
    'Z22 sharing records the moment, and that is all it records',
    (
      await asRole(
        pdb,
        'authenticated',
        "update public.intel_meeting_briefs set status = 'shared', shared_at = now() where id = $1 returning 1",
        [brief],
        OWNER
      )
    ).rows.length,
    1
  )

  /* INVITATION != MEETING, and TARGET != ENCOUNTER, after all of that. */
  const contactsNow = (await rowsOf<{ n: number }>(pdb, 'select count(*)::int as n from public.scanned_contacts where user_id = $1', [OWNER]))[0].n
  const encountersNow = (await rowsOf<{ n: number }>(pdb, 'select count(*)::int as n from public.contact_encounters where user_id = $1', [OWNER]))[0].n
  check('Z23 preparing and sharing created no contact and no meeting', { contacts: contactsNow, encounters: encountersNow }, { contacts: 1, encounters: 1 })
  check(
    'Z24 and the target itself is still only a target',
    (
      await rowsOf<{ status: string; met_encounter_id: string | null }>(
        pdb,
        'select status, met_encounter_id from public.intel_meeting_targets where id = $1',
        [ownerChain.target]
      )
    )[0],
    { status: 'saved', met_encounter_id: null }
  )

  // ── Owner isolation and privileges ──

  for (const table of ['intel_products', 'intel_event_materials', 'intel_meeting_briefs', 'intel_brief_materials']) {
    check(
      `Z25 ${table}: anon can read nothing`,
      await refusal(pdb, 'anon', `select count(*) from public.${table}`),
      'permission denied'
    )
  }

  check(
    'Z26 one account cannot read another account material',
    (
      await asRole<{ n: number }>(
        pdb,
        'authenticated',
        'select count(*)::int as n from public.intel_event_materials',
        [],
        OTHER
      )
    ).rows[0].n,
    0
  )
  check(
    'Z27 nor their meeting briefs',
    (
      await asRole<{ n: number }>(pdb, 'authenticated', 'select count(*)::int as n from public.intel_meeting_briefs', [], OTHER)
    ).rows[0].n,
    0
  )
  check(
    'Z28 ownership itself cannot be edited after the fact',
    (
      await rowsOf<{ column_name: string }>(
        pdb,
        "select column_name from information_schema.column_privileges where table_schema='public' and table_name='intel_meeting_briefs' and grantee='authenticated' and privilege_type='UPDATE' order by column_name"
      )
    ).map((r) => r.column_name),
    ['message', 'product_id', 'shared_at', 'status', 'topic', 'updated_at']
  )

  // ── Deleting the account takes all of it ──

  await pdb.query('select public.remove_account_data($1)', [OWNER])
  check(
    'Z29 deleting the account removes products, material, briefs and attachments',
    (
      await rowsOf<{ n: number }>(
        pdb,
        `select (select count(*) from public.intel_products where user_id = $1)
              + (select count(*) from public.intel_event_materials where user_id = $1)
              + (select count(*) from public.intel_meeting_briefs where user_id = $1)
              + (select count(*) from public.intel_brief_materials where user_id = $1) as n`,
        [OWNER]
      )
    )[0].n,
    0
  )

  // ── Nothing sends, nothing is invented ──

  const briefRoute = code('app/api/event-intelligence/brief/route.ts')
  const prepareView = code('components/event-intelligence/PrepareMeetingView.tsx')
  check(
    'Z30 no route sends a message, an email or a webhook',
    /nodemailer|resend|sendMail|fetch\(['"]https?:|gmail|smtp|webhook/i.test(briefRoute),
    false
  )
  check(
    'Z31 the composer writes no prose for the owner',
    /generateMessage|aiDraft|suggestedMessage|claude|anthropic/i.test(prepareView),
    false
  )
  check(
    'Z32 and says so on the screen',
    prepareView.includes('ABC writes nothing for you'),
    true
  )
  check(
    'Z33 sharing is the owner device, not an ABC transport',
    prepareView.includes('navigator.share') && prepareView.includes('clipboard'),
    true
  )
  check(
    'Z34 the screen states that sharing is not a meeting',
    prepareView.includes('does not mean you have met'),
    true
  )
  check(
    'Z35 the smart profile is a contextual layer, not a second card system',
    /card_links|card_showcase_items|abc_profiles/.test(code('supabase/migrations/20260920120000_event_smart_profile.sql')),
    true
  )
  check(
    'Z36 no migration that shipped was edited to make room for it',
    git('diff', '--diff-filter=MD', '--name-only', BASE_REF, '--', 'supabase/migrations')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    []
  )

  const profileSources = [
    'app/api/event-intelligence/products/route.ts',
    'app/api/event-intelligence/materials/route.ts',
    'app/api/event-intelligence/brief/route.ts',
    'components/event-intelligence/SmartProfileView.tsx',
    'components/event-intelligence/PrepareMeetingView.tsx',
  ]
    .map((file) => code(file))
    .join('\n')

  check(
    'Z37 none of it writes to the relationship graph',
    /from\('(scanned_contacts|contact_encounters|scan_batches)'\)[\s\S]{0,160}\.(insert|upsert|update|delete)\(/.test(profileSources),
    false
  )


  // ── What leaves ABC: the public/private boundary ──

  const shareBase: ShareInput = {
    topic: 'Housings for your next gripper line',
    message: 'We machine aluminium housings. Ten minutes at your stand?',
    product: { name: 'LiteCase housings' },
    material: [{ title: 'LiteCase in 90 seconds', url: 'https://video.example.com/litecase' }],
    event: { name: 'Ambiente 2026' },
    me: { name: 'Dana Novak', company: 'Novak Machining', cardUrl: 'https://abccard.io/d/dana' },
  }
  const shared = buildShareText(shareBase)
  check(
    'Z38 the note carries what the owner chose to send',
    [
      'Housings for your next gripper line',
      'Ten minutes at your stand?',
      'About: LiteCase housings',
      'LiteCase in 90 seconds — https://video.example.com/litecase',
      'Ambiente 2026',
      'Dana Novak, Novak Machining',
      'https://abccard.io/d/dana',
    ].filter((line) => !shared.includes(line)),
    []
  )

  // Everything a careless caller might hand over. None of it has a parameter to arrive through.
  const secrets = {
    note: 'PRIVATE-NOTE-they-are-cash-strapped',
    privateNote: 'PRIVATE-NOTE-2',
    priority: 'PRIORITY-high',
    status: 'TARGET-STATUS-planned',
    targetStatus: 'TARGET-STATUS-2',
    score: 87,
    matchScore: 'SCORE-87',
    reasons: [{ statement: 'ABC-REASON-they-sell-grippers' }],
    evidence: ['EVIDENCE-listing-quote'],
    crm: { stage: 'CRM-STAGE-negotiation' },
    salesManagerNote: 'MANAGER-NOTE-push-hard',
    presence: { hall: 'HALL-SECRET-9', stand: 'STAND-SECRET-C44' },
    ownerEmail: 'owner@example.com',
  }
  const leaky = buildShareText({ ...shareBase, ...secrets } as unknown as ShareInput)
  check(
    'Z39 private notes, priority, target status, score, ABC reasoning and CRM state never reach the note',
    [
      'PRIVATE-NOTE',
      'PRIORITY-',
      'TARGET-STATUS',
      '87',
      'ABC-REASON',
      'EVIDENCE-',
      'CRM-STAGE',
      'MANAGER-NOTE',
      'HALL-SECRET',
      'STAND-SECRET',
      'owner@example.com',
    ].filter((marker) => leaky.includes(marker)),
    []
  )
  check('Z40 and handing them over changes nothing at all', leaky, shared)
  check(
    'Z41 no card link unless the owner has a published card',
    buildShareText({ ...shareBase, me: { ...shareBase.me, cardUrl: null } }).includes('abccard.io'),
    false
  )
  check(
    'Z42 an empty brief names only the fair, and invents nothing',
    buildShareText({
      topic: '  ',
      message: null,
      product: null,
      material: [],
      event: { name: 'Ambiente 2026' },
      me: { name: null, company: null, cardUrl: null },
    }),
    'Ambiente 2026'
  )

  const shareCall = /buildShareText\(\{[\s\S]*?\}\)/.exec(prepareView)?.[0] ?? ''
  check('Z43 the screen builds its note with that function, not by hand', shareCall.length > 0, true)
  check(
    'Z44 and hands it nothing private',
    /target|note|priority|score|reason|status|presence|evidence/i.test(shareCall),
    false
  )
  const preparePage = code('app/events/intelligence/[eventKey]/m/[matchId]/prepare/page.tsx')
  check(
    'Z45 the card link is the real public address, and only for a published card',
    /publicCardUrl\(slug\)/.test(preparePage) && /card_published === true/.test(preparePage),
    true
  )

  // ── Channels: the owner's own apps, no recipient, nothing sent ──

  const mail = emailHandoffUrl('Ambiente 2026', 'Line one\nLine & two')
  check('Z46 email opens the owner mail app with no recipient in it', mail.startsWith('mailto:?subject='), true)
  check('Z47 and the note survives the trip intact', decodeURIComponent(mail.split('&body=')[1] ?? ''), 'Line one\nLine & two')
  check(
    'Z48 WhatsApp opens its own chat picker, with no number in it',
    whatsappHandoffUrl('Hello there'),
    'https://wa.me/?text=Hello%20there'
  )
  check(
    'Z49 the handoffs take a subject and a body, and nothing that could carry an address',
    [emailHandoffUrl.length, whatsappHandoffUrl.length],
    [2, 1]
  )
  check(
    'Z50 a cancelled share sheet records nothing',
    /navigator\.share\([\s\S]*?catch[\s\S]*?return[\s\S]*?save\(\{ status: 'shared' \}\)/.test(prepareView),
    true
  )
  const bodyOf = (fn: string) =>
    new RegExp('function ' + fn + '\\(\\)[\\s\\S]*?\\n  \\}').exec(prepareView)?.[0] ?? ''
  check(
    'Z51 opening email, WhatsApp or copying does not claim the note was sent',
    ['openEmail', 'openWhatsApp', 'copy'].filter((fn) => !bodyOf(fn) || /status: 'shared'/.test(bodyOf(fn))),
    []
  )
  check(
    'Z52 the owner says whether they sent it, because ABC cannot see',
    prepareView.includes('ABC cannot see whether you sent it') && prepareView.includes('I sent it'),
    true
  )
  check(
    'Z53 the screen says who presses send',
    prepareView.includes('you press send') && prepareView.includes('ABC does not'),
    true
  )
  check(
    'Z54 no public page exists for a profile or a brief',
    git('diff', '--name-only', BASE_REF, '--', 'app')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter(
        (file) =>
          !file.startsWith('app/events/intelligence/') &&
          !file.startsWith('app/api/event-intelligence/') &&
          file !== 'app/events/page.tsx'
      ),
    []
  )
  check(
    'Z55 the prepare screen applies the phase and window the owner set',
    preparePage.includes('eventPhaseOn(event, now)') && preparePage.includes('materialVisible(material, now, phase)'),
    true
  )
  check(
    'Z56 and still lists what falls outside them, labelled, because it is the owner’s material',
    prepareView.includes('outside the time you set for it') && prepareView.includes('...materials.filter((m) => !visibleNow'),
    true
  )

  // ══════════ R. The handoff documents ══════════

  const apifyDoc = read('docs/event-intelligence/apify-provider.md')
  check('R1 the provider contract says plainly that nothing is connected', /not built, not connected, not chosen/i.test(apifyDoc), true)
  check(
    'R2 it covers every concern the owner asked for',
    ['Idempotency', 'Pagination', 'Retry', 'Rate limiting', 'Refresh', 'provenance', 'Credentials', 'terms'].filter(
      (topic) => !new RegExp(topic, 'i').test(apifyDoc)
    ),
    []
  )
  const handoff = read('docs/event-intelligence/landing-handoff.md')
  check(
    'R3 the landing handoff has all five sections',
    ['What is actually implemented', 'What is prototype only', 'Still future', 'Safe public copy', 'Unsafe claims'].filter(
      (heading) => !handoff.includes(heading)
    ),
    []
  )
  check('R4 and it tells the landing to keep saying Coming next', handoff.includes('Coming next'), true)
  check(
    'R5 no landing file was touched on this branch',
    git('diff', '--name-only', BASE_REF, '--', 'components/landing', 'app/page.tsx', 'lib/landing')
      .split(/\r?\n/)
      .filter(Boolean),
    []
  )

  // ── Report ──

  console.log(`\n  Event & Expo Intelligence — ${passed} passed, ${failures.length} failed\n`)
  for (const failure of failures) console.log(`  ✗ ${failure}\n`)
  if (failures.length > 0) process.exit(1)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
