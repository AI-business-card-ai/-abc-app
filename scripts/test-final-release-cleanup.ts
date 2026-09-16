/**
 * Final release cleanup suite (#8B).
 *
 * Run with `npm run test:final-release-cleanup` from the repository root.
 *
 * Four closed gaps, each checked where it can be checked for real:
 *
 * - card-media storage: the policies from 20260816 and 20260918, applied in
 *   PGlite over a stand-in for Supabase's storage schema, queried as anon, as
 *   two owners and as the service role.
 * - the removed enrichment and transcription surface: gone, and nothing calls
 *   those providers or reads their keys.
 * - Gmail disconnect: lib/google/gmail-disconnect.ts against the real profile
 *   schema, with Google replaced by a recorder; the route and the settings
 *   screen by their source.
 * - Android Back: the layer registry for real, the shell and the overlays by
 *   their source.
 *
 * Nothing here reaches Supabase, Google or a device.
 */
import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

delete process.env.NEXT_PUBLIC_SUPABASE_URL
delete process.env.SUPABASE_SERVICE_ROLE_KEY

import { nativeConnectorStartFromHref } from '@/lib/connectors/native-shared'
import { disconnectGmail, GOOGLE_REVOKE_ENDPOINT, revokeGoogleToken } from '@/lib/google/gmail-disconnect'
import { hasGmailGrant } from '@/lib/gmail-capability'
import { pushBackHandler, runTopBackHandler } from '@/lib/native/back-handlers'

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

const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel))
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')
const flat = (text: string) => text.replace(/\s+/g, ' ').trim()

function files(dir: string, out: string[] = []): string[] {
  if (!exists(dir)) return out
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) files(rel, out)
    else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(entry.name)) out.push(rel)
  }
  return out
}

const OLD_STORAGE_MIGRATION = 'supabase/migrations/20260816120000_card_media_bucket_and_policies.sql'
const STORAGE_MIGRATION = 'supabase/migrations/20260918120000_card_media_no_public_listing.sql'

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const OWNER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

type Role = 'service_role' | 'authenticated' | 'anon'

// ─────────────────────────── DATABASE ───────────────────────────

/*
  The parts of Supabase's own schemas the policies touch. storage.foldername is
  Supabase's definition: the path segments before the file name.
*/
const SUPABASE_STANDIN = `
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
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    updated_at timestamptz default now(),
    unique (bucket_id, name)
  );
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
  declare _parts text[];
  begin
    select string_to_array(name, '/') into _parts;
    return _parts[1:array_length(_parts, 1) - 1];
  end
  $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
  grant execute on function storage.foldername(text) to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`

async function storageDatabase(migrations: string[]): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(SUPABASE_STANDIN)
  for (const file of migrations) await db.exec(read(file))
  return db
}

