/**
 * Planned events: what may create an event, and what may link a meeting to one.
 *
 * Checked against the real code and the real migrations, in PGlite:
 *
 *   A  the planning rules: input, phases, ordering
 *   B  only the owner's explicit action creates an event; scan, OCR, import,
 *      enrichment, follow-ups and CRM sync cannot
 *   C  a meeting carries a link only when the owner chose one, and it is authorized
 *   D  counts: people and meetings are different numbers, and text plays no part
 *   E  the migration: additive, re-runnable, owner-scoped, existing data intact
 *   F  the approved planet is the one background on every Events route
 *   G  everything keeps working on a database that has not had the migration
 *
 * Run with: npm run test:planned-events
 */

import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'
import { encounterPayload, type MeetingInput } from '@/lib/encounters'
import {
  eventDateLabel,
  eventPhase,
  listPlannedEvents,
  ownsPlannedEvent,
  parsePlannedEventInput,
  sortForPlanning,
} from '@/lib/events/planned'
import {
  buildPlannedEventWorkspace,
  groupEncountersIntoEvents,
  type GroupingInput,
  type WorkspaceEncounter,
} from '@/lib/events/workspace'

const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel))

let passed = 0
const failures: string[] = []
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) passed++
  else failures.push(`${name}\n       got      ${a}\n       expected ${e}`)
}

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) sources(rel, out)
    else if (/\.tsx?$/.test(entry.name)) out.push(rel)
  }
  return out
}

const OWNER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const C1 = '00000000-0000-4000-8000-000000000001'
const C2 = '00000000-0000-4000-8000-000000000002'
const CO = '00000000-0000-4000-8000-000000000009'
const MIGRATION = 'supabase/migrations/20261102120000_planned_events.sql'

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

