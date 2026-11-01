/**
 * ABC CRM V1 regression suite.
 *
 * Run with `npm run test:crm` from the repository root.
 *
 * What V1 promises, checked against the real code and the real migrations:
 *
 *   A  the opportunity model — stages, values, people, last interaction
 *   B  Next and People — what is due, what needs a step, nothing invented
 *   C  the old board — only deliberate deals are offered, never imported alone
 *   D  the migration, in PGlite — additive, re-runnable, guarded, RLS-scoped
 *   E  the write paths, through RLS — one opportunity per person, safe without V1 columns
 *   F  the routes — own sentences on failure, nothing leaked, nothing Pro-gated
 *   G  the app around it — /crm protected, /pipeline redirected, light skeletons,
 *      nothing creates or moves a deal on its own
 *
 * It never connects to Supabase and never calls a CRM.
 */
import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

import {
  ALL_STAGES,
  BOARD_STAGES,
  buildNextItems,
  buildPeopleRows,
  dateInputValue,
  defaultOpportunityName,
  dueAtFromInput,
  formatMoney,
  isOpenStage,
  joinBoard,
  lastInteractionOf,
  legacyImportCandidates,
  legacyImportStage,
  matchesPeopleFilter,
  matchesPeopleQuery,
  normalizeStage,
  onePerPerson,
  openValueByCurrency,
  positiveAmount,
  toCrmPerson,
  toOpportunity,
  type CrmPerson,
  type Opportunity,
} from '@/lib/opportunities/model'
import {
  createOpportunity,
  findOpportunityForContact,
  isMissingSchema,
  parseNextAction,
  parsePatch,
  setNextAction,
  updateOpportunity,
} from '@/lib/opportunities/store'
import { isStage } from '@/lib/opportunities/model'

delete process.env.NEXT_PUBLIC_SUPABASE_URL
delete process.env.SUPABASE_SERVICE_ROLE_KEY

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

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel))
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')
const flatCode = (rel: string) => code(rel).replace(/\s+/g, ' ')
function files(dir: string, out: string[] = []): string[] {
  if (!exists(dir)) return out
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) files(rel, out)
    else if (/\.(tsx?)$/.test(entry.name)) out.push(rel)
  }
  return out
}

const MIGRATION = 'supabase/migrations/20261031120000_crm_v1_opportunities.sql'
const NOW = new Date('2026-10-31T10:00:00.000Z')
const DAY = 86_400_000
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString()

const OWNER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const C1 = '00000000-0000-4000-8000-000000000001'
const C2 = '00000000-0000-4000-8000-000000000002'
const C3 = '00000000-0000-4000-8000-000000000003'
const CO = '00000000-0000-4000-8000-000000000009'

// ─────────────────────────── FIXTURES ───────────────────────────

function personRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: C1,
    name: 'Sarah Novak',
    first_name: null,
    last_name: null,
    role: 'Head of Sales',
    company: 'ACME',
    photo_url: null,
    email: 'sarah@acme.test',
    phone: null,
    mobile_phone: null,
    event_name: null,
    meeting_event_name: 'Web Summit',
    meeting_location: null,
    raw_event_text: null,
    meeting_topic: 'Wants 40 seats before Q1',
    meeting_date: at(-20),
    meeting_event_date: null,
    next_action: null,
    next_step: null,
    next_action_date: null,
    last_message_date: null,
    last_message_type: null,
    reply_date: null,
    pipeline_stage: 'new',
    pipeline_notes: null,
    deal_value: 0,
    deal_currency: 'USD',
    scanned_at: at(-20),
    ...overrides,
  }
}

function opp(overrides: Partial<Opportunity> & { contactId: string }): Opportunity {
  return {
    id: `opp-${overrides.contactId}`,
    name: 'ACME',
    stage: 'new',
    value: null,
    currency: 'EUR',
    note: null,
    nextAction: null,
    createdAt: at(-10),
    updatedAt: at(-10),
    ...overrides,
  }
}

// ─────────────────────────── PGLITE ───────────────────────────

