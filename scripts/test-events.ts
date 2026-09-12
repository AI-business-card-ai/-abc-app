/**
 * Event workspace regression suite.
 *
 * Run with `npm run test:events` from the repository root.
 *
 * Same convention as the multi-card suite: a standalone file executed by `tsx`,
 * behavioural wherever the code can be called and source-level only where a
 * browser or a database would be needed to prove it. The grouping is pure, so
 * most of this drives the real functions; the scan-to-event path is proved by
 * running the real batch save against a stub client and grouping whatever
 * encounters it actually wrote.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  buildEventWorkspace,
  eventDisplayName,
  eventKeyFromName,
  followUpState,
  groupEncountersIntoEvents,
  matchesFilter,
  type EventEncounter,
  type GroupingInput,
  type WorkspaceEncounter,
  type WorkspacePerson,
} from '@/lib/events/workspace'
import { saveBatchContacts } from '@/lib/scan/batch-store'

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
const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()

const workspaceLib = code('lib/events/workspace.ts')
const dataLib = code('lib/events/data.ts')
const listView = code('components/events/EventsListView.tsx')
const detailView = code('components/events/EventDetailView.tsx')
const listPage = code('app/events/page.tsx')
const detailPage = code('app/events/[eventKey]/page.tsx')
const middleware = code('middleware.ts')
const store = code('lib/scan/batch-store.ts')

const NOW = new Date('2026-09-12T10:00:00Z')

function encounter(overrides: Partial<WorkspaceEncounter> = {}): WorkspaceEncounter {
  return {
    id: 'e1',
    contactId: 'c1',
    metAt: '2026-09-10T09:00:00.000Z',
    event: 'MEDICA 2026',
    eventNormalized: null,
    discussed: null,
    nextAction: null,
    followUpAt: null,
    ...overrides,
  }
}

function person(id: string, name: string, company = 'Acme'): WorkspacePerson {
  return { id, name, company, role: 'Head of Sales' }
}

function input(
  encounters: WorkspaceEncounter[],
  people: WorkspacePerson[] = [],
  crm: [string, string[]][] = []
): GroupingInput {
  return {
    encounters,
    people: new Map(people.map((p) => [p.id, p])),
    crmByEncounter: new Map(crm),
    now: NOW,
  }
}

async function run() {
  // ─────────────────── EVENT IDENTITY ───────────────────

  check('1a an event is named by its sanitised text when there is one', eventDisplayName({ event: 'raw text', eventNormalized: 'MEDICA 2026' }), 'MEDICA 2026')
  check('1b and by the raw text otherwise', eventDisplayName({ event: ' Interzoo 2026 ', eventNormalized: null }), 'Interzoo 2026')
  check('1c a meeting with no event names none', eventDisplayName({ event: '  ', eventNormalized: null }), null)
  check('1d the key folds case and punctuation', [eventKeyFromName('MEDICA 2026'), eventKeyFromName('medica  2026')], ['medica-2026', 'medica-2026'])
  check('1e accents fold rather than vanish', eventKeyFromName('Café Messe'), 'cafe-messe')
  check('1f a name of punctuation alone still has an address', eventKeyFromName('!!!').startsWith('event-'), true)

  // ─────────────────── GROUPING ───────────────────

  const twoFairs = input(
    [
      encounter({ id: 'e1', contactId: 'c1', event: 'MEDICA 2026', metAt: '2026-09-10T09:00:00.000Z' }),
      encounter({ id: 'e2', contactId: 'c2', event: 'medica 2026', metAt: '2026-09-11T09:00:00.000Z' }),
      encounter({ id: 'e3', contactId: 'c1', event: 'Interzoo 2026', metAt: '2026-05-02T09:00:00.000Z' }),
      encounter({ id: 'e4', contactId: 'c3', event: null, eventNormalized: null, metAt: '2026-09-09T09:00:00.000Z' }),
    ],
    [person('c1', 'Ada'), person('c2', 'Alan'), person('c3', 'Grace')]
  )
  const fairs = groupEncountersIntoEvents(twoFairs)
  check('2a events are grouped from encounter context', fairs.map((f) => f.key), ['medica-2026', 'interzoo-2026'])
  check('2b differently typed capitalisation is one event', fairs[0].encounters, 2)
  check('2c newest event first', fairs[0].name, 'MEDICA 2026')
  check('2d a meeting with no event joins no workspace', fairs.reduce((total, f) => total + f.encounters, 0), 3)

  // 2 & 3. One person, many encounters — within an event and across events.
  const repeat = input(
    [
      encounter({ id: 'r1', contactId: 'same', event: 'MEDICA 2026', metAt: '2026-09-10T09:00:00.000Z' }),
      encounter({ id: 'r2', contactId: 'same', event: 'MEDICA 2026', metAt: '2026-09-11T14:00:00.000Z' }),
      encounter({ id: 'r3', contactId: 'same', event: 'Interzoo 2026', metAt: '2026-05-02T09:00:00.000Z' }),
    ],
    [person('same', 'John Smith', 'Siemens')]
  )
  const repeatFairs = groupEncountersIntoEvents(repeat)
  const medica = repeatFairs.find((f) => f.key === 'medica-2026')!
  const interzoo = repeatFairs.find((f) => f.key === 'interzoo-2026')!
  check('3a one person met twice at one fair is two meetings', medica.encounters, 2)
  check('3b and still one person', medica.people, 1)
  check('3c the same person at another fair is that person again', interzoo.people, 1)
  check('3d appearing in both workspaces without being duplicated', [medica.encounters, interzoo.encounters], [2, 1])
  check('3e the workspace never groups people, only meetings', workspaceLib.includes('new Set(rows.map((row) => row.person.id)).size'), true)

  // ─────────────────── COUNTS ───────────────────

  const counted = input(
    [
      encounter({ id: 'x1', contactId: 'p1', metAt: '2026-09-10T09:00:00.000Z', followUpAt: '2026-09-11T09:00:00.000Z' }),
      encounter({ id: 'x2', contactId: 'p2', metAt: '2026-09-10T10:00:00.000Z', followUpAt: '2026-09-30T09:00:00.000Z' }),
      encounter({ id: 'x3', contactId: 'p3', metAt: '2026-09-10T11:00:00.000Z', followUpAt: null }),
      encounter({ id: 'x4', contactId: 'p1', metAt: '2026-09-11T09:00:00.000Z', followUpAt: '2026-09-12T09:30:00.000Z' }),
    ],
    [person('p1', 'One'), person('p2', 'Two'), person('p3', 'Three')],
    [['x2', ['hubspot']], ['x3', ['pipedrive', 'salesforce']]]
  )
  const summary = groupEncountersIntoEvents(counted)[0]
  check('4a encounters count meetings', summary.encounters, 4)
  check('4b people count distinct contacts', summary.people, 3)
  check('4c follow-ups due counts today and earlier', summary.followUpsDue, 2)
  check('4d scheduled counts later dates', summary.followUpsScheduled, 1)
  check('4e CRM synced counts meetings with a mapping', summary.crmSynced, 2)
  check('4f due is today or earlier, scheduled is after', [followUpState('2026-09-11T09:00:00Z', NOW), followUpState('2026-09-12T09:30:00Z', NOW), followUpState('2026-09-14T00:30:00Z', NOW), followUpState(null, NOW)], ['due', 'due', 'scheduled', 'none'])

  // ─────────────────── DETAIL ───────────────────

  const workspace = buildEventWorkspace(counted, 'medica-2026')!
  check('5a the detail workspace carries every meeting', workspace.encounters.length, 4)
  check('5b newest meeting first', workspace.encounters[0].encounterId, 'x4')
  check('5c its counts match the list', [workspace.summary.encounters, workspace.summary.people, workspace.summary.crmSynced], [4, 3, 2])
  check('5d each row names the person it was with', workspace.encounters.map((row) => row.person.name).sort(), ['One', 'One', 'Three', 'Two'])
  check('5e a meeting with a mapping names its providers', workspace.encounters.find((r) => r.encounterId === 'x3')?.crmProviders, ['pipedrive', 'salesforce'])
  check('5f and one without is honestly not synced', workspace.encounters.find((r) => r.encounterId === 'x1')?.crm, 'not_synced')
  check('6a an unknown event key is nothing, not an empty event', buildEventWorkspace(counted, 'no-such-fair'), null)
  check('6b an account with no meetings has no events', groupEncountersIntoEvents(input([])), [])

  // ─────────────────── FILTERS ───────────────────

  const rows = workspace.encounters
  const ids = (filter: Parameters<typeof matchesFilter>[1]) =>
    rows.filter((row) => matchesFilter(row, filter)).map((row) => row.encounterId).sort()
  check('7a all', ids('all'), ['x1', 'x2', 'x3', 'x4'])
  check('7b needs follow-up', ids('needs_follow_up'), ['x1', 'x4'])
  check('7c scheduled', ids('scheduled'), ['x2'])
  check('7d in CRM', ids('in_crm'), ['x2', 'x3'])
  check('7e not in CRM', ids('not_in_crm'), ['x1', 'x4'])

  // ─────────────────── SCAN → ENCOUNTER → EVENT ───────────────────

  /*
    The real batch save, against a stub client, with four detected cards: one
    removed before saving, one that cannot be saved, one matching somebody
    already on file, and one new person. Whatever encounters it writes are then
    grouped exactly as the workspace would group them — so this proves the path
    end to end rather than asserting what the save is believed to do.
  */
  const seed = {
    batch: {
      id: 'batch-1',
      status: 'draft',
      source_kind: 'single_photo',
      shared_event: 'MEDICA 2026',
      shared_location: 'Düsseldorf',
      shared_discussed: 'Booth partnership',
      shared_next_action: 'Send pricing',
      shared_follow_up_at: '2026-09-11T09:00:00.000Z',
      shared_met_at: '2026-09-10T10:00:00.000Z',
      total_detected: 4,
      total_saved: 0,
      created_at: '2026-09-10T10:00:00.000Z',
    },
    items: [
      { id: 'k1', batch_id: 'batch-1', position: 0, first_name: 'New', last_name: 'Person', email: 'new@x.co', selected: true, warnings: [], confidence: 0.9, created_contact_id: null },
      { id: 'k2', batch_id: 'batch-1', position: 1, first_name: 'Known', email: 'known@x.co', selected: true, warnings: [], confidence: 0.9, created_contact_id: null, link_contact_id: 'existing-1', link_to_existing: true },
      // Removed before Save.
      { id: 'k3', batch_id: 'batch-1', position: 2, first_name: 'Removed', email: 'removed@x.co', selected: false, warnings: [], confidence: 0.9, created_contact_id: null },
      // Nothing usable on it: the save reports it and writes nothing.
      { id: 'k4', batch_id: 'batch-1', position: 3, selected: true, warnings: [], confidence: 0.2, created_contact_id: null },
    ],
  }

  const stub = stubClient(seed)
  const saved = await quietly(() => saveBatchContacts(stub.client, 'owner-1', 'batch-1', 50))
  check('8a two cards became contacts or meetings', saved?.created.length, 2)
  check('8b the unusable card is reported, not saved', saved?.failed.length, 1)

  const encounterWrites = stub.writes
    .filter((w) => w.table === 'contact_encounters' && w.op === 'insert')
    .map((w) => w.payload as Record<string, unknown>)
  check('8c one meeting per accepted card', encounterWrites.length, 2)

  const fromScan: WorkspaceEncounter[] = encounterWrites.map((row, index) => ({
    id: `saved-${index}`,
    contactId: String(row.contact_id),
    metAt: String(row.met_at),
    event: String(row.event ?? ''),
    eventNormalized: null,
    discussed: (row.discussed as string) ?? null,
    nextAction: (row.next_action as string) ?? null,
    followUpAt: (row.follow_up_at as string) ?? null,
  }))
  const scanned = groupEncountersIntoEvents(input(fromScan))
  check('9a the shared event becomes one workspace', scanned.length, 1)
  check('9b named as the batch named it', scanned[0].name, 'MEDICA 2026 · Düsseldorf')
  check('9c holding one meeting per accepted card', scanned[0].encounters, 2)
  check('9d the removed card is nowhere in it', encounterWrites.some((row) => String(row.contact_id).includes('k3')), false)
  check('9e including the card that matched somebody already on file', encounterWrites.some((row) => row.contact_id === 'existing-1'), true)
  check('9f the failed card wrote no meeting, so it cannot appear', encounterWrites.length, saved?.created.length)
  check('9g a removed card never reaches the save path at all', store.includes('if (!item.selected || item.createdContactId) continue'), true)
  check('9h the batch names the event the same way the workspace reads it', scanned[0].key, eventKeyFromName('MEDICA 2026 · Düsseldorf'))

  // ─────────────────── OWNERSHIP ───────────────────

  check('10a every workspace query is owner-scoped', (dataLib.match(/\.eq\('user_id', ownerId\)/g) || []).length >= 3, true)
  check('10b the owner comes from the session, never a parameter', dataLib.includes('await supabase.auth.getUser()') && !/ownerId = [^u]/.test(dataLib.slice(dataLib.indexOf('loadGroupingInput'))), true)
  check('10c the event key is never sent to the database', /\.eq\([^)]*eventKey|\.filter\([^)]*eventKey|\.or\([^)]*eventKey/.test(dataLib), false)
  check('10d it only selects among events built from the owner’s own rows', workspaceLib.includes('eventKeyFromName(displayName) !== eventKey'), true)
  check('10e a key with no meetings of this owner is not found', detailPage.includes('if (!workspace) notFound()'), true)
  check('10f and no session is a login redirect, not an empty page', detailPage.includes('if (workspace === null) redirect(') && listPage.includes("redirect('/login')"), true)
  check('10g the route is gated by middleware too', middleware.includes("'/events',"), true)
  check('10h CRM state is read from real mappings only', dataLib.includes("eq('local_object_type', 'encounter')") && dataLib.includes("from('crm_object_mappings')"), true)

  // ─────────────────── SCREENS ───────────────────

  check('11a the list links to each event workspace', listView.includes('href={`/events/${event.key}`}'), true)
  check('11b a person links to the one canonical contact screen', detailView.includes('href={`/contacts/${person.id}`}'), true)
  check('11c there is no event-local contact editor', /<input|<textarea|onFieldsChange/.test(detailView), false)
  check('11d the empty state says so plainly and offers a scan', listView.includes('No event meetings yet.') && listView.includes('href="/scan"'), true)
  check('11e an event with nothing matching a filter fails gracefully', detailView.includes('No meeting at this event matches that filter.'), true)
  check('11f people and meetings are shown as separate numbers', detailView.includes("label={summary.people === 1 ? 'Person met' : 'People met'}") && detailView.includes("label={summary.encounters === 1 ? 'Meeting' : 'Meetings'}"), true)
  check('11g follow-up state is shown per meeting', detailView.includes('Needs follow-up') && detailView.includes('Scheduled'), true)
  check('11h CRM state names the provider when there is one', detailView.includes('PROVIDER_LABELS') && detailView.includes("'In CRM'"), true)

  // Mobile: nothing fixed-width, long text truncates, the page is a single column.
  for (const [name, src] of [['list', listView], ['detail', detailView]] as const) {
    check(`12a ${name} uses the shared page shell`, src.includes('mx-auto w-full max-w-[900px]'), true)
    check(`12b ${name} truncates long names rather than widening`, src.includes('truncate'), true)
    // `max-w-` and `min-w-` are constraints, not fixed widths.
    check(`12c ${name} sets no fixed pixel width`, /(?<![a-z-])w-\[\d+px\]/.test(src), false)
  }
  check('12d the filter row scrolls instead of overflowing', detailView.includes('abc-scroll-x'), true)
  check('12e filters and links are full-height touch targets', detailView.includes('min-h-[44px]') && detailView.includes('py-2'), true)

  // ─────────────────── NOTHING ELSE MOVED ───────────────────

  const changed = git('diff', '--name-only', 'origin/berlin-launch-integration..HEAD').split('\n').filter(Boolean)
  const touching = (re: RegExp) => changed.filter((f) => re.test(f))
  check('13a multi-card and the scan APIs are untouched', touching(/^(components|lib)\/scan\/|^app\/api\/scan\//), [])
  check('13b the founder entitlement is untouched', touching(/entitlement|scan-limits/), [])
  check('13c auth and wallet are untouched', touching(/auth|wallet|apple|google/i), [])
  check('13d contacts, encounters and CRM logic are untouched', touching(/^lib\/(encounters|contact-detail|contacts-view)\.ts$|^lib\/crm\/|^app\/contacts\//), [])
  check('13e the event workspace adds no migration', touching(/^supabase\/migrations\//), [])

  const total = passed + failures.length
  if (failures.length) {
    console.log(`\nEvents: ${passed}/${total} PASS, ${failures.length} FAILED\n`)
    for (const failure of failures) console.log('  FAIL ' + failure)
    process.exit(1)
  }
  console.log(`\nEvents: ${passed}/${total} PASS`)
}

/**
 * `onCardScanned` builds a service client from environment this script does not
 * have, so it throws and is caught by the save — which is itself worth keeping
 * quiet rather than printing on every run.
 */
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error
  console.error = () => {}
  try {
    return await fn()
  } finally {
    console.error = original
  }
}

/** The batch store's queries, and no more. Mirrors the multi-card suite's stub. */
function stubClient(seed: { batch: Record<string, unknown>; items: Record<string, unknown>[] }) {
  const writes: { table: string; op: string; payload: unknown }[] = []
  const itemRows = seed.items.map((row) => ({ ...row }))
  let contactSeq = 0

  function table(name: string) {
    const state: { filters: Record<string, unknown>; pendingUpdate: Record<string, unknown> | null } = {
      filters: {},
      pendingUpdate: null,
    }

    function flush() {
      if (!state.pendingUpdate) return
      const payload = state.pendingUpdate
      if (name === 'scan_batch_items' && state.filters.id) {
        const target = itemRows.find((row) => row.id === state.filters.id)
        if (target) Object.assign(target, payload)
      }
      if (name === 'scan_batches') Object.assign(seed.batch, payload)
      state.pendingUpdate = null
    }

    const chain: Record<string, unknown> = {
      select: () => chain,
      eq(column: string, value: unknown) {
        state.filters[column] = value
        flush()
        return chain
      },
      order: () => chain,
      limit: () => chain,
      in(_column: string, values: unknown[]) {
        state.filters.in = values
        return chain
      },
      insert(payload: Record<string, unknown>) {
        writes.push({ table: name, op: 'insert', payload })
        if (name === 'scanned_contacts') {
          contactSeq += 1
          const row = { ...payload, id: `contact-${contactSeq}` }
          return { select: () => ({ single: async () => ({ data: row, error: null }) }) }
        }
        if (name === 'contact_encounters') {
          const row = { ...payload, id: `encounter-${contactSeq}` }
          return { select: () => ({ single: async () => ({ data: row, error: null }) }) }
        }
        return { select: () => ({ single: async () => ({ data: payload, error: null }) }) }
      },
      update(payload: Record<string, unknown>) {
        writes.push({ table: name, op: 'update', payload })
        state.pendingUpdate = payload
        return chain
      },
      maybeSingle: async () => {
        if (name === 'scan_batches') return { data: seed.batch, error: null }
        if (name === 'scanned_contacts' && typeof state.filters.id === 'string') {
          return { data: { id: state.filters.id, name: 'Existing Person' }, error: null }
        }
        return { data: null, error: null }
      },
      then: undefined,
    }

    ;(chain as { then?: unknown }).then = (resolve: (value: unknown) => void) => {
      if (name === 'scan_batch_items') return resolve({ data: itemRows, error: null })
      if (name === 'scanned_contacts' && Array.isArray(state.filters.in)) {
        return resolve({
          data: (state.filters.in as string[]).map((id) => ({ id, name: 'Existing Person' })),
          error: null,
        })
      }
      return resolve({ data: [], error: null })
    }

    return chain
  }

  return {
    client: { from: (name: string) => table(name) } as unknown as SupabaseClient,
    writes,
    itemRows,
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