async function as<T>(db: PGlite, role: 'anon' | 'authenticated', sub: string | null, run: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}`)
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [sub ?? ''])
  try {
    return await run()
  } finally {
    await db.exec('reset role')
  }
}

/** The Postgres error code a statement fails with, or null if it succeeds. */
async function failure(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run()
    return null
  } catch (err) {
    return String((err as { code?: string }).code ?? 'unknown')
  }
}

async function run() {
  // ─────────────────────────── A. PLANNING RULES ───────────────────────────
  const NOW = new Date('2026-11-02T12:00:00')

  const parsed = parsePlannedEventInput({
    name: '  MEDICA 2026 ',
    startsOn: '2026-11-16',
    endsOn: '2026-11-19',
    location: ' Düsseldorf ',
    objectives: 'Meet three distributors',
    source: 'verified',
    user_id: OTHER,
  })
  check('A1 a valid event is accepted, trimmed', parsed.ok && [parsed.value.name, parsed.value.location], ['MEDICA 2026', 'Düsseldorf'])
  check('A2 the request cannot claim a source or an owner', parsed.ok && ['source' in parsed.value, 'user_id' in parsed.value], [false, false])
  check('A3 only a name is required', parsePlannedEventInput({ name: 'Interzoo' }).ok, true)
  check('A4 no name is refused', parsePlannedEventInput({ name: '   ' }), { ok: false, error: 'Give the event a name.' })
  check('A5 nothing at all is refused', parsePlannedEventInput(null).ok, false)
  check('A6 a malformed date is refused', parsePlannedEventInput({ name: 'x', startsOn: 'tomorrow' }).ok, false)
  check('A7 a date that rolls over is refused', parsePlannedEventInput({ name: 'x', startsOn: '2026-02-31' }).ok, false)
  check('A8 an event cannot end before it starts', parsePlannedEventInput({ name: 'x', startsOn: '2026-06-05', endsOn: '2026-06-01' }), { ok: false, error: 'The event ends before it starts.' })
  check('A9 long text is cut, not stored whole', parsed.ok && (parsePlannedEventInput({ name: 'x'.repeat(500) }) as { value: { name: string } }).value.name.length, 160)

  const planned = (startsOn: string | null, endsOn: string | null = startsOn, name = 'x') => ({ startsOn, endsOn, name })
  check(
    'A10 phases follow the dates',
    [eventPhase(planned('2026-11-16'), NOW), eventPhase(planned('2026-11-01', '2026-11-05'), NOW), eventPhase(planned('2026-06-15', '2026-06-19'), NOW), eventPhase(planned(null), NOW)],
    ['upcoming', 'during', 'past', 'undated']
  )
  check(
    'A11 what is happening or next comes first, the past last and newest first',
    sortForPlanning([planned('2025-06-01', '2025-06-02', 'old'), planned('2026-06-01', '2026-06-02', 'recent'), planned(null, null, 'someday'), planned('2027-01-01', '2027-01-02', 'later'), planned('2026-12-01', '2026-12-02', 'soon'), planned('2026-11-01', '2026-11-05', 'now')], NOW).map((e) => e.name),
    ['now', 'soon', 'later', 'someday', 'recent', 'old']
  )
  check('A12 no dates, no invented date', eventDateLabel(planned(null)), null)

  // ─────────────────────────── B. ONLY AN EXPLICIT ACTION CREATES AN EVENT ───────────────────────────
  const all = [...sources('app'), ...sources('lib'), ...sources('components')]
  const naming = all.filter((file) => read(file).includes("from('planned_events')"))
  const inserting = naming.filter((file) => /from\('planned_events'\)\s*\.insert\(/.test(read(file)))
  check('B1 exactly one piece of code inserts an event', inserting, ['lib/events/planned.ts'])
  check(
    'B2 exactly one route calls it',
    all.filter((file) => file !== 'lib/events/planned.ts' && read(file).includes('createPlannedEvent')),
    ['app/api/events/planned/route.ts']
  )
  check('B3 and it is the POST of Plan an event', read('app/api/events/planned/route.ts').indexOf('export async function POST') < read('app/api/events/planned/route.ts').indexOf('await createPlannedEvent('), true)

  const mustNotCreate = [
    // Scanning and OCR
    ...sources('app/api/scan'),
    ...sources('app/api/card'),
    ...sources('lib/scan'),
    'lib/claude.ts',
    'lib/event-normalizer.ts',
    // Enrichment, follow-ups, contact import, CRM sync
    ...sources('app/api/enrich'),
    ...sources('app/api/follow-ups'),
    ...sources('app/api/contact'),
    ...sources('lib/contacts'),
    ...sources('lib/crm'),
    'lib/crm.ts',
    'lib/crm-engine.ts',
    'lib/encounters.ts',
    'lib/qr-connect.ts',
  ].filter(exists)
  check('B4 the scan, OCR, enrichment, follow-up and CRM code was all looked at', mustNotCreate.length > 20, true)
  check(
    'B5 none of it can write the events table',
    mustNotCreate.filter((file) => /from\('planned_events'\)[\s\S]{0,40}\.(insert|upsert|update)\(|createPlannedEvent/.test(read(file))),
    []
  )
  check('B6 the vision model is never asked for an event record', /planned_event|plannedEvent/.test(read('lib/claude.ts')), false)
  check('B7 the migration adds no trigger that could make one', /create\s+(or\s+replace\s+)?trigger/i.test(read(MIGRATION)), false)
  check('B8 and backfills nothing from meeting text', /insert\s+into\s+public\.planned_events|update\s+public\.contact_encounters/i.test(read(MIGRATION)), false)

  // ─────────────────────────── C. THE LINK IS EXPLICIT AND AUTHORIZED ───────────────────────────
  const meeting: MeetingInput = { event: 'Paris Eurosatory', eventNormalized: 'Eurosatory, Paris', discussed: null, nextAction: null, followUpAt: null }
  check('C1 a meeting with no choice writes no link at all, so saving a scan is unchanged', 'planned_event_id' in encounterPayload(meeting, {}), false)
  check('C2 event text alone never produces a link', encounterPayload(meeting, {}).event, 'Paris Eurosatory')
  check('C3 a chosen event is written', (encounterPayload({ ...meeting, plannedEventId: C1 }, {}) as Record<string, unknown>).planned_event_id, C1)
  check('C4 choosing None on a revision clears it', (encounterPayload({ ...meeting, plannedEventId: null }, {}) as Record<string, unknown>).planned_event_id, null)

  const context = read('app/api/card/context/route.ts')
  const save = read('app/api/scan/batch/[id]/save/route.ts')
  check('C5 the meeting route takes the link only from the request', [context.includes('plannedEventId = body.plannedEventId'), /plannedEventId\s*=\s*.*(whereMet|normalizedEvent)/.test(context)], [true, false])
  check('C6 and proves the event is the owner’s before writing anything', context.indexOf('ownsPlannedEvent(supabase, user.id, body.plannedEventId)') > 0 && context.indexOf('ownsPlannedEvent(') < context.indexOf('await updateEncounter(supabase'), true)
  check('C7 a stranger’s event is plainly not found', context.includes("{ error: 'Planned event not found' }, { status: 404 }"), true)
  check('C8 Multi-Card checks it before a card is written', save.indexOf('ownsPlannedEvent(auth, user.id, plannedEventId)') > 0 && save.indexOf('ownsPlannedEvent(') < save.indexOf('await saveSharedContext('), true)
  check('C9 a link is proved on the owner’s own client', save.includes('ownsPlannedEvent(auth,'), true)

  const select = read('components/events/PlannedEventSelect.tsx')
  check('C10 the choice defaults to None', [select.includes('<option value="">None</option>'), select.includes("value={value ?? ''}")], [true, true])
  check('C11 nothing preselects an event from text, date or place', /whereMet|location|match|eventName|\.find\(/.test(select), false)
  check('C12 with no planned events the field is not shown', select.includes('if (options.length === 0) return null'), true)
  check('C13 single card starts on None', read('components/scan/ScanClient.tsx').includes('followUpAt: null, plannedEventId: null }'), true)
  check('C14 Multi-Card starts on None', read('components/scan/MultiCardClient.tsx').includes('useState<string | null>(null)') && read('components/scan/MultiCardClient.tsx').includes('plannedEventId: plannedEventId ?? undefined'), true)
  check('C15 a choice alone is enough to save the link', read('components/scan/ScanClient.tsx').includes('context.followUpAt ||\n          context.plannedEventId'), true)
  check('C16 editing a note cannot change a meeting’s link', read('components/contacts/detail/MeetingContextForm.tsx').includes('...(plannedEventTouched ? { plannedEventId } : {})'), true)

  const noRow = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) } as unknown as SupabaseClient
  const ownRow = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: C1 }, error: null }) }) }) }) }) } as unknown as SupabaseClient
  check('C17 an event the owner does not have fails the check', await ownsPlannedEvent(noRow, OWNER, C1), false)
  check('C18 one they do passes it', await ownsPlannedEvent(ownRow, OWNER, C1), true)
  check('C19 anything that is not an id fails without a query', [await ownsPlannedEvent(ownRow, OWNER, 'Eurosatory'), await ownsPlannedEvent(ownRow, OWNER, null)], [false, false])

  // ─────────────────────────── D. COUNTS ───────────────────────────
  const encounter = (id: string, contactId: string, overrides: Partial<WorkspaceEncounter> = {}): WorkspaceEncounter => ({
    id,
    contactId,
    metAt: '2026-10-30T17:10:00Z',
    event: 'Paris Eurosatory',
    eventNormalized: 'Eurosatory, Paris',
    discussed: null,
    nextAction: null,
    followUpAt: null,
    ...overrides,
  })
  const input = (encounters: WorkspaceEncounter[]): GroupingInput => ({ encounters, people: new Map(), crmByEncounter: new Map(), now: NOW })
  const EVENT = { id: 'planned-1', name: 'Eurosatory 2026' }

  const met = input([
    encounter('m1', 'c1', { plannedEventId: 'planned-1' }),
    encounter('m2', 'c1', { plannedEventId: 'planned-1' }),
    encounter('m3', 'c2', { plannedEventId: 'planned-1' }),
    encounter('m4', 'c3'),
    encounter('m5', 'c4', { plannedEventId: 'planned-2' }),
  ])
  const linked = buildPlannedEventWorkspace(met, EVENT).summary
  check('D1 one contact met twice is two meetings', linked.encounters, 3)
  check('D2 and one person', linked.people, 2)
  check('D3 only meetings the owner linked count, whatever their text says', buildPlannedEventWorkspace(met, EVENT).encounters.map((row) => row.encounterId).sort(), ['m1', 'm2', 'm3'])
  check('D4 another event’s meetings stay there', buildPlannedEventWorkspace(met, { id: 'planned-2', name: 'x' }).summary.encounters, 1)
  check('D5 an event nobody linked anything to has no meetings, not guessed ones', buildPlannedEventWorkspace(met, { id: 'planned-3', name: 'Paris Eurosatory' }).summary.encounters, 0)
  check('D6 a linked meeting leaves the meeting notes, so nothing is reported twice', groupEncountersIntoEvents(met).map((g) => g.encounters), [1])

  // The record that prompted this: two contact rows, a meeting on each.
  const twoRows = groupEncountersIntoEvents(input([encounter('e1', 'row-a'), encounter('e2', 'row-b')]))
  check('D7 two contact rows count as two until the owner says otherwise', [twoRows[0].people, twoRows[0].encounters], [2, 2])
  check('D8 and are never merged by name here', /\.name\b.*new Set|new Set\(.*\.name/.test(read('lib/events/workspace.ts')), false)

  // ─────────────────────────── E. THE MIGRATION ───────────────────────────
  const db = new PGlite()
  await db.exec(BASE_SCHEMA)
  await db.exec(read('supabase/migrations/20260823120000_contact_encounters.sql'))
  for (const user of [OWNER, OTHER]) {
    await db.query('insert into auth.users (id) values ($1)', [user])
    await db.query('insert into public.abc_profiles (id) values ($1)', [user])
  }
  for (const [id, owner, name] of [[C1, OWNER, 'Sarah Novak'], [C2, OWNER, 'Martin Dvorak'], [CO, OTHER, 'Someone Else']]) {
    await db.query('insert into public.scanned_contacts (id, user_id, name) values ($1, $2, $3)', [id, owner, name])
  }
  const E1 = 'e0000000-0000-4000-8000-000000000001'
  const E2 = 'e0000000-0000-4000-8000-000000000002'
  const EO = 'e0000000-0000-4000-8000-000000000009'
  for (const [id, contact, owner, event] of [[E1, C1, OWNER, 'Paris Eurosatory'], [E2, C2, OWNER, 'A note about a stand'], [EO, CO, OTHER, 'Elsewhere']]) {
    await db.query(`insert into public.contact_encounters (id, contact_id, user_id, event, discussed, follow_up_at) values ($1, $2, $3, $4, 'Discussed', '2026-11-05T08:00:00Z')`, [id, contact, owner, event])
  }
  const snapshot = async () => {
    const { rows } = await db.query<Record<string, unknown>>('select id, contact_id, user_id, event, event_normalized, discussed, next_action, follow_up_at, met_at, created_at from public.contact_encounters order by id')
    const { rows: people } = await db.query<Record<string, unknown>>('select * from public.scanned_contacts order by id')
    return JSON.stringify({ rows, people })
  }
  const before = await snapshot()

  await db.exec(read(MIGRATION))
  check('E1 existing contacts and meetings are byte for byte what they were', await snapshot(), before)
  check('E2 no event was created from them', (await db.query('select id from public.planned_events')).rows.length, 0)
  check('E3 every existing meeting starts with no link', (await db.query('select id from public.contact_encounters where planned_event_id is not null')).rows.length, 0)
  await db.exec(read(MIGRATION))
  check('E4 running it twice changes nothing', [await snapshot() === before, (await db.query('select id from public.planned_events')).rows.length], [true, 0])

  const insert = (owner: string, name: string) => db.query<{ id: string }>('insert into public.planned_events (user_id, name) values ($1, $2) returning id', [owner, name])
  const mine = await as(db, 'authenticated', OWNER, () => insert(OWNER, 'Eurosatory 2026'))
  const MINE = mine.rows[0].id
  const theirs = await as(db, 'authenticated', OTHER, () => insert(OTHER, 'Their fair'))
  const THEIRS = theirs.rows[0].id
  check('E5 a planned event can be created by its owner', typeof MINE, 'string')
  check('E6 and starts as a manual event', (await db.query('select source from public.planned_events where id = $1', [MINE])).rows, [{ source: 'manual' }])
  check('E7 nobody can create one for somebody else', await failure(() => as(db, 'authenticated', OTHER, () => insert(OWNER, 'Forged'))), '42501')
  check('E8 owners see only their own', (await as(db, 'authenticated', OWNER, () => db.query<{ id: string }>('select id from public.planned_events'))).rows.map((r) => r.id), [MINE])
  check('E9 signed out, the table is closed', await failure(() => as(db, 'anon', null, () => db.query('select id from public.planned_events'))), '42501')
  check('E10 a client cannot call its own event verified', await failure(() => as(db, 'authenticated', OWNER, () => db.query("insert into public.planned_events (user_id, name, source) values ($1, 'x', 'verified')", [OWNER]))), '42501')
  check('E11 nor change it later', await failure(() => as(db, 'authenticated', OWNER, () => db.query("update public.planned_events set source = 'verified' where id = $1", [MINE]))), '42501')
  check('E12 the product offers no delete, so the role has none', await failure(() => as(db, 'authenticated', OWNER, () => db.query('delete from public.planned_events where id = $1', [MINE]))), '42501')
  check('E13 an event cannot end before it starts', await failure(() => db.query("insert into public.planned_events (user_id, name, starts_on, ends_on) values ($1, 'x', '2026-06-05', '2026-06-01')", [OWNER])), '23514')

  const link = (encounterId: string, eventId: string | null) => db.query('update public.contact_encounters set planned_event_id = $1 where id = $2', [eventId, encounterId])
  await as(db, 'authenticated', OWNER, () => link(E1, MINE))
  check('E14 an owner can link their own meeting to their own event', (await db.query('select planned_event_id from public.contact_encounters where id = $1', [E1])).rows, [{ planned_event_id: MINE }])
  check('E15 the database refuses a link to somebody else’s event', await failure(() => as(db, 'authenticated', OWNER, () => link(E2, THEIRS))), '23503')
  const touched = await as(db, 'authenticated', OWNER, () => db.query('update public.contact_encounters set planned_event_id = $1 where id = $2', [MINE, EO]))
  check('E16 nobody can link somebody else’s meeting', touched.affectedRows ?? 0, 0)
  await as(db, 'authenticated', OWNER, () => link(E1, null))
  check('E17 a link can be cleared, and the meeting stays', (await db.query<{ event: string; planned_event_id: string | null }>('select event, planned_event_id from public.contact_encounters where id = $1', [E1])).rows[0], { event: 'Paris Eurosatory', planned_event_id: null })
  await as(db, 'authenticated', OWNER, () => link(E1, MINE))

  // Repeated scans of the same fair, by the same owner.
  const eventsBefore = (await db.query('select id from public.planned_events')).rows.length
  for (let i = 0; i < 5; i++) {
    await as(db, 'authenticated', OWNER, () => db.query("insert into public.contact_encounters (contact_id, user_id, event, event_normalized) values ($1, $2, 'Paris Eurosatory', 'Eurosatory, Paris')", [C1, OWNER]))
  }
  check('E18 repeated scans naming the same fair create no event', (await db.query('select id from public.planned_events')).rows.length, eventsBefore)
  check('E19 they are still saved as meetings, unlinked', (await db.query("select id from public.contact_encounters where event = 'Paris Eurosatory' and planned_event_id is null")).rows.length, 5)
  check('E20 a new contact and meeting with no event still save', await failure(() => as(db, 'authenticated', OWNER, () => db.query('insert into public.contact_encounters (contact_id, user_id) values ($1, $2)', [C2, OWNER]))), null)

  await db.query('delete from public.scanned_contacts where id = $1', [C1])
  check('E21 deleting a contact removes its meetings and keeps the event', [(await db.query('select id from public.contact_encounters where contact_id = $1', [C1])).rows.length, (await db.query('select id from public.planned_events where id = $1', [MINE])).rows.length], [0, 1])
  await db.query('delete from public.contact_encounters where user_id = $1', [OWNER])
  await db.query('delete from public.abc_profiles where id = $1', [OWNER])
  check('E22 account deletion, which removes meetings first, removes the owner’s events', (await db.query('select id from public.planned_events where user_id = $1', [OWNER])).rows.length, 0)
  check('E23 and only theirs', (await db.query('select id from public.planned_events')).rows.length, 1)
  await db.close()

  // ─────────────────────────── F. THE APPROVED PLANET ───────────────────────────
  const shell = read('components/layout/AppShell.tsx')
  const css = read('app/globals.css')
  const ASSET = 'public/abc/abc-global-network-bg.webp'
  check('F1 the approved asset is in the repository', exists(ASSET), true)
  check('F2 every Events route uses it, through one class in the shell', shell.includes("if (pathname === '/events' || pathname.startsWith('/events/')) return 'global abc-net-events'"), true)
  check('F3 that class paints the approved asset', /\.abc-motif-global \{[^}]*url\('\/abc\/abc-global-network-bg\.webp'\)/.test(css), true)
  check('F4 the wireframe it replaces is gone', [exists('public/hero/motif-arcs.svg'), css.includes('motif-arcs'), shell.includes("return 'arcs'")], [false, false, false])
  check('F5 with its own strength, so text stays readable', /\.abc-net-events \{\s*--abc-net-veil: 0\.\d+;/.test(css), true)
  const eventScreens = [
    'components/events/EventsListView.tsx',
    'components/events/EventDetailView.tsx',
    'components/events/PlannedEventDetailView.tsx',
    'components/events/PlannedEventForm.tsx',
  ]
  check('F6 no Events screen paints a background of its own', eventScreens.filter((file) => /background-image|backgroundImage|url\(|abc-motif/.test(read(file))), [])
  check('F7 create, edit and detail all sit under that route', ['app/events/new/page.tsx', 'app/events/planned/[id]/page.tsx', 'app/events/planned/[id]/edit/page.tsx'].every(exists), true)
  check('F8 the scanner’s camera does not get it', /pathname === '\/scan'\) return/.test(shell.slice(shell.indexOf('function motifFor'), shell.indexOf('export default'))), false)

  // Rendered on the server and again in the browser, in whichever locale each is in.
  const detailView = read('components/events/EventDetailView.tsx')
  check(
    'F9 every date in a meeting row survives a server and browser in different locales',
    [
      /<p className="mt-1\.5 text-\[13\.5px\] text-abc-secondary" suppressHydrationWarning>\s*Met\{' '\}/.test(detailView),
      /suppressHydrationWarning>\s*Met \{day\}/.test(detailView),
      /style=\{styles\[tone\]\}\s*suppressHydrationWarning/.test(detailView),
    ],
    [true, true, true]
  )

  // ─────────────────────────── G. BEFORE THE MIGRATION IS APPLIED ───────────────────────────
  const missing = { from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: null, error: { code: 'PGRST205' } }) }) }) }) } as unknown as SupabaseClient
  check('G1 no table means planning is unavailable, not broken', await listPlannedEvents(missing, OWNER), { available: false, events: [] })
  check('G2 the meeting history does not name the new column', read('lib/contact-detail.ts').includes(".select('*')\n      .eq('contact_id', id)"), true)
  check('G3 nor does the events loader', read('lib/events/data.ts').includes('planned_event_id\')') || /select\('[^']*planned_event_id/.test(read('lib/events/data.ts')), false)
  check('G4 Home treats a failed read as none', read('lib/dashboard-data.ts').includes('plannedRes.error ? [] : plannedRes.data ?? []'), true)
  check('G5 the list says so plainly', read('components/events/EventsListView.tsx').includes('Event planning is not available yet.'), true)

  const total = passed + failures.length
  if (failures.length) {
    console.log(`\nPlanned events: ${passed}/${total} PASS, ${failures.length} FAILED\n`)
    for (const failure of failures) console.log('  FAIL ' + failure)
    process.exit(1)
  }
  console.log(`\nPlanned events: ${passed}/${total} PASS`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