/** Run as a role and a signed-in user, then roll everything back. */
async function asUser<T = Record<string, unknown>>(db: PGlite, role: Role, sub: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`)
    if (sub) await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub])
    try {
      const result = await tx.query<T>(sql, params)
      return { rows: result.rows, affected: result.affectedRows ?? 0 }
    } catch (err) {
      return { rows: [] as T[], affected: -1, error: (err as { code?: string }).code ?? 'error' }
    } finally {
      await tx.rollback()
    }
  })
}

const SEED = [
  `${A}/photo-1.jpg`,
  `${A}/showcase/one.jpg`,
  `${B}/photo-1.jpg`,
  `${B}/cover-1.jpg`,
]

async function seedObjects(db: PGlite) {
  for (const name of SEED) await db.query(`insert into storage.objects (bucket_id, name) values ('card-media', $1)`, [name])
}

const names = (rows: { name: string }[]) => rows.map((r) => r.name).sort()

// ─────────────────────────── A · CARD MEDIA STORAGE ───────────────────────────

async function storageSuite() {
  // The state production has today.
  const before = await storageDatabase([OLD_STORAGE_MIGRATION])
  await seedObjects(before)
  const anonBefore = await asUser<{ name: string }>(before, 'anon', null, `select name from storage.objects where bucket_id = 'card-media'`)
  check('S0 under 20260816 alone, anyone can list every owner’s files — the gap this closes', names(anonBefore.rows), [...SEED].sort())

  await before.exec(read(STORAGE_MIGRATION))
  const anonAfterUpgrade = await asUser<{ name: string }>(before, 'anon', null, `select name from storage.objects where bucket_id = 'card-media'`)
  check('S1 applied on top of that state, the migration ends anonymous listing', anonAfterUpgrade.rows, [])

  const db = await storageDatabase([OLD_STORAGE_MIGRATION, STORAGE_MIGRATION])
  await seedObjects(db)

  const policies = await db.query<{ policyname: string; cmd: string; roles: string[] }>(
    `select policyname, cmd, roles::text[] as roles from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname`
  )
  check(
    'S2 the card-media policies are exactly four, all for signed-in owners; none for anon or public',
    policies.rows.map((p) => [p.policyname, p.cmd, p.roles]),
    [
      ['card_media_owner_delete', 'DELETE', ['authenticated']],
      ['card_media_owner_insert', 'INSERT', ['authenticated']],
      ['card_media_owner_select', 'SELECT', ['authenticated']],
      ['card_media_owner_update', 'UPDATE', ['authenticated']],
    ]
  )

  const bucket = await db.query<{ public: boolean }>(`select public from storage.buckets where id = 'card-media'`)
  check('S3 the bucket stays public, so a file keeps loading by its public URL (which does not consult RLS)', bucket.rows, [{ public: true }])

  const anon = await asUser<{ name: string }>(db, 'anon', null, `select name from storage.objects`)
  const anonByName = await asUser<{ name: string }>(db, 'anon', null, `select name from storage.objects where name = $1`, [`${A}/photo-1.jpg`])
  check('S4 anon cannot list the bucket, or find a file by name through the API', [anon.rows, anonByName.rows], [[], []])

  const noSub = await asUser<{ name: string }>(db, 'authenticated', null, `select name from storage.objects`)
  check('S5 a signed-in role with no user id sees nothing', noSub.rows, [])

  const aList = await asUser<{ name: string }>(db, 'authenticated', A, `select name from storage.objects where bucket_id = 'card-media'`)
  const aSeesB = await asUser<{ name: string }>(db, 'authenticated', A, `select name from storage.objects where name like $1`, [`${B}/%`])
  check('S6 an owner lists only their own folder', [names(aList.rows), aSeesB.rows], [[`${A}/photo-1.jpg`, `${A}/showcase/one.jpg`], []])

  const service = await asUser<{ name: string }>(db, 'service_role', null, `select name from storage.objects`)
  check('S7 the service role still lists everything (account deletion empties owner folders server-side)', names(service.rows), [...SEED].sort())

  const insertOwn = await asUser(db, 'authenticated', A, `insert into storage.objects (bucket_id, name) values ('card-media', $1)`, [`${A}/logo-1.png`])
  const insertOther = await asUser(db, 'authenticated', A, `insert into storage.objects (bucket_id, name) values ('card-media', $1)`, [`${B}/planted.png`])
  const insertRoot = await asUser(db, 'authenticated', A, `insert into storage.objects (bucket_id, name) values ('card-media', 'loose.png')`)
  const insertAnon = await asUser(db, 'anon', null, `insert into storage.objects (bucket_id, name) values ('card-media', $1)`, [`${A}/anon.png`])
  check(
    'S8 an owner writes only inside their own folder; anon cannot write',
    [insertOwn.affected, insertOther.error, insertRoot.error, insertAnon.error],
    [1, '42501', '42501', '42501']
  )

  const updateOwn = await asUser(db, 'authenticated', A, `update storage.objects set name = $1 where name = $2`, [`${A}/photo-2.jpg`, `${A}/photo-1.jpg`])
  const moveIntoB = await asUser(db, 'authenticated', A, `update storage.objects set name = $1 where name = $2`, [`${B}/stolen.jpg`, `${A}/photo-1.jpg`])
  const updateB = await asUser(db, 'authenticated', A, `update storage.objects set name = $1 where name = $2`, [`${A}/taken.jpg`, `${B}/photo-1.jpg`])
  // No WHERE: only the UPDATE policy decides which rows are reachable.
  const updateAll = await asUser(db, 'authenticated', A, `update storage.objects set updated_at = now()`)
  const updateAnon = await asUser(db, 'anon', null, `update storage.objects set updated_at = now()`)
  check(
    'S9 an owner can replace their own files, cannot move one into another folder, and cannot touch another owner’s',
    [updateOwn.affected, moveIntoB.error, updateB.affected, updateAll.affected, updateAnon.affected],
    [1, '42501', 0, 2, 0]
  )

  const deleteOwn = await asUser(db, 'authenticated', A, `delete from storage.objects where name = $1`, [`${A}/photo-1.jpg`])
  const deleteB = await asUser(db, 'authenticated', A, `delete from storage.objects where name = $1`, [`${B}/photo-1.jpg`])
  // No WHERE: only the DELETE policy decides which rows are reachable.
  const deleteAll = await asUser(db, 'authenticated', A, `delete from storage.objects`)
  const deleteAnon = await asUser(db, 'anon', null, `delete from storage.objects`)
  check('S10 an owner deletes only their own files; anon deletes nothing', [deleteOwn.affected, deleteB.affected, deleteAll.affected, deleteAnon.affected], [1, 0, 2, 0])

  const after = await db.query<{ name: string }>(`select name from storage.objects`)
  check('S11 every probe above rolled back: the seed is intact', names(after.rows), [...SEED].sort())

  const statements = read(STORAGE_MIGRATION).replace(/--.*$/gm, '')
  check(
    'S12 the migration is additive and scoped: no bucket change, no other bucket, no table or data change',
    [/storage\.buckets|avatars|DROP TABLE|DELETE FROM|UPDATE storage|TRUNCATE/i.test(statements), /DROP POLICY IF EXISTS "card_media_public_read" ON storage\.objects;/.test(statements)],
    [false, true]
  )

  const browserSources = [...files('components'), ...files('app')].filter((f) => !f.startsWith('app/api/') && read(f).startsWith("'use client'"))
  check(
    'S13 no browser code lists, downloads or signs card media — nothing depended on anonymous listing',
    browserSources.filter((f) => /\.storage\b[\s\S]*?\.(list|download|createSignedUrl|search)\(/.test(code(f))),
    []
  )
  check(
    'S14 every server storage call uses the service role: account deletion lists with the client its route passes, card media uses the service-role client',
    [
      files('app').concat(files('lib')).filter((f) => /\.storage\s*\.from\([^)]*\)\s*\.list\(/.test(code(f))),
      flat(code('app/api/account/delete/route.ts')).includes('deleteAccountForOwner(createServiceClient(), user.id)'),
      files('app').concat(files('lib')).filter((f) => /\.storage\s*\.from\(/.test(code(f))).sort(),
      flat(code('lib/supabase.ts')).includes('export function createServerSupabase() { return createClient( process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!'),
      (code('app/api/card/media/route.ts').match(/const supabase = (\w+)\(\)/g) ?? []).every((m) => m.endsWith('createServerSupabase()')),
    ],
    [['lib/account/delete.ts'], true, ['app/api/card/media/route.ts', 'lib/account/delete.ts'], true, true]
  )
}

// ─────────────────────────── B · REMOVED SURFACE ───────────────────────────

function removedSurfaceSuite() {
  const REMOVED = [
    'app/api/card/enrich/route.ts',
    'app/api/card/enrich/[id]/route.ts',
    'app/api/card/scan/enrich/route.ts',
    'app/api/enrich/queue/route.ts',
    'app/api/enrich/retry/[id]/route.ts',
    'app/api/enrich/run/[id]/route.ts',
    'app/api/contact/linkedin/route.ts',
    'app/api/card/transcribe/route.ts',
    'lib/enrichment.ts',
    'lib/enrichment-steps.ts',
    'lib/perplexity.ts',
    'lib/apollo.ts',
    'lib/enrichlayer.ts',
    'components/contact/IntelligencePanel.tsx',
    'components/contact/LinkedInMismatchBanner.tsx',
    'components/ui/EnrichmentIndicator.tsx',
    'components/ui/EnrichmentProgress.tsx',
    'components/mobile/ScanContextSheet.tsx',
    'components/mobile/ScanInstantResult.tsx',
    'components/contacts/ContactCrmDetail.tsx',
    'components/contacts/ContactsClient.tsx',
  ]
  check('B1 the dead enrichment and transcription routes, libraries and screens are gone', REMOVED.filter(exists), [])

  const shipped = [...files('app'), ...files('lib'), ...files('components'), ...files('public'), 'middleware.ts', 'next.config.js'].filter(exists)
  const hits = (re: RegExp) => shipped.filter((f) => re.test(read(f)))
  check(
    'B2 nothing that ships calls Perplexity, Apollo, EnrichLayer or OpenAI, or reads their keys',
    [
      hits(/api\.perplexity\.ai|api\.apollo\.io|enrichlayer\.com|api\.openai\.com/i),
      hits(/PERPLEXITY_API_KEY|APOLLO_API_KEY|ENRICHLAYER_API_KEY|OPENAI_API_KEY/),
      hits(/from ['"](openai|@\/lib\/(enrichment|enrichment-steps|perplexity|apollo|enrichlayer))['"]/),
    ],
    [[], [], []]
  )
  const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> }
  check('B3 no OpenAI SDK is installed, and the example environment no longer names a removed key', [Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((d) => /openai|perplexity|apollo|enrichlayer/i.test(d)), /PERPLEXITY|APOLLO|ENRICHLAYER|OPENAI/.test(read('.env.local.example'))], [[], false])
  check(
    'B4 no screen calls a removed route',
    hits(/\/api\/enrich\/(queue|run|retry)|\/api\/card\/enrich|\/api\/card\/scan\/enrich|\/api\/contact\/linkedin|\/api\/card\/transcribe/),
    []
  )
  check(
    'B5 live AI is kept: Smart Follow-up and message regeneration, and the routes they call',
    [
      exists('app/api/contact/message/route.ts'),
      exists('app/api/enrich/messages/[id]/route.ts'),
      code('components/contacts/detail/SmartFollowUpCard.tsx').includes("fetch('/api/contact/message'"),
      code('components/follow-ups/FollowUpSheet.tsx').includes("fetch('/api/contact/message'"),
      code('components/chat/MessageComposer.tsx').includes('fetch(`/api/enrich/messages/${contact.id}`'),
    ],
    [true, true, true, true, true]
  )
  const privacy = read('app/privacy/page.tsx')
  const terms = read('app/terms/page.tsx')
  check(
    'B6 Privacy and Terms no longer describe enrichment by third-party data providers',
    [/enrich/i.test(privacy), /business data (enrichment )?providers/i.test(privacy), /enrich contact data/i.test(terms)],
    [false, false, false]
  )
}

// ─────────────────────────── C · GMAIL DISCONNECT ───────────────────────────

async function profileDatabase(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(SUPABASE_STANDIN)
  await db.exec(read('supabase/schema.sql').replace(/create extension[^;]+;/i, ''))
  await db.exec('alter table public.abc_profiles add column if not exists card_bio text')
  for (const file of fs.readdirSync(path.join(ROOT, 'supabase/migrations')).sort()) {
    try {
      await db.exec(read(`supabase/migrations/${file}`))
    } catch {
      // Environment-only failures are pinned by test:account-deletion.
    }
  }
  return db
}

const GMAIL_COLUMNS = 'id, email, google_connected, google_email, google_refresh_token, google_access_token, google_token_expires_at'

/**
 * The service client the library is given, over PGlite. It answers only the
 * two calls a disconnect needs and records every other property touched, so an
 * auth, RPC or storage call shows up as a failure rather than passing silently.
 */
function serviceClient(db: PGlite, events: string[], fail: { read?: boolean; update?: boolean } = {}): SupabaseClient {
  const ident = (s: string) => {
    if (!/^[a-z_, ]+$/.test(s)) throw new Error(`unexpected identifier: ${s}`)
    return s
  }
  const client = {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(column: string, value: unknown) {
              return {
                async maybeSingle() {
                  events.push(`read:${table}:${flat(columns)}:${column}=${value}`)
                  if (fail.read) return { data: null, error: { code: 'XX000' } }
                  const res = await db.transaction(async (tx) => {
                    await tx.exec('set local role service_role')
                    return tx.query(`select ${ident(columns)} from public.${ident(table)} where ${ident(column)} = $1`, [value])
                  })
                  return { data: res.rows[0] ?? null, error: null }
                },
              }
            },
          }
        },
        update(values: Record<string, unknown>) {
          return {
            eq(column: string, value: unknown) {
              const run = async () => {
                events.push(`update:${table}:${Object.keys(values).sort().join(',')}:${column}=${value}`)
                if (fail.update) return { data: null, error: { code: 'XX000' } }
                const keys = Object.keys(values)
                await db.transaction(async (tx) => {
                  await tx.exec('set local role service_role')
                  await tx.query(
                    `update public.${ident(table)} set ${keys.map((k, i) => `${ident(k)} = $${i + 1}`).join(', ')} where ${ident(column)} = $${keys.length + 1}`,
                    [...keys.map((k) => values[k]), value]
                  )
                })
                return { data: null, error: null }
              }
              return { then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => run().then(ok, bad) }
            },
          }
        },
      }
    },
  }
  return new Proxy(client, {
    get(target, prop) {
      if (prop !== 'from' && typeof prop === 'string' && prop !== 'then') events.push(`client.${prop}`)
      return Reflect.get(target, prop)
    },
  }) as unknown as SupabaseClient
}

async function gmailSuite() {
  const logs: string[] = []
  const realError = console.error
  console.error = (...args: unknown[]) => void logs.push(args.map(String).join(' '))
  try {
    await gmailChecks()
  } finally {
    console.error = realError
  }
  check(
    'C18 failures are logged by kind and code, never with a token or a mailbox',
    [logs, logs.some((l) => /refresh-|access-|tok|@example\.com/.test(l))],
    [['[gmail/disconnect] revoke failed: TypeError', '[gmail/disconnect] read failed: XX000', '[gmail/disconnect] clear failed: XX000'], false]
  )
}

async function gmailChecks() {
  const db = await profileDatabase()
  const connect = async (id: string, mailbox: string, refresh: string | null, access: string | null) => {
    await db.query(
      `update public.abc_profiles set google_connected = true, google_email = $2, google_refresh_token = $3, google_access_token = $4, google_token_expires_at = now() + interval '1 hour' where id = $1`,
      [id, mailbox, refresh, access]
    )
  }
  const profile = async (id: string) => (await db.query<Record<string, unknown>>(`select ${GMAIL_COLUMNS} from public.abc_profiles where id = $1`, [id])).rows[0]
  const authUser = async (id: string) => (await db.query(`select id, email from auth.users where id = $1`, [id])).rows[0]
  const cleared = (row: Record<string, unknown>) => [row.google_connected, row.google_email, row.google_refresh_token, row.google_access_token, row.google_token_expires_at]
  const CLEARED = [false, null, null, null, null]

  for (const [id, email] of [[OWNER, 'owner@example.com'], [OTHER, 'other@example.com']]) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email])
    await db.query('insert into public.abc_profiles (id, email) values ($1, $2) on conflict (id) do nothing', [id, email])
  }
  await connect(OWNER, 'owner.sends@example.com', 'refresh-owner', 'access-owner')
  await connect(OTHER, 'other.sends@example.com', 'refresh-other', 'access-other')
  const ownerAuthBefore = await authUser(OWNER)
  const ownerEmailBefore = (await profile(OWNER)).email
  const entitlements = await db.query(`select 1 from public.billing_entitlements where user_id = $1`, [OWNER])
  check('C0 the owner under test has no Pro of any kind, and both accounts start connected', [entitlements.rows.length, hasGmailGrant((await profile(OWNER)) as { google_connected: boolean }), hasGmailGrant((await profile(OTHER)) as { google_connected: boolean })], [0, true, true])

  // 1. The ordinary disconnect.
  const events: string[] = []
  const revoked: string[] = []
  const result = await disconnectGmail(
    {
      db: serviceClient(db, events),
      revoke: async (token) => {
        events.push('google:revoke')
        revoked.push(token)
        return true
      },
    },
    OWNER
  )
  check('C1 disconnect succeeds without Pro and reports the revocation', result, { ok: true, revoked: true })
  check('C2 the owner’s connection is gone: flag, mailbox and every token', cleared(await profile(OWNER)), CLEARED)
  check(
    'C3 order: read the token, clear locally, and only then ask Google — with the refresh token, which revokes the grant',
    [events.map((e) => e.split(':').slice(0, 2).join(':')), revoked],
    [['read:abc_profiles', 'update:abc_profiles', 'google:revoke'], ['refresh-owner']]
  )
  check(
    'C4 every query is scoped to the owner id it was given',
    events.filter((e) => !e.startsWith('google:')).map((e) => e.split(':').pop()),
    [`id=${OWNER}`, `id=${OWNER}`]
  )
  check('C5 another account keeps its connection', cleared(await profile(OTHER)).slice(0, 4), [true, 'other.sends@example.com', 'refresh-other', 'access-other'])
  check(
    'C6 Google sign-in is untouched: no auth, RPC or storage call, the auth user and the account email unchanged',
    [events.filter((e) => e.startsWith('client.')), await authUser(OWNER), (await profile(OWNER)).email],
    [[], ownerAuthBefore, ownerEmailBefore]
  )

  // 2. Google refuses, or is unreachable: the tokens are gone regardless.
  await connect(OWNER, 'owner.sends@example.com', 'refresh-owner-2', 'access-owner-2')
  const throwing = await disconnectGmail({ db: serviceClient(db, []), revoke: async () => { throw new TypeError('fetch failed') } }, OWNER)
  const throwingRow = cleared(await profile(OWNER))
  await connect(OWNER, 'owner.sends@example.com', 'refresh-owner-3', 'access-owner-3')
  const refusing = await disconnectGmail({ db: serviceClient(db, []), revoke: async () => false }, OWNER)
  check(
    'C7 a revocation that throws or is refused still disconnects, and says it was not revoked',
    [throwing, throwingRow, refusing, cleared(await profile(OWNER))],
    [{ ok: true, revoked: false }, CLEARED, { ok: true, revoked: false }, CLEARED]
  )

  // 3. Only an access token stored; and nothing stored at all.
  await connect(OWNER, 'owner.sends@example.com', null, 'access-only')
  const accessOnly: string[] = []
  await disconnectGmail({ db: serviceClient(db, []), revoke: async (t) => (accessOnly.push(t), true) }, OWNER)
  const nothing: string[] = []
  const nothingResult = await disconnectGmail({ db: serviceClient(db, []), revoke: async (t) => (nothing.push(t), true) }, OWNER)
  check('C8 with only an access token that is revoked; with none, Google is not called and disconnect still succeeds', [accessOnly, nothing, nothingResult], [['access-only'], [], { ok: true, revoked: false }])

  // 4. ABC's own failures: tell the caller, and never revoke a grant that is still stored.
  await connect(OWNER, 'owner.sends@example.com', 'refresh-owner-4', 'access-owner-4')
  const readFail: string[] = []
  const readFailResult = await disconnectGmail({ db: serviceClient(db, [], { read: true }), revoke: async (t) => (readFail.push(t), true) }, OWNER)
  const updateFail: string[] = []
  const updateFailResult = await disconnectGmail({ db: serviceClient(db, [], { update: true }), revoke: async (t) => (updateFail.push(t), true) }, OWNER)
  check(
    'C9 if the profile cannot be read or cleared, disconnect fails and Google is not asked',
    [readFailResult, readFail, updateFailResult, updateFail, (await profile(OWNER)).google_refresh_token],
    [{ ok: false, code: 'disconnect_failed' }, [], { ok: false, code: 'disconnect_failed' }, [], 'refresh-owner-4']
  )

  // 5. Google's endpoint, with fetch replaced.
  const realFetch = globalThis.fetch
  const calls: { url: string; method?: string; body: string; type: string | null }[] = []
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method, body: String(init?.body), type: new Headers(init?.headers).get('content-type') })
    return new Response(null, { status: calls.length === 1 ? 200 : 400 })
  }) as typeof fetch
  let rejected: string | null = null
  try {
    const ok = await revokeGoogleToken('tok/en+1')
    const refused = await revokeGoogleToken('tok-2')
    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch
    await revokeGoogleToken('tok-3').catch((err: Error) => {
      rejected = err.name
    })
    check(
      'C10 revocation posts the token in a form body to Google’s revocation endpoint — never in the URL',
      [ok, refused, calls.map((c) => [c.url, c.method, c.type, c.body]), rejected],
      [true, false, [[GOOGLE_REVOKE_ENDPOINT, 'POST', 'application/x-www-form-urlencoded', 'token=tok%2Fen%2B1'], [GOOGLE_REVOKE_ENDPOINT, 'POST', 'application/x-www-form-urlencoded', 'token=tok-2']], 'TypeError']
    )
    check('C11 the endpoint is Google’s OAuth revocation URL', GOOGLE_REVOKE_ENDPOINT, 'https://oauth2.googleapis.com/revoke')
  } finally {
    globalThis.fetch = realFetch
  }

  // 6. The route and the screen, by their source.
  const routeFile = 'app/api/auth/google-gmail/disconnect/route.ts'
  const route = code(routeFile)
  check(
    'C12 the route acts for the session user only: no request argument, no body, no query, no client-supplied id',
    [/export async function DELETE\(\)/.test(route), /request|req\b|\.json\(|searchParams|params|userId|user_id|ownerId/.test(route.replace(/NextResponse\.json/g, '').replace(/'[^'\n]*'/g, "''")), flat(route).includes('disconnectGmail({ db: createServiceClient() }, user.id)'), flat(route).includes("if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })")],
    [true, false, true, true]
  )
  const lib = code('lib/google/gmail-disconnect.ts')
  check(
    'C13 no Pro gate, and no auth or session call, in the route or the library',
    [/requirePro|resolveProEntitlement|entitlement|isPro|\bpro\b/i.test(route + lib), /\.auth\b|signOut|admin/.test(lib), /refuseNativeConnect/.test(route)],
    [false, false, false]
  )
  const { DELETE } = (await import('@/app/api/auth/google-gmail/disconnect/route')) as { DELETE: () => Promise<Response> }
  const quiet = console.error
  console.error = () => undefined
  let outside: unknown
  try {
    const res = await DELETE()
    outside = [res.status, await res.json(), res.headers.get('cache-control')]
  } finally {
    console.error = quiet
  }
  check('C14 outside a signed-in request the route fails closed with our own sentence and no-store', outside, [500, { error: 'Could not disconnect Gmail. Try again.' }, 'no-store'])

  const view = code('components/settings/IntegrationsSettingsView.tsx')
  const viewFlat = flat(view)
  check(
    'C15 Settings → Integrations shows Gmail, offers Disconnect whenever a mailbox is connected (Pro or not), and sends no account id',
    [
      viewFlat.includes('{!gmailState.connected && !pro ? null : ('),
      viewFlat.includes('{gmailState.connected ? ( <button'),
      viewFlat.includes("fetch(GMAIL_DISCONNECT_PATH, { method: 'DELETE' })"),
      viewFlat.includes('setGmailState({ connected: false, mailbox: null })'),
      viewFlat.includes('{!gmailState.connected && pro ? ( <a href={GMAIL_CONNECT_PATH}'),
      /GMAIL_DISCONNECT_PATH = '\/api\/auth\/google-gmail\/disconnect'/.test(view),
    ],
    [true, true, true, true, true, true]
  )
  const page = flat(code('app/settings/integrations/page.tsx'))
  check(
    'C16 the settings page reads only the connection flag and mailbox through the user’s own session — never a token',
    [page.includes('const supabase = createServerComponentClient()'), page.includes(".from('abc_profiles').select('google_connected, google_email').eq('id', user.id)"), /google_(refresh|access)_token/.test(page)],
    [true, true, false]
  )
  check(
    'C17 reconnecting is the ordinary connector: the Connect link starts it (natively in the apps), and a new refresh token sets the flag again',
    [
      nativeConnectorStartFromHref(`https://www.abccard.io/api/auth/google-gmail?returnTo=${encodeURIComponent('/settings/integrations')}`, 'https://www.abccard.io'),
      nativeConnectorStartFromHref('https://www.abccard.io/api/auth/google-gmail/disconnect', 'https://www.abccard.io'),
      code('lib/google-gmail-auth.ts').includes('if (tokens.refreshToken) updates.google_connected = true'),
      code('components/chat/MessageComposer.tsx').includes('/api/auth/google-gmail?returnTo='),
    ],
    [{ provider: 'google-gmail', returnTo: '/settings/integrations' }, null, true, true]
  )
}

