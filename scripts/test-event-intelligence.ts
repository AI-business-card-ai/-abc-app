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
import { displayTargetStatus } from '@/lib/event-intelligence/types'

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

  // ── Report ──

  console.log(`\n  Event & Expo Intelligence — ${passed} passed, ${failures.length} failed\n`)
  for (const failure of failures) console.log(`  ✗ ${failure}\n`)
  if (failures.length > 0) process.exit(1)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
