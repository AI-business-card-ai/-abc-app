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
import { ingestEvent, type IngestStore } from '@/lib/event-intelligence/ingest'
import { parseEventObjective, parseIntentProfile, parseList } from '@/lib/event-intelligence/intent'
import { toCompany, toPresence } from '@/lib/event-intelligence/data'
import {
  buildMatchRows,
  filterCounts,
  locationLabel,
  matchesFilter,
  sourceDisplayName,
  sourceFacts,
} from '@/lib/event-intelligence/view'
import { buildPlan, planSummary } from '@/lib/event-intelligence/plan'
import {
  deterministicMatchEngine,
  ENGINE_VERSION,
  matchEvent,
  MIN_SCORE,
  WEAK_SCORE,
} from '@/lib/event-intelligence/scoring'
import { DEMO_EVENT_REF, JsonFixtureProvider } from '@/lib/event-intelligence/providers/json-fixture'
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
 * privileges from the migration. What it proves is the shared logic; the
 * Supabase store is the same statements through a different client.
 */
function pgliteIngestStore(db: PGlite): IngestStore {
  const one = async <T>(sql: string, params: unknown[] = []): Promise<T | null> => {
    const rows = await rowsOf<T>(db, sql, params)
    return rows[0] ?? null
  }

  return {
    async upsertEvent(input) {
      const row = await one<{ id: string }>(
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
      return { id: row!.id }
    },

    async findCompanyByDomain(domain) {
      return one<{ id: string }>('select id from public.intel_companies where website_domain = $1', [domain])
    },

    async findCompanyBySourceRecord(provider, providerRecordId) {
      return one<{ id: string }>(
        `select p.company_id as id
           from public.intel_source_records s
           join public.intel_company_presences p on p.id = s.entity_id
          where s.provider = $1 and s.provider_record_id = $2 and s.entity_type = 'presence'`,
        [provider, providerRecordId]
      )
    },

    async findCompaniesByName(nameNormalized) {
      const rows = await rowsOf<{ id: string; country: string | null; website_domain: string | null }>(
        db,
        'select id, country, website_domain from public.intel_companies where name_normalized = $1 order by created_at, id',
        [nameNormalized]
      )
      return rows.map((r) => ({ id: r.id, country: r.country, websiteDomain: r.website_domain }))
    },

    async insertCompany(input) {
      const row = await one<{ id: string }>(
        `insert into public.intel_companies (display_name, name_normalized, website_domain, country, description_public, categories, merge_candidate_of)
         values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [
          input.displayName, input.nameNormalized, input.websiteDomain, input.country,
          input.descriptionPublic, input.categories, input.mergeCandidateOf,
        ]
      )
      return { id: row!.id }
    },

    async updateCompany(id, input) {
      // Gaps are filled, knowledge is not erased: a source that omits a field
      // has not said the fact stopped being true.
      await db.query(
        `update public.intel_companies set
           display_name = $2,
           name_normalized = $3,
           website_domain = coalesce($4, website_domain),
           country = coalesce($5, country),
           description_public = coalesce($6, description_public),
           categories = case when cardinality($7::text[]) > 0 then $7::text[] else categories end,
           merge_candidate_of = coalesce($8, merge_candidate_of),
           updated_at = now()
         where id = $1`,
        [
          id, input.displayName, input.nameNormalized, input.websiteDomain, input.country,
          input.descriptionPublic, input.categories, input.mergeCandidateOf,
        ]
      )
    },

    async upsertPresence(input, options) {
      const existing = await one<{ id: string }>(
        'select id from public.intel_company_presences where event_id = $1 and company_id = $2',
        [input.eventId, input.companyId]
      )

      if (existing) {
        if (options.touchOnly) {
          await db.query(
            "update public.intel_company_presences set last_seen_at = $2, status = 'listed' where id = $1",
            [existing.id, input.lastSeenAt]
          )
        } else {
          await db.query(
            `update public.intel_company_presences set
               exhibitor_display_name = $2, hall = $3, stand = $4, event_categories = $5,
               event_description = $6, products_services = $7, listing_url = $8,
               status = 'listed', last_seen_at = $9, updated_at = now()
             where id = $1`,
            [
              existing.id, input.exhibitorDisplayName, input.hall, input.stand, input.eventCategories,
              input.eventDescription, input.productsServices, input.listingUrl, input.lastSeenAt,
            ]
          )
        }
        return { id: existing.id, created: false }
      }

      const row = await one<{ id: string }>(
        `insert into public.intel_company_presences
           (event_id, company_id, exhibitor_display_name, hall, stand, event_categories, event_description, products_services, listing_url, first_seen_at, last_seen_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) returning id`,
        [
          input.eventId, input.companyId, input.exhibitorDisplayName, input.hall, input.stand,
          input.eventCategories, input.eventDescription, input.productsServices, input.listingUrl,
          input.lastSeenAt,
        ]
      )
      return { id: row!.id, created: true }
    },

    async markMissingPresencesWithdrawn(eventId, seenPresenceIds) {
      const rows = await rowsOf<{ id: string }>(
        db,
        `update public.intel_company_presences
            set status = 'withdrawn', updated_at = now()
          where event_id = $1 and status = 'listed' and not (id = any($2::uuid[]))
          returning id`,
        [eventId, seenPresenceIds]
      )
      return rows.length
    },

    async findSourceRecord(provider, providerRecordId, payloadVersion) {
      const row = await one<{ content_hash: string; entity_id: string }>(
        'select content_hash, entity_id from public.intel_source_records where provider = $1 and provider_record_id = $2 and payload_version = $3',
        [provider, providerRecordId, payloadVersion]
      )
      return row ? { contentHash: row.content_hash, entityId: row.entity_id } : null
    },

    async recordSource(input) {
      await db.query(
        `insert into public.intel_source_records
           (provider, provider_record_id, payload_version, source_url, entity_type, entity_id, content_hash, fetched_at, source_updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict (provider, provider_record_id, payload_version) do update set
           source_url = excluded.source_url, entity_type = excluded.entity_type, entity_id = excluded.entity_id,
           content_hash = excluded.content_hash, fetched_at = excluded.fetched_at,
           source_updated_at = excluded.source_updated_at`,
        [
          input.provider, input.providerRecordId, input.payloadVersion, input.sourceUrl,
          input.entityType, input.entityId, input.contentHash, input.fetchedAt, input.sourceUpdatedAt,
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
    'D2 the eight tables exist',
    intelTables.map((r) => r.table_name),
    [...INTEL_PUBLIC_TABLES, ...INTEL_OWNER_TABLES].sort()
  )

  const rls = await rowsOf<{ relname: string; relrowsecurity: boolean }>(
    db,
    "select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname like 'intel\\_%' order by relname"
  )
  check(
    'D3 row-level security is enabled on all eight',
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
    INTEL_OWNER_TABLES
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

  const intelRoutes = fs
    .readdirSync(path.join(ROOT, 'app/api/event-intelligence'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `app/api/event-intelligence/${entry.name}/route.ts`)

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
    'L10 the service role is held only by the two routes whose writes are not the owner to make',
    fs
      .readdirSync(path.join(ROOT, 'app/api/event-intelligence'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => code(`app/api/event-intelligence/${entry.name}/route.ts`).includes('createServiceClient'))
      .map((entry) => entry.name),
    ['import', 'match']
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