// ─────────────────────────── D · ANDROID BACK ───────────────────────────

function backSuite() {
  const log: string[] = []
  const presentation = () => log.push('close presentation')
  const qr = () => log.push('close qr')

  const noneRan = runTopBackHandler()
  const removePresentation = pushBackHandler(presentation)
  runTopBackHandler()
  // The QR opens over the presentation: the presentation stops listening, the QR starts.
  removePresentation()
  const removeQr = pushBackHandler(qr)
  runTopBackHandler()
  removeQr()
  const removePresentationAgain = pushBackHandler(presentation)
  runTopBackHandler()
  removePresentationAgain()
  const emptyAgain = runTopBackHandler()
  check(
    'D1 Back runs only the top layer, and reports when nothing is open so history can take over',
    [noneRan, log, emptyAgain],
    [false, ['close presentation', 'close qr', 'close presentation'], false]
  )

  const order: string[] = []
  const first = pushBackHandler(() => order.push('first'))
  const second = pushBackHandler(() => order.push('second'))
  const third = pushBackHandler(() => order.push('third'))
  second()
  second()
  runTopBackHandler()
  third()
  runTopBackHandler()
  first()
  check('D2 last registered runs first; removing a middle layer, even twice, leaves the others in order', [order, runTopBackHandler()], [['third', 'first'], false])

  const shell = code('lib/native/shell.ts')
  const listener = shell.slice(shell.indexOf("App.addListener('backButton'"), shell.indexOf('cleanups.push(() => void back.remove())'))
  check(
    'D3 the Android listener closes a layer first, then walks history, then minimises — and only on Android',
    [
      listener.length > 0,
      listener.indexOf('if (runTopBackHandler()) return') >= 0 && listener.indexOf('if (runTopBackHandler()) return') < listener.indexOf('if (canGoBack) window.history.back()'),
      listener.indexOf('if (canGoBack) window.history.back()') < listener.indexOf('else void App.minimizeApp()'),
      shell.slice(0, shell.indexOf("App.addListener('backButton'")).trimEnd().endsWith("if (platform === 'android') {\n    const back = await"),
    ],
    [true, true, true, true]
  )

  const registry = code('lib/native/back-handlers.ts')
  const importers = [...files('app'), ...files('lib'), ...files('components')].filter((f) => f !== 'lib/native/back-handlers.ts' && /runTopBackHandler/.test(code(f)))
  check(
    'D4 web, PWA and iOS are unaffected: the registry listens to nothing, and only the Android listener runs it',
    [/addEventListener|window\.|document\.|history|popstate/.test(registry), importers],
    [false, ['lib/native/shell.ts']]
  )
  check(
    'D5 the registration only changes when the layer opens or closes, and always calls the latest close action',
    flat(registry).includes('useEffect(() => { if (!active) return return pushBackHandler(() => latest.current()) }, [active])'),
    true
  )

  const presentationMode = code('components/my-card/CardPresentationMode.tsx')
  const qrModal = code('components/card/CardQrModal.tsx')
  const multiCard = code('components/scan/MultiCardClient.tsx')
  check(
    'D6 the presented card, its QR code and the Multi-Card camera close with Back using their own existing close actions',
    [
      presentationMode.includes('useNativeBackHandler(open && !covered, onClose)'),
      qrModal.includes('useNativeBackHandler(open, onClose)'),
      multiCard.includes('useNativeBackHandler(immersive, () => setImmersiveExited(true))'),
      multiCard.includes('onExitImmersive={() => setImmersiveExited(true)}'),
      code('components/my-card/MyCardView.tsx').includes('covered={qrOpen}'),
    ],
    [true, true, true, true, true]
  )
  check(
    'D7 Escape still closes both overlays on the web',
    [presentationMode, qrModal].map((src) => src.includes("if (e.key === 'Escape') onClose()") && src.includes("document.addEventListener('keydown', onKey)")),
    [true, true]
  )
}