const BASE_SCHEMA = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;

  create table public.abc_profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    email text
  );
  create table public.scanned_contacts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    name text, first_name text, last_name text, company text, role text,
    email text, phone text, website text, linkedin_url text,
    status text, scan_status text, source text, capture_origin text, capture_kind text,
    meeting_date text, meeting_event_date text, raw_event_text text, meeting_event_name text,
    event_name text, meeting_location text, meeting_topic text, next_action text, next_step text,
    followup_note text, next_action_date timestamptz,
    scanned_at timestamptz,
    created_at timestamptz not null default now()
  );
  alter table public.scanned_contacts enable row level security;
  create policy "contacts_all_own" on public.scanned_contacts
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  grant select, insert, update, delete on public.scanned_contacts to authenticated, service_role;
`

async function database(opts: { v1: boolean; before?: (db: PGlite) => Promise<void> }): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(BASE_SCHEMA)
  await db.exec(read('supabase/migrations/20260622160000_crm_zero_input.sql'))
  await db.exec(read('supabase/migrations/20260823120000_contact_encounters.sql'))
  // Production's default privileges, as 20260823 describes them: a new table
  // arrives granting ALL to anon and authenticated.
  await db.exec('grant all on public.crm_opportunities to anon, authenticated, service_role')
  for (const owner of [OWNER, OTHER]) {
    await db.query('insert into auth.users (id) values ($1)', [owner])
    await db.query('insert into public.abc_profiles (id) values ($1)', [owner])
  }
  for (const [id, owner, name, company] of [
    [C1, OWNER, 'Sarah Novak', 'ACME'],
    [C2, OWNER, 'Martin Dvorak', null],
    [C3, OWNER, 'Peter Hall', 'Globex'],
    [CO, OTHER, 'Someone Else', 'Initech'],
  ]) {
    await db.query('insert into public.scanned_contacts (id, user_id, name, company) values ($1, $2, $3, $4)', [id, owner, name, company])
  }
  if (opts.before) await opts.before(db)
  if (opts.v1) await db.exec(read(MIGRATION))
  return db
}

/** Enough of the Supabase client for lib/opportunities/store, over PGlite, as one signed-in user. */
function clientAs(db: PGlite, sub: string): SupabaseClient {
  function from(table: string) {
    const filters: { sql: string; value?: unknown }[] = []
    let action: 'select' | 'insert' | 'update' = 'select'
    let payload: Record<string, unknown> | Record<string, unknown>[] = {}
    let columns = '*'
    let returning: string | null = null
    let orderBy = ''
    let limitN = 0
    let single = false

    const builder = {
      select(cols = '*') {
        if (action === 'select') columns = cols
        else returning = cols
        return builder
      },
      insert(values: Record<string, unknown> | Record<string, unknown>[]) {
        action = 'insert'
        payload = values
        return builder
      },
      update(values: Record<string, unknown>) {
        action = 'update'
        payload = values
        return builder
      },
      eq(column: string, value: unknown) {
        filters.push({ sql: `${column} = $?`, value })
        return builder
      },
      order(column: string, o?: { ascending?: boolean }) {
        orderBy = ` order by ${column} ${o?.ascending === false ? 'desc' : 'asc'}`
        return builder
      },
      limit(n: number) {
        limitN = n
        return builder
      },
      maybeSingle() {
        single = true
        return builder
      },
      single() {
        single = true
        return builder
      },
      then(resolve: (value: unknown) => void, reject: (err: unknown) => void) {
        run().then(resolve, reject)
      },
    }

    async function run() {
      const values: unknown[] = []
      const bind = (value: unknown) => {
        values.push(value)
        return `$${values.length}`
      }
      const where = () =>
        filters.length ? ' where ' + filters.map((f) => f.sql.replace('$?', bind(f.value))).join(' and ') : ''
      const tail = returning ? ` returning ${returning}` : ''
      try {
        await db.exec('set role authenticated')
        await db.query("select set_config('request.jwt.claim.sub', $1, false)", [sub])
        let rows: unknown[]
        if (action === 'insert') {
          const list = Array.isArray(payload) ? payload : [payload]
          const keys = Object.keys(list[0])
          const tuples = list.map((row) => `(${keys.map((k) => bind(row[k])).join(', ')})`)
          rows = (await db.query(`insert into public.${table} (${keys.join(', ')}) values ${tuples.join(', ')}${tail}`, values)).rows
        } else if (action === 'update') {
          const body = payload as Record<string, unknown>
          const sets = Object.keys(body).map((key) => `${key} = ${bind(body[key])}`)
          const clause = where()
          rows = (await db.query(`update public.${table} set ${sets.join(', ')}${clause}${tail}`, values)).rows
        } else {
          const clause = where()
          rows = (await db.query(`select ${columns} from public.${table}${clause}${orderBy}${limitN ? ` limit ${limitN}` : ''}`, values)).rows
        }
        if (action !== 'select' && !returning) return { data: null, error: null }
        return { data: single ? rows[0] ?? null : rows, error: null }
      } catch (err) {
        return { data: null, error: { code: (err as { code?: string }).code ?? 'unknown', message: String(err) } }
      } finally {
        await db.exec('reset role')
      }
    }

    return builder
  }
  return { from } as unknown as SupabaseClient
}

async function rows<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function asUser<T>(db: PGlite, sub: string | null, fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    await db.exec(sub ? 'set role authenticated' : 'set role anon')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [sub ?? ''])
    return await fn()
  } catch (err) {
    return { error: String((err as { code?: string }).code ?? err) }
  } finally {
    await db.exec('reset role')
  }
}

async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const original = { error: console.error, log: console.log, warn: console.warn }
  console.error = () => {}
  console.log = () => {}
  console.warn = () => {}
  try {
    return await fn()
  } finally {
    console.error = original.error
    console.log = original.log
    console.warn = original.warn
  }
}

// ─────────────────────────── RUN ───────────────────────────

async function run() {
  // ═══════════ A · THE MODEL ═══════════

  check('A1 the board has exactly four columns, and LOST is not one of them', BOARD_STAGES, ['new', 'in_progress', 'proposal', 'won'])
  check('A2 LOST exists as a closed state', [ALL_STAGES.includes('lost'), isOpenStage('lost'), isOpenStage('won'), isOpenStage('proposal')], [true, false, false, true])
  check('A3 stages V1 did not write read as New — the column defaults to PROSPECT', [normalizeStage('PROSPECT'), normalizeStage(null), normalizeStage('proposal')], ['new', 'new', 'proposal'])
  check('A3b no extra stage names exist', ALL_STAGES.some((s) => /qualif|negotiat|contract|closed/i.test(s)), false)

  const legacyRow = toOpportunity({ id: 'o1', contact_id: C1, name: 'New Opportunity', value: 0, currency: 'USD', stage: 'PROSPECT', notes: null, created_at: at(-3), updated_at: at(-3) })
  check(
    'A4 a row without V1 columns reads safely: zero is no value, no next step',
    [legacyRow.stage, legacyRow.value, legacyRow.currency, legacyRow.nextAction],
    ['new', null, 'USD', null]
  )
  const withStep = toOpportunity({ id: 'o2', contact_id: C1, name: 'ACME', value: '12000', currency: 'eur', stage: 'proposal', next_action: ' Send quote ', next_action_type: 'quote', next_action_due_at: at(2), created_at: at(-3), updated_at: at(-1) })
  check('A5 a V1 row reads its next step', [withStep.value, withStep.currency, withStep.nextAction], [12000, 'EUR', { text: 'Send quote', type: 'quote', dueAt: at(2) }])
  check('A5b an unknown action type reads as Other, not an error', toOpportunity({ id: 'o', contact_id: C1, next_action: 'x', next_action_type: 'telepathy' }).nextAction?.type, 'other')

  check(
    'A6 one opportunity per person, the most recently touched one winning',
    onePerPerson([opp({ contactId: C1, id: 'old', updatedAt: at(-9) }), opp({ contactId: C1, id: 'new', updatedAt: at(-1) }), opp({ contactId: C2 })]).map((o) => o.id),
    ['new', `opp-${C2}`]
  )

  check('A7 amounts: positive only, separators tolerated, garbage rejected', [positiveAmount('12 000'), positiveAmount('1,500.50'), positiveAmount(0), positiveAmount(-4), positiveAmount('abc'), positiveAmount(null)], [12000, 1500.5, null, null, null, null])
  check('A8 money says its currency', [formatMoney(12000, 'EUR'), formatMoney(950, 'USD'), formatMoney(3000, 'CZK'), formatMoney(null, 'EUR')], ['€12,000', '$950', '3,000 Kč', ''])
  check(
    'A9 pipeline value is never added across currencies, and closed deals are not in play',
    openValueByCurrency([opp({ contactId: C1, value: 1000, currency: 'EUR' }), opp({ contactId: C2, value: 500, currency: 'USD' }), opp({ contactId: C3, value: 9000, currency: 'EUR', stage: 'won' })]),
    [{ currency: 'EUR', total: 1000 }, { currency: 'USD', total: 500 }]
  )

  const sarah = toCrmPerson(personRow({}))
  check('A10 a person reads from the contact, with the meeting projection', [sarah.name, sarah.company, sarah.event, sarah.discussed, sarah.followUp], ['Sarah Novak', 'ACME', 'Web Summit', 'Wants 40 seats before Q1', null])
  check(
    'A11 last interaction is the latest real one: meeting, message sent, or reply',
    [
      sarah.lastInteraction,
      toCrmPerson(personRow({ last_message_date: at(-3), last_message_type: 'Email' })).lastInteraction,
      toCrmPerson(personRow({ last_message_date: at(-3), reply_date: at(-1) })).lastInteraction?.label,
    ],
    [{ kind: 'met', at: at(-20), label: 'Met at Web Summit' }, { kind: 'message', at: at(-3), label: 'Email sent' }, 'Reply received']
  )
  check('A12 nothing counts as an interaction when nothing happened', lastInteractionOf({ event: null, metAt: null, lastFollowUp: null, replyAt: null }), null)
  check('A13 an unnamed deal is named after the company, else the person', [defaultOpportunityName({ name: 'Sarah', company: 'ACME' }), defaultOpportunityName({ name: 'Martin', company: null })], ['ACME', 'Martin'])
  check('A14 a bare due date is stored at noon UTC and reads back as the same date', [dueAtFromInput('2026-11-04'), dateInputValue(dueAtFromInput('2026-11-04')), dueAtFromInput('soon'), dueAtFromInput('')], ['2026-11-04T12:00:00.000Z', '2026-11-04', null, null])

  // ═══════════ B · NEXT AND PEOPLE ═══════════

  const martin = toCrmPerson(personRow({ id: C2, name: 'Martin Dvorak', company: null, meeting_topic: null, meeting_date: at(-2), scanned_at: at(-2), meeting_event_name: null }))
  const peter = toCrmPerson(personRow({ id: C3, name: 'Peter Hall', company: 'Globex', next_action: 'Send the brochure', next_action_date: at(-1), meeting_date: at(-30) }))
  const anna = toCrmPerson(personRow({ id: CO, name: 'Anna Berg', company: 'Initech', meeting_date: at(-40), scanned_at: at(-40) }))
  const people: CrmPerson[] = [sarah, martin, peter, anna]
  const deals: Opportunity[] = [
    opp({ contactId: C1, stage: 'proposal', nextAction: { text: 'Send quote', type: 'quote', dueAt: at(0) } }),
    opp({ contactId: C2, stage: 'new' }),
    opp({ contactId: CO, stage: 'in_progress' }),
    opp({ contactId: C3, stage: 'won' }),
  ]
  const next = buildNextItems(people, deals, NOW)
  check(
    'B1 Next lists real steps only: the deal step, the meeting follow-up, and deals with no step',
    next.map((i) => [i.source, i.contactId, i.group]),
    [
      ['meeting', C3, 'overdue'],
      ['deal', C1, 'today'],
      ['missing', CO, 'missing'],
      ['missing', C2, 'missing'],
    ]
  )
  check(
    'B2 "Reconnect" only when the last interaction is old; a recent one asks for a step',
    next.filter((i) => i.source === 'missing').map((i) => [i.person.name, i.text, i.context]),
    [['Anna Berg', 'Reconnect with Anna', 'Last interaction 40 days ago'], ['Martin Dvorak', 'Set a next step', 'Last interaction 2 days ago']]
  )
  check('B3 a meeting follow-up keeps its own words and its source', [next[0].text, next[0].context, next[0].stage], ['Send the brochure', 'From meeting · Web Summit', 'won'])
  check('B4 a deal step carries its stage', [next[1].text, next[1].type, next[1].context], ['Send quote', 'quote', 'Opportunity · Proposal'])
  check('B5 won and lost deals ask for no step of their own', next.some((i) => i.source !== 'meeting' && (i.stage === 'won' || i.stage === 'lost')), false)
  check('B6 a person with no deal and no follow-up is not on the list', buildNextItems([martin], [], NOW), [])

  const rowsFor = buildPeopleRows(people, deals, NOW)
  const filter = (f: Parameters<typeof matchesPeopleFilter>[1]) => rowsFor.filter((r) => matchesPeopleFilter(r, f)).map((r) => r.person.name)
  check('B7 People reuses every contact — none added, none dropped', rowsFor.map((r) => r.person.id), [C1, C2, C3, CO])
  check('B8 Opportunities = open deals; Won = won deals', [filter('opportunities'), filter('won')], [['Sarah Novak', 'Martin Dvorak', 'Anna Berg'], ['Peter Hall']])
  check('B9 Needs action = due today or earlier, or an open deal with no step', filter('needs_action'), ['Sarah Novak', 'Martin Dvorak', 'Peter Hall', 'Anna Berg'])
  check('B10 a row shows the deal step first, else the meeting follow-up', [rowsFor[0].next, rowsFor[2].next?.source], [{ text: 'Send quote', dueAt: at(0), source: 'deal' }, 'meeting'])
  check('B11 search covers name, company and event', [matchesPeopleQuery(rowsFor[0], 'acme'), matchesPeopleQuery(rowsFor[0], 'web sum'), matchesPeopleQuery(rowsFor[0], 'zzz')], [true, true, false])
  check('B12 the board drops deals whose contact is not the owner\'s', joinBoard([opp({ contactId: 'not-mine' }), opp({ contactId: C1 })], [sarah]).map((e) => e.person.id), [C1])

  // ═══════════ C · THE OLD BOARD ═══════════

  const legacy = (stage: string, value = 0) => toCrmPerson(personRow({ id: `${stage}-${value}`, pipeline_stage: stage, deal_value: value }))
  check(
    'C1 only deliberate old-board states are importable, mapped onto V1 stages',
    [legacyImportStage(legacy('new')), legacyImportStage(legacy('follow-up')), legacyImportStage(legacy('meeting')), legacyImportStage(legacy('deal')), legacyImportStage(legacy('won')), legacyImportStage(legacy('lost')), legacyImportStage(legacy('new', 500)), legacyImportStage(legacy('follow-up', 500))],
    [null, null, 'in_progress', 'proposal', 'won', null, 'new', 'in_progress']
  )
  check(
    'C2 people who already have a deal are never offered again',
    legacyImportCandidates([legacy('deal'), legacy('meeting')], [opp({ contactId: 'deal-0' })]).map((p) => p.id),
    ['meeting-0']
  )
  check('C3 a contact on the default "new" stage is never a candidate — every contact is not a deal', legacyImportCandidates([legacy('new'), legacy('follow-up')], []), [])

  // ═══════════ D · THE MIGRATION ═══════════

  const migration = read(MIGRATION)
  check('D1 the migration is additive: no drop table/column, no delete, no truncate', /drop\s+table|drop\s+column|\bdelete\s+from|truncate/i.test(migration.replace(/--.*$/gm, '')), false)
  check('D2 it sorts after every migration already in the repository', fs.readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort().pop(), path.basename(MIGRATION))

  const db = await database({
    v1: true,
    before: async (d) => {
      // A row from before V1, in the shape 20260622 left behind.
      await d.query('insert into public.crm_opportunities (contact_id, user_id) values ($1, $2)', [C3, OWNER])
    },
  })
  const cols = (await rows<{ column_name: string }>(db, "select column_name from information_schema.columns where table_schema='public' and table_name='crm_opportunities' order by column_name")).map((r) => r.column_name)
  check('D3 next-step columns added beside the original ones', ['next_action', 'next_action_type', 'next_action_due_at', 'stage', 'value', 'notes'].every((c) => cols.includes(c)), true)
  const kept = await rows<{ stage: string; name: string }>(db, 'select stage, name from public.crm_opportunities where contact_id = $1', [C3])
  check('D4 rows written before V1 survive untouched', kept, [{ stage: 'PROSPECT', name: 'New Opportunity' }])
  let reapplied = true
  try {
    await db.exec(migration)
  } catch {
    reapplied = false
  }
  check('D5 the migration re-applies cleanly', reapplied, true)
  const indexes = (await rows<{ indexname: string }>(db, "select indexname from pg_indexes where tablename = 'crm_opportunities'")).map((r) => r.indexname)
  check('D6 one opportunity per person is a unique index', indexes.includes('crm_opportunities_user_contact_key'), true)

  let dup: string | null = null
  try {
    await db.query('insert into public.crm_opportunities (contact_id, user_id) values ($1, $2)', [C3, OWNER])
  } catch (err) {
    dup = (err as { code?: string }).code ?? 'error'
  }
  check('D7 the database refuses a second opportunity for the same person', dup, '23505')

  let typeError: string | null = null
  try {
    await db.query("insert into public.crm_opportunities (contact_id, user_id, next_action_type) values ($1, $2, 'telepathy')", [C2, OWNER])
  } catch (err) {
    typeError = (err as { code?: string }).code ?? 'error'
  }
  check('D8 next-step kinds are the six V1 offers', typeError, '23514')

  const crossTenant = await asUser(db, OTHER, async () => {
    await db.query('insert into public.crm_opportunities (contact_id, user_id) values ($1, $2)', [C1, OTHER])
    return 'inserted'
  })
  check('D9 nobody can open a deal on somebody else\'s contact, even naming themselves as owner', crossTenant, { error: '23503' })
  const theirs = await asUser(db, OTHER, async () => (await db.query('select id from public.crm_opportunities')).rows.length)
  check('D10 RLS: another owner sees none of these opportunities', theirs, 0)
  const anon = await asUser(db, null, async () => (await db.query('select id from public.crm_opportunities')).rows.length)
  check('D11 signed-out requests hold no privilege at all', anon, { error: '42501' })
  const policy = await rows<{ qual: string; with_check: string }>(db, "select qual, with_check from pg_policies where tablename = 'crm_opportunities'")
  check('D12 the policy checks the owner on read and on write', policy.map((p) => [p.qual.includes('auth.uid()'), (p.with_check ?? '').includes('auth.uid()')]), [[true, true]])

  const dupDb = await database({
    v1: false,
    before: async (d) => {
      await d.query('insert into public.crm_opportunities (contact_id, user_id) values ($1, $2), ($1, $2)', [C1, OWNER])
    },
  })
  let dupApplied = true
  try {
    await quietly(() => dupDb.exec(migration))
  } catch {
    dupApplied = false
  }
  const dupIndexes = (await rows<{ indexname: string }>(dupDb, "select indexname from pg_indexes where tablename = 'crm_opportunities'")).map((r) => r.indexname)
  const dupCount = (await rows<{ n: number }>(dupDb, 'select count(*)::int as n from public.crm_opportunities'))[0].n
  check('D13 pre-existing duplicates neither fail the migration nor get deleted', [dupApplied, dupIndexes.includes('crm_opportunities_user_contact_key'), dupCount], [true, false, 2])
  await dupDb.close()

  // ═══════════ E · THE WRITE PATHS, THROUGH RLS ═══════════

  const as = clientAs(db, OWNER)
  const first = await createOpportunity(as, { userId: OWNER, contactId: C1, name: 'ACME', stage: 'new', value: 12000, currency: 'EUR', note: 'Met at the booth', nextAction: { text: 'Send quote', type: 'quote', dueAt: at(3) } })
  check(
    'E1 create starts in New with the owner\'s value, note and next step',
    first.ok ? [first.created, first.nextActionSaved, first.opportunity.stage, first.opportunity.value, first.opportunity.note, first.opportunity.nextAction?.text] : first,
    [true, true, 'new', 12000, 'Met at the booth', 'Send quote']
  )
  const again = await createOpportunity(as, { userId: OWNER, contactId: C1, name: 'Other', stage: 'new', value: null, currency: 'EUR', note: null, nextAction: null })
  const count = (await rows<{ n: number }>(db, 'select count(*)::int as n from public.crm_opportunities where contact_id = $1', [C1]))[0].n
  check('E2 asking twice returns the existing opportunity, never a duplicate', [again.ok && again.created, again.ok && first.ok && again.opportunity.id === first.opportunity.id, count], [false, true, 1])

  const id = first.ok ? first.opportunity.id : ''
  const moved = await updateOpportunity(as, { userId: OWNER, id, patch: { stage: 'proposal', value: null } })
  check('E3 the owner moves the stage and can clear the value', [moved.opportunity?.stage, moved.opportunity?.value], ['proposal', null])
  const cleared = await setNextAction(as, { userId: OWNER, id, nextAction: null })
  check('E4 a next step can be marked done/cleared', cleared.opportunity?.nextAction, null)

  const stranger = clientAs(db, OTHER)
  const hijack = await updateOpportunity(stranger, { userId: OTHER, id, patch: { stage: 'lost' } })
  const lookup = await findOpportunityForContact(stranger, { userId: OTHER, contactId: C1 })
  const after = (await rows<{ stage: string }>(db, 'select stage from public.crm_opportunities where id = $1', [id]))[0].stage
  check('E5 another owner can neither read nor move this deal', [hijack.opportunity, lookup.opportunity, after], [null, null, 'proposal'])

  const preV1 = await database({ v1: false })
  const partial = await quietly(() =>
    createOpportunity(clientAs(preV1, OWNER), { userId: OWNER, contactId: C2, name: 'Martin', stage: 'new', value: null, currency: 'EUR', note: null, nextAction: { text: 'Call Martin', type: 'call', dueAt: null } })
  )
  const missing = await setNextAction(clientAs(preV1, OWNER), { userId: OWNER, id: partial.ok ? partial.opportunity.id : '', nextAction: { text: 'x', type: 'call', dueAt: null } })
  check(
    'E6 before the migration: the deal is still created, the step is reported unsaved, and the error is recognised',
    [partial.ok && partial.created, partial.ok && partial.nextActionSaved, isMissingSchema(missing.error)],
    [true, false, true]
  )
  await preV1.close()

  check('E7 a next step needs words; kind and date are optional', [parseNextAction({ text: '  ' }), parseNextAction({ text: 'Call', type: 'nope' })], [null, { text: 'Call', type: 'other', dueAt: null }])
  check(
    'E8 edits are validated: real stages only, positive values, a name that is not blank',
    [parsePatch({ stage: 'negotiation' }, isStage).invalid, parsePatch({ value: -5 }, isStage).invalid, parsePatch({ name: ' ' }, isStage).invalid, parsePatch({ stage: 'won', value: '' }, isStage)],
    ['stage', 'value', 'name', { patch: { stage: 'won', value: null }, invalid: null }]
  )

  await db.close()

  // ═══════════ F · THE ROUTES ═══════════

  type Handler = (req: NextRequest, ctx?: { params: Record<string, string> }) => Promise<Response>
  const LEAK = /constraint|violates|SUPABASE_|relation "|does not exist|cookies|request scope|stack|Error:/
  const json = (url: string, method: string, body: unknown) => new NextRequest(url, { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
  const routes: { route: string; method: string; req: () => NextRequest; ctx?: { params: Record<string, string> }; want: string }[] = [
    { route: 'app/api/crm/opportunities/route', method: 'POST', req: () => json('https://www.abccard.io/api/crm/opportunities', 'POST', { contactId: C1 }), want: 'Could not create this opportunity. Try again.' },
    { route: 'app/api/crm/opportunities/[id]/route', method: 'PATCH', req: () => json(`https://www.abccard.io/api/crm/opportunities/${C1}`, 'PATCH', { stage: 'won' }), ctx: { params: { id: C1 } }, want: 'Could not update this opportunity. Try again.' },
    { route: 'app/api/crm/opportunities/[id]/next-action/route', method: 'POST', req: () => json(`https://www.abccard.io/api/crm/opportunities/${C1}/next-action`, 'POST', { action: 'clear' }), ctx: { params: { id: C1 } }, want: 'Could not save the next step. Try again.' },
    { route: 'app/api/crm/opportunities/import/route', method: 'POST', req: () => json('https://www.abccard.io/api/crm/opportunities/import', 'POST', {}), want: 'Could not bring those deals over. Try again.' },
  ]
  const observed: unknown[] = []
  const expected: unknown[] = []
  for (const r of routes) {
    const mod = (await import(`@/${r.route}`)) as Record<string, Handler>
    const outcome = await quietly(async () => {
      const res = await mod[r.method](r.req(), r.ctx)
      const text = await res.text()
      return [r.route, res.status, JSON.parse(text).error, LEAK.test(text)]
    })
    observed.push(outcome)
    expected.push([r.route, 500, r.want, false])
  }
  check('F1 every CRM route fails in its own words, leaking nothing', observed, expected)

  const apiFiles = files('app/api/crm/opportunities')
  check('F2 internal CRM is not a Pro feature — no route is gated', apiFiles.filter((f) => /requirePro|lib\/entitlements/.test(code(f))), [])
  check('F3 every route answers the unexpected through serverErrorResponse', apiFiles.filter((f) => !code(f).includes('serverErrorResponse(')), [])
  check('F4 no route returns a raw error message', apiFiles.filter((f) => /error: (err|error)\??\.message/.test(code(f))), [])

  // ═══════════ G · THE APP AROUND IT ═══════════

  const shipped = [...files('app'), ...files('components'), ...files('lib'), 'middleware.ts']
  check(
    'G1 only the create and import routes insert opportunities — nothing creates a deal on its own',
    shipped.filter((f) => /from\('crm_opportunities'\)[\s\S]{0,80}\.insert\(|createOpportunity\(/.test(code(f))).sort(),
    ['app/api/crm/opportunities/import/route.ts', 'app/api/crm/opportunities/route.ts', 'lib/opportunities/store.ts']
  )
  check(
    'G2 stages move only through the opportunity edit route; the CRM engine never touches opportunities',
    [shipped.filter((f) => /updateOpportunity\(/.test(code(f))).sort(), /crm_opportunities/.test(code('lib/crm-engine.ts'))],
    [['app/api/crm/opportunities/[id]/route.ts', 'lib/opportunities/store.ts'], false]
  )
  check('G3 the CRM never writes the legacy contact pipeline stage', files('components/opportunities').concat(files('lib/opportunities'), files('app/crm'), files('app/api/crm/opportunities')).filter((f) => /pipeline_stage['"]?\s*:/.test(code(f))), [])
  check('G4 middleware protects /crm and still protects /pipeline', [code('middleware.ts').includes("'/crm',"), code('middleware.ts').includes("'/pipeline',")], [true, true])
  check('G5 /pipeline redirects to /crm, so old links keep working', [code('app/pipeline/page.tsx').includes("redirect('/crm')"), exists('app/pipeline/loading.tsx')], [true, false])
  check(
    'G6 the sidebar says CRM where it said Pipeline',
    [code('components/layout/DesktopSidebar.tsx').includes("label: 'CRM', path: '/crm'"), /label: 'Pipeline'/.test(code('components/layout/DesktopSidebar.tsx'))],
    [true, false]
  )
  check('G7 Home links its opportunity figure to the CRM and counts real opportunities', [code('components/dashboard/EventsCard.tsx').includes("href: '/crm'"), code('lib/dashboard-data.ts').includes(".from('crm_opportunities')")], [true, true])
  check(
    'G8 every CRM route has its own light loading state',
    ['app/crm/(tabs)/loading.tsx', 'app/crm/(tabs)/people/loading.tsx', 'app/crm/(tabs)/next/loading.tsx', 'app/crm/opportunities/[id]/loading.tsx'].map((f) => exists(f) && code(f).includes('Skeleton')),
    [true, true, true, true]
  )
  const crmUi = [...files('components/opportunities'), ...files('app/crm')]
  check('G9 no dark surfaces in the CRM — the workspace is light champagne', crmUi.filter((f) => /#0a0a0b|#121214|#18181b|#1a1a1a|bg-black|bg-neutral-9|bg-zinc-9/.test(code(f))), [])
  check(
    'G10 the CRM loads in one wave: opportunities and people side by side',
    /Promise\.all\(\[\s*supabase\s*\.from\('crm_opportunities'\)[\s\S]*?\.from\('scanned_contacts'\)/.test(code('lib/opportunities/data.ts')),
    true
  )
  check('G11 the contact screen reads its opportunity in the same parallel wave', /Promise\.all\(\[[\s\S]*?\.from\('crm_opportunities'\)[\s\S]*?\]\)/.test(code('lib/contact-detail.ts')), true)
  check('G12 the opportunity screen reuses the contact loader and the existing CRM push card', [code('lib/opportunities/data.ts').includes('getContactDetail('), code('components/opportunities/OpportunityDetailView.tsx').includes('<CrmPushCard contact={contact} />')], [true, true])
  check(
    'G13 People opens the existing Contact Detail, not a second person screen',
    [code('components/opportunities/PeopleView.tsx').includes('href={`/contacts/${person.id}`}'), files('app/crm').some((f) => /people\/\[/.test(f))],
    [true, false]
  )
  check('G14 meeting follow-ups are completed through the follow-up route, not rewritten', [code('components/opportunities/NextView.tsx').includes("fetch('/api/follow-ups'"), shipped.filter((f) => f.startsWith('app/api/crm/opportunities') && /contact_encounters/.test(code(f)))], [true, []])

  /*
    Relationship history must only record what happened. The vCard route logs
    "Saved to phone" on every GET, so it may only be reached by a tap: a
    prefetching <Link> to it logged the activity whenever Contact Detail opened.
  */
  const bits = flatCode('components/ui/abc/Bits.tsx')
  check(
    'G15 IconTile sends /api/ routes through a plain anchor, before the prefetching <Link>',
    [
      /if \(href && !disabled && href\.startsWith\('\/api\/'\)\) \{ return \( <a href=\{href\}/.test(bits),
      bits.indexOf("href.startsWith('/api/')") > -1 && bits.indexOf("href.startsWith('/api/')") < bits.indexOf('<Link href={href}'),
    ],
    [true, true]
  )
  check(
    'G16 the Save contact tile is that IconTile, and no <Link> anywhere points at an /api/ route',
    [
      /<IconTile[^>]*?href=\{`\/api\/contact\/vcard\/\$\{contact\.id\}`\}/.test(flatCode('components/contacts/detail/ContactDetailView.tsx')),
      shipped.filter((f) => /<Link[^>]*?\bhref=\{?\s*[`'"]\/api\//.test(flatCode(f))),
    ],
    [true, []]
  )
  const vcardRoute = code('app/api/contact/vcard/[id]/route.ts')
  check(
    'G17 the vCard route finishes recording the save before it responds',
    vcardRoute.includes('await onVCardSaved(contact.id, user.id)') &&
      vcardRoute.indexOf('await onVCardSaved') < vcardRoute.indexOf('return new Response(vcard'),
    true
  )

  const total = passed + failures.length
  if (failures.length) {
    console.log(`\nCRM V1: ${passed}/${total} PASS, ${failures.length} FAILED\n`)
    for (const failure of failures) console.log('  FAIL ' + failure)
    process.exit(1)
  }
  console.log(`\nCRM V1: ${passed}/${total} PASS`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
