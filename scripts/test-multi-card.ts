/**
 * Multi-card scan regression suite.
 *
 * Run with `npm run test:multi-card` from the repository root.
 *
 * No test framework, deliberately: the repository's convention is a standalone
 * TypeScript file executed by `tsx` (see `scripts/setup-stripe.ts`), and a
 * second toolchain added for one feature is a cost every future contributor
 * pays.
 *
 * Behavioural where the code can be called — the batch store is driven against
 * a stub Supabase client, so contacts, encounters and idempotency are exercised
 * for real. Source-level only where a browser would be needed to prove it.
 * Every source assertion runs on comment-stripped text, so a claim written in
 * prose can never satisfy a test about code.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  batchItemIsSaveable,
  batchSaveCount,
  deriveWarnings,
  emptySharedContext,
  encounterEventText,
  isActiveBatchItem,
  MAX_BATCH_CARDS,
  MAX_BATCH_ROWS,
  MULTI_CARD_IMAGE_POLICY,
  remainingInBatch,
  setItemSelected,
  sharedContextHasContent,
  warningLabel,
  type BatchItem,
} from '@/lib/scan/batch'
import { emptyCandidate } from '@/lib/scan/candidate'
import {
  applyItemPatches,
  batchExportTargets,
  capReselection,
  remainingCapacity,
  saveBatchContacts,
} from '@/lib/scan/batch-store'
import { fitToVisionBudget, visualTokens } from '@/lib/image-compress'
import { shouldSuggestLandscape } from '@/lib/scan/useOrientation'
import {
  consumeScanCredits,
  isFounder,
  readScanEntitlement,
  type AuthIdentity,
  type EntitlementProfile,
} from '@/lib/scan/entitlement'

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
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel))
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const migration = read('supabase/migrations/20260910120000_multi_card_scan_batches.sql')
const batchRoute = code('app/api/scan/batch/route.ts')
const detectRoute = code('app/api/scan/batch/[id]/detect/route.ts')
const patchRoute = code('app/api/scan/batch/[id]/route.ts')
const saveRoute = code('app/api/scan/batch/[id]/save/route.ts')
const exportRoute = code('app/api/scan/batch/[id]/export/route.ts')
const store = code('lib/scan/batch-store.ts')
const claude = code('lib/claude.ts')
const scanClient = code('components/scan/ScanClient.tsx')
const scanEntry = code('components/scan/ScanEntry.tsx')
const multiClient = code('components/scan/MultiCardClient.tsx')
const contextForm = code('components/scan/BatchSharedContextForm.tsx')
const cardList = code('components/scan/BatchCardList.tsx')
const exportPanel = code('components/scan/BatchExportPanel.tsx')

function item(overrides: Partial<BatchItem> = {}): BatchItem {
  return {
    id: 'item-1',
    position: 0,
    fields: { ...emptyCandidate(), first_name: 'Ada', last_name: 'Lovelace', company: 'Analytical' },
    confidence: 0.9,
    warnings: [],
    selected: true,
    createdContactId: null,
    linkContactId: null,
    linkContactName: null,
    linkToExisting: false,
    creditConsumed: false,
    ...overrides,
  }
}

/**
 * A Supabase stand-in that records every write.
 *
 * Enough of the builder chain for the batch store's queries, and no more —
 * a fuller fake would be a second implementation to keep correct.
 */