// ─────────────────────────── E · DOCS MATCH THE CODE ───────────────────────────

function docsSuite() {
  const inventory = read('docs/store/data-inventory.md')
  const oauth = read('docs/store/google-oauth-verification.md')
  const docs = ['README', 'data-inventory', 'apple-privacy-label', 'google-play-data-safety', 'account-deletion', 'google-oauth-verification', 'app-review-notes'].map((d) => read(`docs/store/${d}.md`)).join('\n')
  check(
    'E1 the store drafts describe the final code: listing closed, providers removed, Gmail disconnect, Android Back',
    [
      inventory.includes('20260918120000_card_media_no_public_listing.sql'),
      /not reachable from the (current )?UI/i.test(docs),
      /no in-app (Gmail|"Disconnect Gmail")/i.test(docs),
      inventory.includes('Settings → Integrations') && oauth.includes('/api/auth/google-gmail/disconnect'),
      inventory.includes('lib/native/back-handlers.ts') && read('native-shell/README.md').includes('lib/native/back-handlers.ts'),
    ],
    [true, false, false, true, true]
  )
}

async function main() {
  await storageSuite()
  removedSurfaceSuite()
  await gmailSuite()
  backSuite()
  docsSuite()

  const total = passed + failures.length
  if (failures.length) {
    console.log(`\nFinal release cleanup: ${passed}/${total} PASS, ${failures.length} FAILED\n`)
    for (const failure of failures) console.log('  FAIL ' + failure)
    process.exit(1)
  }
  console.log(`\nFinal release cleanup: ${passed}/${total} PASS`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