function stubClient(seed: {
  batch: Record<string, unknown>
  items: Record<string, unknown>[]
  failContactInsert?: boolean
}) {
  const writes: { table: string; op: string; payload: unknown }[] = []
  const itemRows = seed.items.map((row) => ({ ...row }))
  let contactSeq = 0

  function table(name: string) {
    const state: { filters: Record<string, unknown>; pendingUpdate: Record<string, unknown> | null } = {
      filters: {},
      pendingUpdate: null,
    }

    /*
      Supabase applies an update when the statement executes, after the `.eq()`
      filters have been attached — so the fake has to defer too. Applying it at
      `.update()` time would leave `created_contact_id` unwritten and make the
      idempotency test pass or fail for reasons that have nothing to do with the
      product.
    */
    function flush() {
      if (!state.pendingUpdate) return
      const payload = state.pendingUpdate
      /*
        The whole row update, not just the contact link: a removal is an
        update to `selected`, and the export reads `created_encounter_id`, so
        a fake that dropped either would let those tests pass on stale rows.
      */
      if (name === 'scan_batch_items' && state.filters.id) {
        const target = itemRows.find((row) => row.id === state.filters.id)
        if (target) Object.assign(target, payload)
      }
      if (name === 'scan_batches') Object.assign(seed.batch, payload)
      state.pendingUpdate = null
    }

    const chain: Record<string, unknown> = {
      select() {
        return chain
      },
      eq(column: string, value: unknown) {
        state.filters[column] = value
        flush()
        return chain
      },
      order() {
        return chain
      },
      limit() {
        return chain
      },
      /** Used to resolve linked contacts' names, and by the export targets. */
      in(_column: string, values: unknown[]) {
        state.filters.in = values
        return chain
      },
      insert(payload: Record<string, unknown>) {
        writes.push({ table: name, op: 'insert', payload })
        if (name === 'scanned_contacts') {
          if (seed.failContactInsert) {
            return {
              select: () => ({
                single: async () => ({ data: null, error: { message: 'insert failed' } }),
              }),
            }
          }
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
        /*
          The save re-verifies a linked contact against this owner before
          attaching a meeting to it. Any id the seed data links to is treated
          as a real contact of theirs; anything else resolves to nothing, which
          is what the not-found branch is for.
        */
        if (name === 'scanned_contacts' && typeof state.filters.id === 'string') {
          return { data: { id: state.filters.id, name: 'Existing Person' }, error: null }
        }
        return { data: null, error: null }
      },
      then: undefined,
    }

    // `await supabase.from(x).select().eq()` resolves to a list for items.
    ;(chain as { then?: unknown }).then = (resolve: (value: unknown) => void) => {
      if (name === 'scan_batch_items') return resolve({ data: itemRows, error: null })
      // Name resolution for linked contacts.
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

/**
 * `onCardScanned` builds its own service client from environment this script
 * does not have, so it throws and is caught — which is itself worth proving:
 * the contact must survive a failure in the CRM-defaults side effect. Its noise
 * is silenced while a save runs so a real failure stays visible.
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

async function run() {
  // ─────────────────────── DOMAIN ───────────────────────

  check('1  the batch ceiling is ten', MAX_BATCH_CARDS, 10)
  check('2  an empty context has no content', sharedContextHasContent(emptySharedContext()), false)
  check(
    '3  a context with only an event counts as content',
    sharedContextHasContent({ ...emptySharedContext(), event: 'Web Summit' }),
    true
  )
  check(
    '4  event and location join into one encounter line',
    encounterEventText({ ...emptySharedContext(), event: 'Web Summit', location: 'Hall 3' }),
    'Web Summit · Hall 3'
  )
  check(
    '5  an empty context yields no event text',
    encounterEventText(emptySharedContext()),
    null
  )
  check('6  a card with a name is saveable', batchItemIsSaveable(item()), true)
  check(
    '7  a card with only a phone is not saveable',
    batchItemIsSaveable(item({ fields: { ...emptyCandidate(), phone: '+420 1' } })),
    false
  )
  check(
    '8  a card with only a company is saveable',
    batchItemIsSaveable(item({ fields: { ...emptyCandidate(), company: 'Analytical' } })),
    true
  )

  // ─────────────────────── WARNINGS ───────────────────────

  check(
    '9  a nameless card warns',
    deriveWarnings({ ...emptyCandidate(), company: 'X' }, 0.9),
    ['no_name', 'no_contact_method']
  )
  check(
    '10 a card with no way to reach anyone warns',
    deriveWarnings({ ...emptyCandidate(), first_name: 'Ada' }, 0.9),
    ['no_contact_method']
  )
  check(
    '11 a low-confidence read warns',
    deriveWarnings({ ...emptyCandidate(), first_name: 'Ada', email: 'a@b.co' }, 0.3),
    ['low_confidence']
  )
  check(
    '12 a clean card warns about nothing',
    deriveWarnings({ ...emptyCandidate(), first_name: 'Ada', email: 'a@b.co' }, 0.95),
    []
  )
  check('13 every warning has words for the owner', warningLabel('possible_duplicate'), 'You may already have this contact')

  // ─────────────────────── SAVE BEHAVIOUR ───────────────────────

  const seed = {
    batch: {
      id: 'batch-1',
      status: 'draft',
      source_kind: 'single_photo',
      shared_event: 'Web Summit',
      shared_location: 'Hall 3',
      shared_discussed: 'Booth partnership',
      shared_next_action: 'Send pricing',
      shared_follow_up_at: '2026-09-20T09:00:00.000Z',
      shared_met_at: '2026-09-10T10:00:00.000Z',
      total_detected: 3,
      total_saved: 0,
      created_at: '2026-09-10T10:00:00.000Z',
    },
    items: [
      { id: 'a', batch_id: 'batch-1', position: 0, first_name: 'Ada', last_name: 'Lovelace', company: 'Analytical', email: 'ada@x.co', selected: true, warnings: [], confidence: 0.9, created_contact_id: null },
      { id: 'b', batch_id: 'batch-1', position: 1, first_name: 'Alan', company: 'Bletchley', email: 'alan@x.co', selected: true, warnings: [], confidence: 0.9, created_contact_id: null },
      // Unticked: must never become a contact.
      { id: 'c', batch_id: 'batch-1', position: 2, first_name: 'Grace', company: 'Navy', selected: false, warnings: [], confidence: 0.9, created_contact_id: null },
    ],
  }

  const stub = stubClient(seed)
  const result = await quietly(() => saveBatchContacts(stub.client, 'owner-1', 'batch-1'))

  check('14 the save returns a result', Boolean(result), true)
  check('15 only ticked cards become contacts', result?.created.length, 2)
  check('16 an unticked card is not saved', result?.created.some((c) => c.name.includes('Grace')), false)

  const contactInserts = stub.writes.filter((w) => w.table === 'scanned_contacts' && w.op === 'insert')
  check('17 one contact row per kept card', contactInserts.length, 2)

  const firstContact = contactInserts[0].payload as Record<string, unknown>
  check('18 the contact is owned by the session user', firstContact.user_id, 'owner-1')
  check('19 the contact records its batch', firstContact.scan_batch_id, 'batch-1')
  check('20 the contact records its card', firstContact.scan_batch_item_id, 'a')
  check('21 the contact is a business card capture', firstContact.capture_kind, 'business_card')

  const encounterInserts = stub.writes.filter(
    (w) => w.table === 'contact_encounters' && w.op === 'insert'
  )
  check('22 one encounter per contact', encounterInserts.length, 2)

  const firstEncounter = encounterInserts[0].payload as Record<string, unknown>
  check('23 the shared event lands on the encounter', firstEncounter.event, 'Web Summit · Hall 3')
  check('24 the shared discussion lands on the encounter', firstEncounter.discussed, 'Booth partnership')
  check('25 the shared next step lands on the encounter', firstEncounter.next_action, 'Send pricing')
  check('26 the shared follow-up lands on the encounter', firstEncounter.follow_up_at, '2026-09-20T09:00:00.000Z')
  check('27 the meeting date is when they met', firstEncounter.met_at, '2026-09-10T10:00:00.000Z')

  const secondEncounter = encounterInserts[1].payload as Record<string, unknown>
  check('28 every contact gets the same shared meeting', secondEncounter.event, firstEncounter.event)
  check(
    '29 but they are separate encounters on separate contacts',
    firstEncounter.contact_id !== secondEncounter.contact_id,
    true
  )

  check('30 the batch is marked saved', seed.batch.status, 'saved')
  check('31 the batch counts what it kept', seed.batch.total_saved, 2)

  // Re-running must finish the job, not duplicate it.
  const rerun = await quietly(() => saveBatchContacts(stub.client, 'owner-1', 'batch-1'))
  check('32 a second save creates nothing new', rerun?.created.length, 0)
  check(
    '33 and writes no further contacts',
    stub.writes.filter((w) => w.table === 'scanned_contacts' && w.op === 'insert').length,
    2
  )

  // A card with nothing usable is reported, not silently dropped.
  const thin = stubClient({
    batch: { ...seed.batch, status: 'draft', total_saved: 0 },
    items: [
      { id: 'd', batch_id: 'batch-1', position: 0, selected: true, warnings: [], confidence: 0.2, created_contact_id: null },
    ],
  })
  const thinResult = await quietly(() => saveBatchContacts(thin.client, 'owner-1', 'batch-1'))
  check('34 an unusable card is not saved', thinResult?.created.length, 0)
  check('35 and is reported back', thinResult?.failed.length, 1)
  check('36 with a reason the owner can act on', thinResult?.failed[0].reason, 'Needs a name, company or email.')

  // A failing insert leaves the others intact.
  const broken = stubClient({
    batch: { ...seed.batch, status: 'draft', total_saved: 0 },
    items: [
      { id: 'e', batch_id: 'batch-1', position: 0, first_name: 'Ada', email: 'a@x.co', selected: true, warnings: [], confidence: 0.9, created_contact_id: null },
    ],
    failContactInsert: true,
  })
  const brokenResult = await quietly(() => saveBatchContacts(broken.client, 'owner-1', 'batch-1'))
  check('37 a failed insert is reported', brokenResult?.failed.length, 1)
  check('38 and the batch does not claim to be saved', broken.writes.some((w) => w.table === 'scan_batches' && (w.payload as Record<string, unknown>).status === 'saved'), false)

  // ─────────────────────── SECURITY ───────────────────────

  for (const [name, src] of [
    ['create', batchRoute],
    ['detect', detectRoute],
    ['patch', patchRoute],
    ['save', saveRoute],
    ['export', exportRoute],
  ] as const) {
    check(`39 ${name} requires a session`, src.includes('auth.getUser()'), true)
    check(`40 ${name} 401s an anonymous caller`, /if \(!user\)[\s\S]{0,120}status: 401/.test(src), true)
  }

  check('41 the store never trusts an owner id from a request', /ownerId:\s*body\.|user_id:\s*body\./.test(store), false)
  check('42 every batch read is owner-scoped', store.includes(".eq('user_id', ownerId)"), true)
  check('43 the save is owner-scoped', saveRoute.includes('user.id'), true)
  check('44 export filters the batch it owns rather than trusting ids', exportRoute.includes('targets.filter'), true)
  check('45 export reuses the audited single-contact push', exportRoute.includes('pushContactEncounterToCrm'), true)
  check('46 export does not reimplement CRM mapping', /crm_object_mappings|createCompany|associate/.test(exportRoute), false)

  // ─────────────────────── LIMITS ───────────────────────

  check('47 detect refuses a full batch', detectRoute.includes("reason: 'batch_full'"), true)
  // Entitlement, not plan tier. The commercial model is moving to prepaid
  // Smart Scan credits, so the batch asks for a balance and never for a plan.
  check('48 detect checks the entitlement balance', detectRoute.includes('readScanEntitlement'), true)
  check('49 the batch is capped by what the balance covers', detectRoute.includes('entitlement.unmetered ? capacity : entitlement.available'), true)
  check('50 and says so rather than truncating silently', detectRoute.includes('cappedByPlan'), true)
  check('51 detect charges nothing, because nothing is kept yet', /scans_used/.test(detectRoute), false)
  check('52 a saved batch cannot take more photos', detectRoute.includes("batch.status === 'saved'"), true)
  check('53 no cards found is its own honest answer', detectRoute.includes("reason: 'no_cards'"), true)

  // ─────────────────────── VISION ───────────────────────

  check('54 there is a multi-card extractor', claude.includes('export async function extractBusinessCardsFromImage'), true)
  check('55 the single-card path is untouched', claude.includes('export async function extractBusinessCardFromImage'), true)
  check('56 the prompt is bounded by the ceiling', claude.includes('Return AT MOST ${maxCards} cards'), true)
  check('57 the prompt forbids merging two people', claude.includes('Never merge two people into one object'), true)
  check('58 the token budget scales with the card count', claude.includes('400 + maxCards * 280'), true)
  check('59 an unreadable photo returns an empty array, not a throw', claude.includes('return []'), true)

  // ─────────────────────── DEDUPLICATION ───────────────────────

  check('60 duplicates are checked at detection time', store.includes('findExistingContactMatches'), true)
  check('61 only deterministic identifiers are used', /abcUserId: null,[\s\S]{0,80}email: clean\.email/.test(store), true)
  check('62 a duplicate warns rather than blocks', store.includes("warnings.push('possible_duplicate')"), true)
  check('63 the save has no duplicate rejection', /allowDuplicate|existing_contact/.test(store), false)

  // ─────────────────────── UI ───────────────────────

  check('64 the scan screen offers both flows', scanEntry.includes('ScanModeSwitch'), true)
  check('65 single-card scanning is still mounted', scanEntry.includes('<ScanClient'), true)
  check('66 and is still the default', scanEntry.includes("useState<ScanFlow>('single')"), true)
  check('67 the two flows are mounted exclusively', scanEntry.includes("if (flow === 'single')"), true)
  check('68 ScanClient keeps its original padding by default', scanClient.includes('topPadding = true'), true)
  check('69 the multi flow collects context once', multiClient.includes('BatchSharedContextForm'), true)
  check('70 the context form says how many it covers', contextForm.includes('Applied to all'), true)
  check('71 the review list can untick a card', cardList.includes('onSelectedChange'), true)
  check('72 the review list can edit every field', cardList.includes('FIELDS.map'), true)
  check('73 a saved card can no longer be edited here', cardList.includes('disabled={disabled || saved}'), true)
  check('74 the owner is told enrichment comes later', multiClient.includes('add individual details to any contact afterwards'), true)
  check('75 export is offered after saving', multiClient.includes('BatchExportPanel'), true)
  check('76 and again later from the batch page', exists('app/batches/[id]/page.tsx'), true)
  check('77 the panel offers only connected CRMs', exportPanel.includes('connection.connected'), true)
  check('78 partial export results are shown per contact', exportPanel.includes('failed.map'), true)
  check('79 nothing claims a save that did not happen', /Added to CRM|All synced/.test(exportPanel), false)

  // ─────────────────────── SCHEMA ───────────────────────

  check('80 the batch table exists', migration.includes('CREATE TABLE IF NOT EXISTS public.scan_batches'), true)
  check('81 the item table exists', migration.includes('CREATE TABLE IF NOT EXISTS public.scan_batch_items'), true)
  check('82 items are tenant-bound by composite key', migration.includes('scan_batch_items_batch_owner_fkey'), true)
  check('83 the contact link is tenant-bound too', migration.includes('scan_batch_items_contact_owner_fkey'), true)
  check('84 both tables enable RLS', (migration.match(/ENABLE ROW LEVEL SECURITY/g) || []).length, 2)
  check('85 anon is granted nothing', migration.includes('REVOKE ALL ON public.scan_batches FROM anon'), true)
  check('86 counters are not client-writable', /GRANT UPDATE \([\s\S]*?total_saved[\s\S]*?\) ON public\.scan_batches/.test(migration), false)
  check('87 status is not client-writable', /GRANT UPDATE \([\s\S]*?status[\s\S]*?\) ON public\.scan_batches/.test(migration), false)
  check('88 the created contact link is not client-writable', /GRANT UPDATE \([\s\S]*?created_contact_id[\s\S]*?\) ON public\.scan_batch_items/.test(migration), false)
  check('89 raw OCR is not client-writable', /GRANT UPDATE \([\s\S]*?raw_ocr[\s\S]*?\) ON public\.scan_batch_items/.test(migration), false)
  check('90 the contact gains a batch reference', migration.includes('ADD COLUMN IF NOT EXISTS scan_batch_id uuid'), true)
  check('91 the schema cache is reloaded', migration.includes("NOTIFY pgrst, 'reload schema'"), true)

  // ─────────────────────── EXISTING FLOWS ───────────────────────

  check('92 single-card scan still posts to its own route', scanClient.includes("fetch('/api/card/scan'"), true)
  check('93 single-card save still posts to its own route', scanClient.includes("fetch('/api/scan/contact'"), true)
  check('94 the single-card save route is untouched by the batch', code('app/api/scan/contact/route.ts').includes('scan_batch_id'), false)
  check('95 the batch does not write through the single-card route', store.includes('/api/scan/contact'), false)
  check('96 the batch reuses the shared encounter writer', store.includes('createEncounter'), true)
  check('97 the batch reuses the shared CRM defaults', store.includes('onCardScanned'), true)
  check('98 the batch reuses the shared field sanitizer', store.includes('sanitizeCardExtract'), true)
  check('99 the contact screen can point at the batch', code('lib/contact-detail.ts').includes('scanBatchId'), true)
  check('100 and says edits are per contact', code('components/contacts/detail/MeetingContextCard.tsx').includes('Edits here apply to this contact only'), true)

  // ───────────── PERSON != ENCOUNTER (Berlin locked rule) ─────────────

  const entitlement = code('lib/scan/entitlement.ts')

  // A card matching somebody already on file adds a meeting to them.
  const linkSeed = {
    batch: { ...seed.batch, status: 'draft', total_saved: 0 },
    items: [
      { id: 'L', batch_id: 'batch-1', position: 0, first_name: 'Ada', email: 'ada@x.co', selected: true, warnings: ['possible_duplicate'], confidence: 0.9, created_contact_id: null, link_contact_id: 'existing-1', link_to_existing: true },
      { id: 'N', batch_id: 'batch-1', position: 1, first_name: 'New', company: 'Fresh', selected: true, warnings: [], confidence: 0.9, created_contact_id: null, link_contact_id: null, link_to_existing: false },
    ],
  }
  const linkStub = stubClient(linkSeed)
  const linkResult = await quietly(() => saveBatchContacts(linkStub.client, 'owner-1', 'batch-1'))

  check('101 a matched card creates no second person', linkStub.writes.filter((w) => w.table === 'scanned_contacts' && w.op === 'insert').length, 1)
  check('102 it still produces a meeting', linkStub.writes.filter((w) => w.table === 'contact_encounters' && w.op === 'insert').length, 2)
  const linkedEncounter = (linkStub.writes.find(
    (w) => w.table === 'contact_encounters' && (w.payload as Record<string, unknown>).contact_id === 'existing-1'
  )?.payload || {}) as Record<string, unknown>
  check('103 the meeting is attached to the existing person', linkedEncounter.contact_id, 'existing-1')
  check('104 carrying the batch event', linkedEncounter.event, 'Web Summit · Hall 3')
  check('105 the result marks it as linked', linkResult?.created.find((c) => c.itemId === 'L')?.linked, true)
  check('106 and the other card as new', linkResult?.created.find((c) => c.itemId === 'N')?.linked, false)
  check('107 only the new person counts as new', linkResult?.newContacts, 1)
  check('108 the linked one is counted separately', linkResult?.linkedContacts, 1)

  // The owner can override a match and get a genuinely separate person.
  const overrideStub = stubClient({
    batch: { ...seed.batch, status: 'draft', total_saved: 0 },
    items: [
      { id: 'O', batch_id: 'batch-1', position: 0, first_name: 'Ada', email: 'info@x.co', selected: true, warnings: ['possible_duplicate'], confidence: 0.9, created_contact_id: null, link_contact_id: 'existing-1', link_to_existing: false },
    ],
  })
  const overrideResult = await quietly(() => saveBatchContacts(overrideStub.client, 'owner-1', 'batch-1'))
  check('109 an overridden match creates a separate person', overrideStub.writes.filter((w) => w.table === 'scanned_contacts' && w.op === 'insert').length, 1)
  check('110 counted as new', overrideResult?.newContacts, 1)

  check('111 the link is stored at detection, not guessed at save', store.includes('link_contact_id: singleMatch?.contactId ?? null'), true)
  check('112 only an unambiguous match links automatically', store.includes('match.contacts.length === 1'), true)
  check('113 the link id is never patchable by the client', /GRANT UPDATE \([\s\S]*?link_contact_id[\s\S]*?\) ON public\.scan_batch_items/.test(migration), false)
  check('114 but the owner decision is', /GRANT UPDATE \([\s\S]*?link_to_existing[\s\S]*?\) ON public\.scan_batch_items/.test(migration), true)
  check('115 the linked contact is re-verified against the owner', store.includes(".eq('id', item.linkContactId)"), true)
  check('116 the review offers the choice', cardList.includes('Save as separate contact'), true)
  check('117 defaulting to adding the meeting', cardList.includes('active={linking}'), true)

  // ───────────── CREDIT MODEL ─────────────

  check('118 there is an entitlement seam', exists('lib/scan/entitlement.ts'), true)
  check('119 it exposes a balance rather than a plan', entitlement.includes('available: number'), true)
  check('120 detect no longer reads plan limits directly', /getScanLimitForPlan|isScanLimitReached|PLAN_SCAN_LIMITS/.test(detectRoute), false)
  check('121 detect spends nothing', /scans_used/.test(detectRoute), false)
  check('122 detect still refuses a zero balance', detectRoute.includes('entitlement.available <= 0'), true)
  check('123 credits are spent at save', saveRoute.includes('consumeScanCredits'), true)
  check('124 per accepted card, not per new person', saveRoute.includes('consumeScanCredits(supabase, profile, result.creditsConsumed, user)'), true)
  check('124b never charged by new-person count', /consumeScanCredits\([^)]*newContacts/.test(saveRoute), false)
  check('125 the save is capped by the balance', saveRoute.includes('entitlement.available'), true)
  check('126 running out is reported, not silent', store.includes('stoppedForCredits = true'), true)

  /*
    The locked commercial rule: a credit pays for reading one physical card.
    A linked card costs the same as a new one, because the vision call, the
    parse and the normalization all happened either way — the person already
    existing changes where the meeting lands, not what the work cost.
  */
  check('127a a new person costs one credit', linkResult?.newContacts, 1)
  check('127b a linked person costs one credit too', linkResult?.linkedContacts, 1)
  check('127c so two accepted cards cost two', linkResult?.creditsConsumed, 2)
  check('127d which is one per accepted card', linkResult?.creditsConsumed, linkResult?.created.length)
  check('127e the charge is recorded on the card itself', store.includes('credit_consumed: true'), true)
  check('127f in the same write that saves it', /created_contact_id: item\.linkContactId,\s*created_encounter_id: linkedEncounter\.id,\s*credit_consumed: true/.test(store), true)
  check('127g the column is never client-writable', /GRANT UPDATE \([\s\S]*?credit_consumed[\s\S]*?\) ON public\.scan_batch_items/.test(migration), false)

  // A retry charges only for what that attempt accepted.
  const retry = await quietly(() => saveBatchContacts(linkStub.client, 'owner-1', 'batch-1'))
  check('128 a retry accepts nothing', retry?.created.length, 0)
  check('129 so it charges nothing', retry?.creditsConsumed, 0)
  check('130a and neither counter moves', [retry?.newContacts, retry?.linkedContacts], [0, 0])
  check('130b no second contact is written', linkStub.writes.filter((w) => w.table === 'scanned_contacts' && w.op === 'insert').length, 1)
  check('130c no second encounter is written', linkStub.writes.filter((w) => w.table === 'contact_encounters' && w.op === 'insert').length, 2)

  // The cap counts accepted cards of either kind, and stops before the write.
  const cappedStub = stubClient({
    batch: { ...seed.batch, status: 'draft', total_saved: 0 },
    items: [
      { id: 'c1', batch_id: 'batch-1', position: 0, first_name: 'One', email: 'one@x.co', selected: true, warnings: [], confidence: 0.9, created_contact_id: null },
      { id: 'c2', batch_id: 'batch-1', position: 1, first_name: 'Two', email: 'two@x.co', selected: true, warnings: [], confidence: 0.9, created_contact_id: null },
    ],
  })
  const capped = await quietly(() => saveBatchContacts(cappedStub.client, 'owner-1', 'batch-1', 1))
  check('131a the cap limits accepted cards', capped?.creditsConsumed, 1)
  check('131b so only one person is created', capped?.newContacts, 1)
  check('132 no contact is written past the cap', cappedStub.writes.filter((w) => w.table === 'scanned_contacts' && w.op === 'insert').length, 1)
  check('133 the excess is reported', capped?.stoppedForCredits, true)
  check('134 with a reason the owner can act on', capped?.failed[0].reason, 'No Smart Scan credits left for this card.')

  // A linked card is subject to the same cap as a new one.
  const cappedLink = stubClient({
    batch: { ...seed.batch, status: 'draft', total_saved: 0 },
    items: [
      { id: 'k1', batch_id: 'batch-1', position: 0, first_name: 'Known', email: 'k@x.co', selected: true, warnings: [], confidence: 0.9, created_contact_id: null, link_contact_id: 'existing-9', link_to_existing: true },
    ],
  })
  const cappedLinkResult = await quietly(() => saveBatchContacts(cappedLink.client, 'owner-1', 'batch-1', 0))
  check('134a a linked card with no credits is refused', cappedLinkResult?.linkedContacts, 0)
  check('134b and costs nothing', cappedLinkResult?.creditsConsumed, 0)
  check('134c no encounter is written for it', cappedLink.writes.filter((w) => w.table === 'contact_encounters' && w.op === 'insert').length, 0)
  check('134d the owner is told why', cappedLinkResult?.stoppedForCredits, true)

  // A card the owner unticked, and a card that fails, are never charged.
  const mixedStub = stubClient({
    batch: { ...seed.batch, status: 'draft', total_saved: 0 },
    items: [
      { id: 'm1', batch_id: 'batch-1', position: 0, first_name: 'Kept', email: 'kept@x.co', selected: true, warnings: [], confidence: 0.9, created_contact_id: null },
      // Unticked by the owner — a false detection is removed exactly this way.
      { id: 'm2', batch_id: 'batch-1', position: 1, first_name: 'Dropped', selected: false, warnings: [], confidence: 0.2, created_contact_id: null },
      // Accepted but unusable: no name, no company, no email.
      { id: 'm3', batch_id: 'batch-1', position: 2, selected: true, warnings: [], confidence: 0.2, created_contact_id: null },
    ],
  })
  const mixed = await quietly(() => saveBatchContacts(mixedStub.client, 'owner-1', 'batch-1'))
  check('134e only the kept card is charged', mixed?.creditsConsumed, 1)
  check('134f the unticked card is never touched', mixed?.created.some((c) => c.name === 'Dropped'), false)
  check('134g the unusable card is reported, not charged', mixed?.failed.length, 1)

  /*
    A card that failed once is charged exactly once when it later succeeds —
    the guard is "already has a contact", so an item that never got one is
    still owed its credit rather than having silently paid for a failure.
  */
  const failFirst = stubClient({
    batch: { ...seed.batch, status: 'draft', total_saved: 0 },
    items: [
      { id: 'r1', batch_id: 'batch-1', position: 0, first_name: 'Retry', email: 'r@x.co', selected: true, warnings: [], confidence: 0.9, created_contact_id: null },
    ],
    failContactInsert: true,
  })
  const firstAttempt = await quietly(() => saveBatchContacts(failFirst.client, 'owner-1', 'batch-1'))
  check('134h a failed card costs nothing', firstAttempt?.creditsConsumed, 0)
  check('134i and is reported', firstAttempt?.failed.length, 1)

  const succeedsNow = stubClient({
    batch: { ...seed.batch, status: 'draft', total_saved: 0 },
    items: [
      { id: 'r1', batch_id: 'batch-1', position: 0, first_name: 'Retry', email: 'r@x.co', selected: true, warnings: [], confidence: 0.9, created_contact_id: null },
    ],
  })
  const secondAttempt = await quietly(() => saveBatchContacts(succeedsNow.client, 'owner-1', 'batch-1'))
  check('134j and costs exactly one when it finally succeeds', secondAttempt?.creditsConsumed, 1)

  /*
    Money has its own per-item guard, separate from the guard on whether the
    work is redone. An item already marked paid is never charged again, even
    if it somehow reaches the save path.
  */
  const alreadyPaidStub = stubClient({
    batch: { ...seed.batch, status: 'draft', total_saved: 0 },
    items: [
      { id: 'p1', batch_id: 'batch-1', position: 0, first_name: 'Paid', email: 'p@x.co', selected: true, warnings: [], confidence: 0.9, created_contact_id: null, credit_consumed: true },
    ],
  })
  const alreadyPaidResult = await quietly(() => saveBatchContacts(alreadyPaidStub.client, 'owner-1', 'batch-1'))
  check('134k an already-paid card is saved', alreadyPaidResult?.created.length, 1)
  check('134l but is not charged again', alreadyPaidResult?.creditsConsumed, 0)
  check('134m and is not blocked by a zero balance', (await quietly(() => saveBatchContacts(stubClient({ batch: { ...seed.batch, status: 'draft', total_saved: 0 }, items: [{ id: 'p2', batch_id: 'batch-1', position: 0, first_name: 'Paid', email: 'p2@x.co', selected: true, warnings: [], confidence: 0.9, created_contact_id: null, credit_consumed: true }] }).client, 'owner-1', 'batch-1', 0)))?.created.length, 1)
  check('134n the two guards are distinct in code', store.includes('const alreadyPaid = item.creditConsumed'), true)

  // ───────────── SOURCE KIND ─────────────

  check('135 a second photo marks the batch guided', detectRoute.includes("markBatchSource(supabase, user.id, params.id, 'guided')"), true)
  check('136 the store can record provenance', store.includes('export async function markBatchSource'), true)
  check('137 the column accepts all three kinds', migration.includes("source_kind IN ('single_photo', 'guided', 'mixed')"), true)

  // ───────────── EXPORT PRECISION ─────────────

  check('138 export sources from the batch items', exportRoute.includes('batchExportTargets'), true)
  check('139 so linked contacts are included', store.includes("from('scan_batch_items')\n    .select('created_contact_id, created_encounter_id, position')"), true)
  check('140 it sends this batch meeting, not the newest', store.includes('created_encounter_id'), true)
  check('141 a contact is exported once per batch', store.includes('seen.has(contactId)'), true)
  check('142 the encounter id is stored at save', store.includes('created_encounter_id: linkedEncounter.id'), true)

  // ───────────── FOUNDER LIFETIME ACCESS ─────────────

  const confirmed = '2026-01-01T00:00:00.000Z'
  const founderIdentity: AuthIdentity = {
    id: 'founder-uid',
    email: 'im.expoguy@gmail.com',
    email_confirmed_at: confirmed,
  }
  const normalIdentity: AuthIdentity = {
    id: 'normal-uid',
    email: 'someone@example.com',
    email_confirmed_at: confirmed,
  }
  // A free-plan profile that has already used its allowance.
  const exhaustedFree: EntitlementProfile = { plan: 'free', email: 'someone@example.com', scans_used: 3 }

  // 1. Normal users remain metered.
  const normal = readScanEntitlement({ plan: 'free', email: 'someone@example.com', scans_used: 1 }, normalIdentity)
  check('F1a a normal user is metered', normal.unmetered, false)
  check('F1b with a finite balance', normal.available, 2)
  check('F1c and is not the founder', [normal.founder, normal.pro], [false, false])
  check('F1d an exhausted normal user is blocked', readScanEntitlement(exhaustedFree, normalIdentity).available, 0)

  // 2. The founder is unmetered, with lifetime Pro.
  const founder = readScanEntitlement(exhaustedFree, founderIdentity)
  check('F2a the founder is unmetered', founder.unmetered, true)
  check('F2b with an unlimited balance', founder.available, Infinity)
  check('F2c resolves as founder', founder.founder, true)
  check('F2d with lifetime Pro', founder.pro, true)

  // 3. The founder can go past the free limit — even on a profile that says
  //    the free allowance is long gone.
  check('F3a past the free limit', readScanEntitlement({ plan: 'free', scans_used: 5000 }, founderIdentity).available > 3, true)
  check('F3b regardless of plan', readScanEntitlement({ plan: 'starter', scans_used: 99999 }, founderIdentity).unmetered, true)

  // 4. A full ten-card batch is not capped for the founder.
  const tenCards = Array.from({ length: 10 }, (_, i) => ({
    id: `f${i}`, batch_id: 'batch-1', position: i, first_name: `Card${i}`, email: `c${i}@x.co`,
    selected: true, warnings: [], confidence: 0.9, created_contact_id: null,
  }))
  const founderBatch = stubClient({ batch: { ...seed.batch, status: 'draft', total_saved: 0 }, items: tenCards })
  const founderSave = await quietly(() =>
    saveBatchContacts(founderBatch.client, 'founder-uid', 'batch-1', founder.available)
  )
  check('F4a all ten cards are accepted', founderSave?.created.length, 10)
  check('F4b none stopped for credits', founderSave?.stoppedForCredits, false)
  check('F4c the same batch is capped for a normal exhausted user', (await quietly(() =>
    saveBatchContacts(stubClient({ batch: { ...seed.batch, status: 'draft', total_saved: 0 }, items: tenCards }).client, 'normal-uid', 'batch-1', 0)
  ))?.created.length, 0)

  // 5 & 6. The counter: never moves for the founder, still moves for others.
  function counterStub() {
    const updates: Record<string, unknown>[] = []
    const client = {
      from: () => ({
        update: (payload: Record<string, unknown>) => {
          updates.push(payload)
          return { eq: async () => ({ error: null }) }
        },
      }),
    } as unknown as SupabaseClient
    return { client, updates }
  }

  const founderCounter = counterStub()
  await consumeScanCredits(founderCounter.client, { ...exhaustedFree, id: 'founder-uid' }, 10, founderIdentity)
  check('F5a founder saving ten cards writes nothing to the counter', founderCounter.updates.length, 0)

  const founderSingle = counterStub()
  await consumeScanCredits(founderSingle.client, { plan: 'free', scans_used: 0, id: 'founder-uid' }, 1, founderIdentity)
  check('F5b nor does a founder single-card scan', founderSingle.updates.length, 0)

  const normalCounter = counterStub()
  await consumeScanCredits(normalCounter.client, { plan: 'free', scans_used: 1, id: 'normal-uid' }, 2, normalIdentity)
  check('F6a a normal user is still charged', normalCounter.updates.length, 1)
  check('F6b by exactly the cards accepted', normalCounter.updates[0], { scans_used: 3 })

  // 7. Nothing a caller can send makes someone the founder.
  check('F7a an unconfirmed founder address is not the founder', isFounder({ id: 'x', email: 'im.expoguy@gmail.com' }), false)
  check('F7b a different address is not', isFounder({ id: 'x', email: 'not-founder@gmail.com', email_confirmed_at: confirmed }), false)
  check('F7c no identity is not', isFounder(null), false)
  check('F7d an identity with no id is not', isFounder({ id: '', email: 'im.expoguy@gmail.com', email_confirmed_at: confirmed }), false)
  check('F7e case and whitespace do not matter', isFounder({ id: 'x', email: '  IM.ExpoGuy@Gmail.com ', email_confirmed_at: confirmed }), true)
  check('F7f confirmed_at alone is accepted', isFounder({ id: 'x', email: 'im.expoguy@gmail.com', confirmed_at: confirmed }), true)

  // A profile row claiming the founder address does not make its owner the
  // founder — founder and Pro come from the verified identity alone.
  const profileClaim = readScanEntitlement({ plan: 'free', email: 'im.expoguy@gmail.com', scans_used: 0 }, normalIdentity)
  check('F7g a profile email cannot grant founder status', profileClaim.founder, false)
  check('F7h nor Pro', profileClaim.pro, false)

  // Every scanning route resolves the identity from the verified session.
  const singleScan = code('app/api/card/scan/route.ts')
  const entitlementLib = code('lib/scan/entitlement.ts')
  for (const [name, src, call] of [
    ['single-card', singleScan, 'readScanEntitlement(dbProfile, user)'],
    ['multi-card detect', detectRoute, 'readScanEntitlement(profile, user)'],
    ['multi-card save', saveRoute, 'readScanEntitlement(profile, user)'],
  ] as const) {
    check(`F7i ${name} passes the verified session user`, src.includes(call), true)
    check(`F7j ${name} takes user from auth.getUser()`, src.includes('auth.getUser()'), true)
    check(`F7k ${name} never reads identity from the request`, /isFounder\(|body\.email|body\.userId|searchParams\.get\(['"]email/.test(src), false)
  }
  check('F7l both scanners charge through the seam', singleScan.includes('consumeScanCredits(supabase, { ...dbProfile, id: userId }, 1, user)'), true)
  check('F7m single-card no longer hand-rolls the counter', /scans_used: used \+ 1/.test(singleScan), false)
  check('F7n the founder rule lives in one place', /im\.expoguy/.test(entitlementLib + singleScan + detectRoute + saveRoute), false)
  check('F7o founder requires a confirmed address', entitlementLib.includes('if (!identity.email_confirmed_at && !identity.confirmed_at) return false'), true)
  check('F7p the founder address is defined once', read('lib/scan-limits.ts').match(/im\.expoguy@gmail\.com/g)?.length, 1)
  check('F7q the other exempt account is preserved', read('lib/scan-limits.ts').includes('bury.esco@gmail.com'), true)

  // ═══════════ REAL-WORLD QA POLISH V2: CAPTURE ═══════════

  const cameraStage = code('components/scan/CameraStage.tsx')
  const orientationLib = code('lib/scan/useOrientation.ts')
  const imageLib = code('lib/image-compress.ts')
  const hintSrc = multiClient.slice(
    multiClient.indexOf('function LandscapeHint'),
    multiClient.indexOf('function WideFrame')
  )
  const phone = { mobile: true, portrait: true }

  // 1. Portrait mobile gets the landscape recommendation.
  check('Q1a an upright phone is told to turn sideways', shouldSuggestLandscape(phone, { live: true, dismissed: false }), true)
  check('Q1b with the approved headline', hintSrc.includes('Turn your phone sideways'), true)
  check('Q1c and the approved supporting line', hintSrc.includes('Fit all cards in the frame and leave a little space between them.'), true)
  check('Q1d using the existing icon set', hintSrc.includes('IconDeviceMobileRotated'), true)
  check('Q1e "mobile" means touch-first, not a narrow window', orientationLib.includes("'(hover: none) and (pointer: coarse)'"), true)
  check('Q1f and orientation is followed live', orientationLib.includes("'(orientation: portrait)'") && orientationLib.includes("addEventListener?.('change', read)"), true)
  check('Q1g the client feeds the live state in', multiClient.includes('suggestLandscape={shouldSuggestLandscape(orientation, {'), true)

  // 2. Landscape, desktop, a dismissed tip or no camera: no interruption at all.
  check('Q2a a phone already sideways is not interrupted', shouldSuggestLandscape({ mobile: true, portrait: false }, { live: true, dismissed: false }), false)
  check('Q2b a desktop is never told to rotate', shouldSuggestLandscape({ mobile: false, portrait: true }, { live: true, dismissed: false }), false)
  check('Q2c a dismissed tip stays dismissed', shouldSuggestLandscape(phone, { live: true, dismissed: true }), false)
  check('Q2d no tip without a live viewfinder', shouldSuggestLandscape(phone, { live: false, dismissed: false }), false)
  check('Q2e the tip is not a modal', /aria-modal|role="dialog"|role="alertdialog"/.test(hintSrc), false)
  check('Q2f the tip is dismissible', hintSrc.includes('onClick={onDismiss}') && hintSrc.includes('aria-label="Dismiss rotation tip"'), true)
  check('Q2g orientation is never locked', /orientation\.lock|screen\.orientation/.test(multiClient), false)
  check('Q2h capture is never gated on orientation', multiClient.includes('disabled={!live || blocked || remaining <= 0}'), true)

  // 3. Multi-Card uses a wide frame.
  check('Q3a there is a wide multi-card frame', multiClient.includes('function WideFrame()') && multiClient.includes('aspect-[3/2] max-h-full w-full'), true)
  check('Q3b it shows several cards side by side', multiClient.includes('Array.from({ length: 6 }') && multiClient.includes('aspect-[85/55]'), true)
  check('Q3c sideways on a phone the viewfinder takes the width', multiClient.includes('max-lg:landscape:flex-row') && multiClient.includes('max-lg:landscape:w-[196px]'), true)
  check('Q3d the sideways stage is sized between header and navigation', multiClient.includes('MOBILE_NAV_HEIGHT') && multiClient.includes("env(safe-area-inset-bottom)"), true)
  check('Q3e microcopy leads with the count', multiClient.includes('Scan up to ${MAX_BATCH_CARDS} cards at once'), true)
  check('Q3f then the one practical instruction', multiClient.includes('Keep cards flat, separated and well lit.'), true)
  check('Q3g the old paragraph over the camera is gone', multiClient.includes('Lay the cards flat and fill the frame'), false)

  // 4. Single Card framing is unchanged.
  check('Q4a the single-card guides are still the corner guides', cameraStage.includes('function Guides()') && cameraStage.includes('absolute inset-6 sm:inset-10'), true)
  check('Q4b and know nothing of the wide frame', /WideFrame|LandscapeHint|useOrientation/.test(cameraStage + scanClient), false)
  check('Q4c single-card still compresses the way it did', scanClient.includes('await compressImageForScan(file)'), true)
  check('Q4d with the same defaults', imageLib.includes('opts.maxWidth ?? 1600') && imageLib.includes('opts.quality ?? 0.82'), true)

  // 5. Upload a photo remains available.
  check('Q5a upload is offered', multiClient.includes('Upload a photo'), true)
  check('Q5b and is never gated on orientation', multiClient.includes('onClick={onPickFile} disabled={blocked || remaining <= 0}'), true)
  // Raw source: `image/*` reads as a comment opener to the comment stripper.
  const multiRaw = read('components/scan/MultiCardClient.tsx')
  check('Q5c gallery images of any shape are accepted', /accept="image\/\*"\s*className="hidden"/.test(multiRaw) && !/capture="environment"/.test(multiRaw), true)

  // 6. The multi-card image policy keeps more useful detail.
  const landscapeFrame = fitToVisionBudget(1920, 1080, MULTI_CARD_IMAGE_POLICY)
  check('Q6a a 1920×1080 frame is sent at exactly what the model reads', landscapeFrame, { width: 1456, height: 819 })
  check('Q6b within the patch budget', visualTokens(landscapeFrame.width, landscapeFrame.height) <= MULTI_CARD_IMAGE_POLICY.maxVisualTokens, true)
  const docsExample = fitToVisionBudget(2000, 1500, MULTI_CARD_IMAGE_POLICY)
  check('Q6c the documented 2000×1500 example lands on ~1269×952', Math.abs(docsExample.width - 1269) <= 3 && Math.abs(docsExample.height - 952) <= 3, true)
  const twelveMp = fitToVisionBudget(4032, 3024, MULTI_CARD_IMAGE_POLICY)
  check('Q6d a 12 MP gallery photo is brought to the budget, not sent raw', twelveMp.width <= 1568 && visualTokens(twelveMp.width, twelveMp.height) <= 1568 && twelveMp.width > 1200, true)
  check('Q6e an upright frame fits too', visualTokens(fitToVisionBudget(1080, 1920, MULTI_CARD_IMAGE_POLICY).width, fitToVisionBudget(1080, 1920, MULTI_CARD_IMAGE_POLICY).height) <= 1568, true)
  check('Q6f a small image is never enlarged', fitToVisionBudget(1000, 700, MULTI_CARD_IMAGE_POLICY), { width: 1000, height: 700 })
  /*
    Before: the same 1920×1080 frame went through the single-card resize to
    1600×900 at quality 0.82 — still over the model's patch budget, so the API
    resampled it a second time before reading. After: one resample, straight
    to the size the model reads, at 0.92.
  */
  check('Q6g the old 1600×900 upload was over budget (a second resample)', visualTokens(1600, 900) > MULTI_CARD_IMAGE_POLICY.maxVisualTokens, true)
  check('Q6h the new upload is not', visualTokens(landscapeFrame.width, landscapeFrame.height) <= MULTI_CARD_IMAGE_POLICY.maxVisualTokens && landscapeFrame.width <= MULTI_CARD_IMAGE_POLICY.maxLongEdge, true)
  check('Q6i one lighter encode than before', MULTI_CARD_IMAGE_POLICY.quality > 0.82, true)
  check('Q6j multi-card uses the vision policy', multiClient.includes('prepareImageForVision(file, MULTI_CARD_IMAGE_POLICY)'), true)
  check('Q6k and not the single-card resize', multiClient.includes('compressImageForScan'), false)
  check('Q6l the policy matches the standard vision tier', MULTI_CARD_IMAGE_POLICY, { maxLongEdge: 1568, maxVisualTokens: 1568, quality: 0.92 })
  check('Q6m which is still the tier of the model in use', claude.includes("model: 'claude-sonnet-4-5'"), true)
  check('Q6n the resample is stepped and high quality', imageLib.includes("imageSmoothingQuality = 'high'"), true)
  check('Q6o only small JPEG/PNG/WebP pass through untouched', imageLib.includes("const PASS_THROUGH_TYPES = ['image/jpeg', 'image/png', 'image/webp']") && imageLib.includes('file.size <= PASS_THROUGH_BYTES'), true)
  check('Q6p so a gallery HEIC is always re-encoded', /heic/i.test(imageLib), false)

  // ═══════════ REAL-WORLD QA POLISH V2: REMOVE BEFORE SAVE ═══════════

  // 7. Every draft review item exposes Remove card.
  check('Q7a each unsaved row has a Remove card control', cardList.includes('aria-label={`Remove card: ${label}`}'), true)
  check('Q7b only on cards not yet saved', /\{!saved \? \(\s*<button[\s\S]{0,200}onClick=\{onRemove\}/.test(cardList), true)
  // Pixels, not rem: the phone root font is 14px, so h-11 would render at 38.5px.
  check('Q7c with a 44px thumb-sized target', /onClick=\{onRemove\}[\s\S]{0,300}h-\[44px\] w-\[44px\]/.test(cardList), true)
  check('Q7e Undo, the tip dismiss and Start over are 44px too', (multiClient.match(/h-\[44px\]/g) || []).length, 3)
  check('Q7d worded as a card, never as a contact', /Delete contact/i.test(cardList + multiClient), false)

  // 8 & 9. Remove makes the item inactive and takes it out of the list.
  const three = [item({ id: 'x1', position: 0 }), item({ id: 'x2', position: 1 }), item({ id: 'x3', position: 2 })]
  const withoutX2 = setItemSelected(three, 'x2', false)
  check('Q8a remove makes the card inactive', isActiveBatchItem(withoutX2[1]), false)
  check('Q8b by unselecting it, not deleting it', withoutX2.length, 3)
  check('Q9a the review list no longer shows it', withoutX2.filter(isActiveBatchItem).map((i) => i.id), ['x1', 'x3'])
  check('Q9b the list renders active cards only', cardList.includes('const active = items.filter(isActiveBatchItem)') && cardList.includes('active.map((item)'), true)
  check('Q9c a saved card stays visible', isActiveBatchItem(item({ selected: false, createdContactId: 'c' })), true)

  // 10. The Save count follows immediately.
  const ten = Array.from({ length: 10 }, (_, i) => item({ id: `n${i}`, position: i }))
  check('Q10a ten detected, Save 10', batchSaveCount(ten), 10)
  check('Q10b remove one, Save 9', batchSaveCount(setItemSelected(ten, 'n4', false)), 9)
  check('Q10c the button reads the live count', multiClient.includes('const selectedCount = batchSaveCount(items)') && multiClient.includes('`Save ${selectedCount} contact${selectedCount === 1 ?'), true)

  // 11–14 and 20/21. Ten detected, two removed, eight saved.
  function tenCardSeed() {
    return {
      batch: { ...seed.batch, status: 'draft', total_saved: 0, total_detected: 10 },
      items: Array.from({ length: 10 }, (_, i) => ({
        id: `t${i}`, batch_id: 'batch-1', position: i, first_name: `Person${i}`, email: `p${i}@x.co`,
        selected: true, warnings: [], confidence: 0.9, created_contact_id: null,
      })),
    }
  }

  const removal = stubClient(tenCardSeed())
  await applyItemPatches(removal.client, 'owner-1', 'batch-1', [
    { id: 't3', selected: false },
    { id: 't7', selected: false },
  ])
  check('Q11a the removal is stored as selected = false', removal.itemRows.filter((row) => row.selected === false).map((row) => row.id), ['t3', 't7'])
  const eight = await quietly(() => saveBatchContacts(removal.client, 'owner-1', 'batch-1', 50))
  const eightContacts = removal.writes.filter((w) => w.table === 'scanned_contacts' && w.op === 'insert')
  const eightEncounters = removal.writes.filter((w) => w.table === 'contact_encounters' && w.op === 'insert')
  check('Q11b ten detected, two removed: eight contacts', eightContacts.length, 8)
  check('Q11c no contact for a removed card', eightContacts.some((w) => ['t3', 't7'].includes(String((w.payload as Record<string, unknown>).scan_batch_item_id))), false)
  check('Q11d the removed rows never gain a contact', removal.itemRows.filter((row) => ['t3', 't7'].includes(String(row.id))).map((row) => row.created_contact_id ?? null), [null, null])
  check('Q12a eight encounters, not ten', eightEncounters.length, 8)
  check('Q12b the shared meeting reaches only kept cards', eightEncounters.every((w) => (w.payload as Record<string, unknown>).event === 'Web Summit · Hall 3'), true)
  check('Q13a exactly eight credits for eight cards', eight?.creditsConsumed, 8)
  check('Q13b a removed card is never marked paid', removal.itemRows.filter((row) => ['t3', 't7'].includes(String(row.id))).some((row) => row.credit_consumed === true), false)
  check('Q13c nothing is reported as failed for a removal', eight?.failed.length, 0)

  const exportTargets = await batchExportTargets(removal.client, 'owner-1', 'batch-1')
  check('Q14a the CRM export holds the eight kept cards', exportTargets.length, 8)
  const keptContactIds = new Set(removal.itemRows.filter((row) => row.selected !== false).map((row) => String(row.created_contact_id)))
  check('Q14b and nothing from a removed card', exportTargets.every((target) => keptContactIds.has(target.contactId)), true)

  // A retry after all that charges nothing and creates nothing.
  const eightRetry = await quietly(() => saveBatchContacts(removal.client, 'owner-1', 'batch-1', 50))
  check('Q13d a retry is not charged again', eightRetry?.creditsConsumed, 0)
  check('Q13e and writes no contact', removal.writes.filter((w) => w.table === 'scanned_contacts' && w.op === 'insert').length, 8)

  // 15. Removing one card touches no other card.
  const isolation = stubClient(tenCardSeed())
  const before = JSON.stringify(isolation.itemRows.filter((row) => row.id !== 't2'))
  await applyItemPatches(isolation.client, 'owner-1', 'batch-1', [{ id: 't2', selected: false }])
  check('Q15a one removal is one row update', isolation.writes.filter((w) => w.table === 'scan_batch_items' && w.op === 'update').length, 1)
  check('Q15b every other row is exactly as it was', JSON.stringify(isolation.itemRows.filter((row) => row.id !== 't2')), before)
  const reshaped = setItemSelected(ten, 'n2', false)
  check('Q15c the client keeps every other card as the same object', reshaped.every((entry, i) => i === 2 || entry === ten[i]), true)
  check('Q15d and does not mutate what it was given', ten[2].selected, true)

  // 16. Manual completion stays available for an incomplete card.
  const phoneOnly = item({ id: 'inc', fields: { ...emptyCandidate(), company: '', phone: '+49 30 1' } })
  check('Q16a an incomplete card is not removed for being incomplete', isActiveBatchItem(phoneOnly), true)
  check('Q16b it is flagged instead', cardList.includes('Add a name, company or email'), true)
  check('Q16c its fields stay editable', cardList.includes('disabled={disabled || saved}'), true)
  const completion = stubClient({
    batch: { ...seed.batch, status: 'draft', total_saved: 0 },
    items: [{ id: 'inc', batch_id: 'batch-1', position: 0, phone: '+49 30 1', company: 'Siemens', selected: true, warnings: ['no_name'], confidence: 0.4, created_contact_id: null }],
  })
  await applyItemPatches(completion.client, 'owner-1', 'batch-1', [
    { id: 'inc', fields: { ...emptyCandidate(), first_name: 'Werner', company: 'Siemens', phone: '+49 30 1' } },
  ])
  const completed = await quietly(() => saveBatchContacts(completion.client, 'owner-1', 'batch-1', 5))
  check('Q16d a card the owner completed by hand saves', completed?.created.length, 1)
  check('Q16e with the name they typed', completion.itemRows[0].first_name, 'Werner')

  // 17. All removed: Save is disabled and no empty save is sent.
  const allGone = ten.reduce((list, entry) => setItemSelected(list, entry.id, false), ten)
  check('Q17a every card removed leaves nothing to save', batchSaveCount(allGone), 0)
  check('Q17b the Save button is disabled at zero', multiClient.includes("disabled={stage === 'saving' || selectedCount === 0}"), true)
  check('Q17c and says why', multiClient.includes("'No cards to save'"), true)
  check('Q17d the list says no cards are selected', cardList.includes('No cards selected.'), true)
  check('Q17e Add another photo is still offered', remainingInBatch(allGone) > 0 && multiClient.includes('Add another photo'), true)
  check('Q17f an empty save is never sent', multiClient.includes('if (!batch || batchSaveCount(batch.items) === 0) return'), true)
  check('Q17g and the server refuses one anyway', saveRoute.includes("reason: 'nothing_selected'"), true)
  const emptySave = stubClient({
    batch: { ...seed.batch, status: 'draft', total_saved: 0 },
    items: tenCardSeed().items.map((row) => ({ ...row, selected: false })),
  })
  const emptyResult = await quietly(() => saveBatchContacts(emptySave.client, 'owner-1', 'batch-1', 50))
  check('Q17h saving an all-removed batch creates nothing', [emptyResult?.created.length, emptyResult?.creditsConsumed], [0, 0])

  // 18. Undo restores the card, in place, with its data.
  const restored = setItemSelected(withoutX2, 'x2', true)
  check('Q18a Undo restores the card exactly', restored, three)
  check('Q18b in the same position', restored.findIndex((entry) => entry.id === 'x2'), 1)
  check('Q18c the toast reads Card removed · Undo', /Card removed<\/span>\s*<span aria-hidden="true">·<\/span>[\s\S]{0,120}onClick=\{undoRemove\}[\s\S]{0,400}Undo/.test(multiClient), true)
  check('Q18d it is temporary', multiClient.includes('const UNDO_WINDOW_MS = 6000'), true)
  check('Q18e restoring sends selected = true', multiClient.includes('setSelected(itemId, true)'), true)

  // 19. A restored card saves normally.
  const undoStub = stubClient(tenCardSeed())
  await applyItemPatches(undoStub.client, 'owner-1', 'batch-1', [{ id: 't5', selected: false }])
  await applyItemPatches(undoStub.client, 'owner-1', 'batch-1', [{ id: 't5', selected: true }])
  const afterUndo = await quietly(() => saveBatchContacts(undoStub.client, 'owner-1', 'batch-1', 50))
  check('Q19a the restored card becomes a contact', afterUndo?.created.some((entry) => entry.itemId === 't5'), true)
  check('Q19b with its own meeting', undoStub.writes.filter((w) => w.table === 'contact_encounters' && w.op === 'insert').length, 10)
  check('Q19c and costs its one credit', afterUndo?.creditsConsumed, 10)

  // 20. Founder stays unlimited through a removal.
  const founderRemoval = stubClient(tenCardSeed())
  await applyItemPatches(founderRemoval.client, 'founder-uid', 'batch-1', [
    { id: 't0', selected: false },
    { id: 't9', selected: false },
  ])
  const founderEight = await quietly(() =>
    saveBatchContacts(founderRemoval.client, 'founder-uid', 'batch-1', founder.available)
  )
  check('Q20a the founder saves the eight kept cards', founderEight?.created.length, 8)
  const founderEightCounter = counterStub()
  await consumeScanCredits(founderEightCounter.client, { ...exhaustedFree, id: 'founder-uid' }, founderEight?.creditsConsumed ?? 0, founderIdentity)
  check('Q20b with zero decrements', founderEightCounter.updates.length, 0)

  // 21. Normal metering stays exact.
  const starter: EntitlementProfile = { plan: 'starter', email: 'someone@example.com', scans_used: 10 }
  const starterBalance = readScanEntitlement(starter, normalIdentity)
  check('Q21a a metered user has a finite balance', [starterBalance.unmetered, starterBalance.available], [false, 40])
  const meteredCounter = counterStub()
  await consumeScanCredits(meteredCounter.client, { ...starter, id: 'normal-uid' }, eight?.creditsConsumed ?? 0, normalIdentity)
  check('Q21b eight kept cards cost exactly eight', meteredCounter.updates[0], { scans_used: 18 })
  const shortOfOne = stubClient(tenCardSeed())
  await applyItemPatches(shortOfOne.client, 'owner-1', 'batch-1', [
    { id: 't1', selected: false },
    { id: 't2', selected: false },
  ])
  const sevenOfEight = await quietly(() => saveBatchContacts(shortOfOne.client, 'owner-1', 'batch-1', 7))
  check('Q21c a balance of seven keeps seven of the eight', [sevenOfEight?.created.length, sevenOfEight?.creditsConsumed, sevenOfEight?.stoppedForCredits], [7, 7, true])

  // ═══════════ CAPACITY AFTER REMOVAL ═══════════

  const selections = (active: number, removedCount: number) => [
    ...Array.from({ length: active }, () => ({ selected: true })),
    ...Array.from({ length: removedCount }, () => ({ selected: false })),
  ]
  check('Q22a a full batch has no room', remainingInBatch(selections(10, 0)), 0)
  check('Q22b removing two frees two places', remainingInBatch(selections(8, 2)), 2)
  check('Q22c rows are bounded too', MAX_BATCH_ROWS, 30)
  check('Q22d so a session cannot detect without end', remainingInBatch(selections(3, 25)), 2)
  check('Q22e and stops at the row limit', remainingInBatch(selections(5, 25)), 0)

  function countClient(rows: { selected: boolean }[]) {
    return {
      from: () => {
        const filters: Record<string, unknown> = {}
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: (column: string, value: unknown) => {
            filters[column] = value
            return chain
          },
        }
        chain.then = (resolve: (value: unknown) => void) =>
          resolve({
            count: rows.filter((row) => filters.selected === undefined || row.selected === filters.selected).length,
            error: null,
          })
        return chain
      },
    } as unknown as SupabaseClient
  }
  check('Q22f the server frees the same places', await remainingCapacity(countClient(selections(8, 2)), 'owner-1', 'batch-1'), 2)
  check('Q22g and agrees at the row limit', await remainingCapacity(countClient(selections(5, 25)), 'owner-1', 'batch-1'), 0)
  check('Q22h the detect response reports the same room', detectRoute.includes('remaining: remainingInBatch(refreshed?.items || [])'), true)

  const tenPlusRemoved = [...Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, selected: true })), { id: 'gone', selected: false }]
  check('Q23a a restore past ten active cards is refused', capReselection(tenPlusRemoved, [{ id: 'gone', selected: true }]), [{ id: 'gone' }])
  check('Q23b a swap in one request is honoured', capReselection(tenPlusRemoved, [{ id: 'a0', selected: false }, { id: 'gone', selected: true }]), [{ id: 'a0', selected: false }, { id: 'gone', selected: true }])
  const nineTwo = [...Array.from({ length: 9 }, (_, i) => ({ id: `b${i}`, selected: true })), { id: 'r1', selected: false }, { id: 'r2', selected: false }]
  check('Q23c restores fill the batch and stop at ten', capReselection(nineTwo, [{ id: 'r1', selected: true }, { id: 'r2', selected: true }]), [{ id: 'r1', selected: true }, { id: 'r2' }])
  check('Q23d the rest of a refused patch still applies', capReselection(tenPlusRemoved, [{ id: 'gone', selected: true, linkToExisting: false }]), [{ id: 'gone', linkToExisting: false }])
  check('Q23e both write routes enforce it', patchRoute.includes('capReselection(') && saveRoute.includes('capReselection('), true)

  // The removal is persisted before anything that depends on it.
  check('Q24a a removal is sent as it happens', multiClient.includes("method: 'PATCH'") && multiClient.includes('items: [{ id: itemId, selected }]'), true)
  check('Q24b detection and save wait for it', (multiClient.match(/await selectionSync\.current/g) || []).length, 2)
  check('Q24c save still carries every card’s final state', multiClient.includes('selected: item.selected'), true)

  // ═══════════ ACCESSIBILITY AND LAYOUT ═══════════

  check('Q25a the remove control is named "Remove card"', /aria-label=\{`Remove card: /.test(cardList), true)
  check('Q25b Undo is a real, focusable button', /<button\s+ref=\{undoRef\}\s+type="button"/.test(multiClient), true)
  check('Q25c Undo is announced', multiClient.includes('<div aria-live="polite" aria-atomic="true">'), true)
  check('Q25d Undo waits while the owner is on it', multiClient.includes('onFocus={() => setHoldUndo(true)}') && multiClient.includes('onPointerEnter={() => setHoldUndo(true)}'), true)
  check('Q25e a keyboard removal moves focus to Undo', multiClient.includes('if (removed?.fromKeyboard) undoRef.current?.focus({ preventScroll: true })'), true)
  check('Q25f the rotation tip traps nothing', /\.focus\(|tabIndex|FocusTrap|inert/.test(hintSrc), false)
  check('Q25g the rotation tip is announced, not modal', hintSrc.includes('role="status"'), true)
  check('Q25h warnings carry words and an icon, not colour alone', /function Warning[\s\S]*IconAlertTriangle[\s\S]*\{text\}/.test(cardList), true)
  check('Q25i the review bar stays above the phone navigation', multiClient.includes('style={{ bottom: ABOVE_MOBILE_NAV }}'), true)
  check('Q25j review rows still show role, company and contact line', cardList.includes('[fields.role, name ? fields.company : \'\']') && cardList.includes('[fields.email, fields.phone]'), true)
  check('Q25k and the existing-contact match', cardList.includes('Already in your contacts as'), true)

  const total = passed + failures.length
  if (failures.length) {
    console.log(`\nMulti-card: ${passed}/${total} PASS, ${failures.length} FAILED\n`)
    for (const failure of failures) console.log('  FAIL ' + failure)
    process.exit(1)
  }
  console.log(`\nMulti-card: ${passed}/${total} PASS`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
