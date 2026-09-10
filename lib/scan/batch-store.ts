import type { SupabaseClient } from '@supabase/supabase-js'
import { createEncounter } from '@/lib/encounters'
import { sanitizeEventName } from '@/lib/event-normalizer'
import { findExistingContactMatches } from '@/lib/contacts/duplicate-match'
import { onCardScanned } from '@/lib/crm-engine'
import { sanitizeCardExtract, type CardExtract } from '@/lib/scan-card-validation'
import { splitName } from '@/lib/data-model'
import { toCandidate, type ContactCandidate } from '@/lib/scan/candidate'
import {
  deriveWarnings,
  encounterEventText,
  MAX_BATCH_CARDS,
  type BatchItem,
  type BatchItemWarning,
  type BatchSharedContext,
  type BatchSourceKind,
  type ScanBatch,
} from '@/lib/scan/batch'

/**
 * Batches, and the one place they are written.
 *
 * Every function here takes an `ownerId` that the caller has already read out
 * of a verified session, and every query filters on it. Nothing in this file
 * trusts an id from a request body: a forged batch id simply finds nothing,
 * which is the same defence `pushContactEncounterToCrm` relies on.
 *
 * The service-role client is used deliberately — these writes span three tables
 * and set columns the owner is not granted (counters, status, the contact
 * link), and the ten-card ceiling and the scan quota are enforced above.
 */

type Row = Record<string, unknown>

const str = (value: unknown): string => (typeof value === 'string' ? value : '')
const nullableStr = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null

function rowToItem(row: Row, linkNames: Map<string, string> = new Map()): BatchItem {
  const fields: ContactCandidate = {
    first_name: str(row.first_name),
    last_name: str(row.last_name),
    company: str(row.company),
    role: str(row.role),
    email: str(row.email),
    phone: str(row.phone),
    website: str(row.website),
    linkedin_url: str(row.linkedin_url),
  }

  const confidence = typeof row.confidence === 'number' ? row.confidence : null
  const stored = Array.isArray(row.warnings) ? (row.warnings as BatchItemWarning[]) : []

  /*
    Stored warnings and derived ones are merged rather than one replacing the
    other. `possible_duplicate` is a fact about the owner's other contacts that
    only the server can know, so it has to survive a round trip; the rest are
    recomputed from the fields as they stand now, so a warning the owner has
    just fixed by typing a name disappears instead of nagging.
  */
  const derived = deriveWarnings(fields, confidence)
  const carried = stored.filter((w) => w === 'possible_duplicate')
  const warnings = Array.from(new Set([...derived, ...carried]))

  return {
    id: String(row.id),
    position: typeof row.position === 'number' ? row.position : 0,
    fields,
    confidence,
    warnings,
    selected: row.selected !== false,
    createdContactId: nullableStr(row.created_contact_id),
    linkContactId: nullableStr(row.link_contact_id),
    /*
      Resolved from the contacts table at read time rather than copied onto the
      item. A stored name would be a second copy of somebody's name, free to
      drift from the real one — and this is scratch storage, so it would drift
      silently.
    */
    linkContactName: linkNames.get(nullableStr(row.link_contact_id) ?? '') ?? null,
    linkToExisting: row.link_to_existing !== false,
    creditConsumed: row.credit_consumed === true,
  }
}

function rowToBatch(row: Row, itemRows: Row[], linkNames: Map<string, string> = new Map()): ScanBatch {
  return {
    id: String(row.id),
    status: row.status === 'saved' ? 'saved' : 'draft',
    sourceKind: (row.source_kind as BatchSourceKind) || 'single_photo',
    sharedContext: {
      event: str(row.shared_event),
      location: str(row.shared_location),
      discussed: str(row.shared_discussed),
      nextAction: str(row.shared_next_action),
      followUpAt: nullableStr(row.shared_follow_up_at),
      metAt: nullableStr(row.shared_met_at),
    },
    totalDetected: typeof row.total_detected === 'number' ? row.total_detected : 0,
    totalSaved: typeof row.total_saved === 'number' ? row.total_saved : 0,
    items: itemRows.map((item) => rowToItem(item, linkNames)).sort((a, b) => a.position - b.position),
    createdAt: str(row.created_at),
    savedAt: nullableStr(row.saved_at),
  }
}

export async function createBatch(
  supabase: SupabaseClient,
  ownerId: string,
  sourceKind: BatchSourceKind
): Promise<ScanBatch | null> {
  const { data, error } = await supabase
    .from('scan_batches')
    .insert({ user_id: ownerId, status: 'draft', source_kind: sourceKind })
    .select('*')
    .single()

  if (error || !data) {
    console.error('[scan/batch] create failed:', error)
    return null
  }
  return rowToBatch(data as Row, [])
}

export async function loadBatch(
  supabase: SupabaseClient,
  ownerId: string,
  batchId: string
): Promise<ScanBatch | null> {
  const { data: batchRow, error } = await supabase
    .from('scan_batches')
    .select('*')
    .eq('id', batchId)
    .eq('user_id', ownerId)
    .maybeSingle()

  if (error || !batchRow) return null

  const { data: itemRows } = await supabase
    .from('scan_batch_items')
    .select('*')
    .eq('batch_id', batchId)
    .eq('user_id', ownerId)
    .order('position', { ascending: true })

  const rows = (itemRows || []) as Row[]

  /*
    One query for every matched person in the batch, rather than one per item.
    Owner-scoped as well as id-scoped: the composite foreign key already makes a
    cross-tenant link impossible to store, and this makes it impossible to read
    even if one ever did.
  */
  const linkIds = Array.from(
    new Set(rows.map((row) => nullableStr(row.link_contact_id)).filter(Boolean) as string[])
  )

  const linkNames = new Map<string, string>()
  if (linkIds.length > 0) {
    const { data: linked } = await supabase
      .from('scanned_contacts')
      .select('id, name')
      .eq('user_id', ownerId)
      .in('id', linkIds)

    for (const contact of (linked || []) as Row[]) {
      linkNames.set(String(contact.id), str(contact.name) || 'Existing contact')
    }
  }

  return rowToBatch(batchRow as Row, rows, linkNames)
}

/**
 * How many more cards this batch can hold.
 *
 * Read from the database rather than from a count the client sent, because the
 * ceiling is the whole point: a guided session appends photo by photo, and each
 * request has to be checked against what is already stored.
 */
export async function remainingCapacity(
  supabase: SupabaseClient,
  ownerId: string,
  batchId: string
): Promise<number> {
  const { count } = await supabase
    .from('scan_batch_items')
    .select('id', { count: 'exact', head: true })
    .eq('batch_id', batchId)
    .eq('user_id', ownerId)

  return Math.max(0, MAX_BATCH_CARDS - (count || 0))
}

/**
 * Record how the cards actually arrived.
 *
 * A batch opens as `single_photo` because that is what one shot is, and becomes
 * `guided` the moment a second photograph joins it. Written when the session
 * proves it rather than declared up front, so the column describes what
 * happened instead of what the client intended.
 */
export async function markBatchSource(
  supabase: SupabaseClient,
  ownerId: string,
  batchId: string,
  sourceKind: BatchSourceKind
): Promise<void> {
  await supabase
    .from('scan_batches')
    .update({ source_kind: sourceKind, updated_at: new Date().toISOString() })
    .eq('id', batchId)
    .eq('user_id', ownerId)
}

export type DetectedCard = CardExtract & { confidence: number | null }

/**
 * Append what one photograph produced, and flag anyone already in the book.
 *
 * The duplicate check runs here, once per card, at the moment the card is
 * detected rather than at save time. Discovering at save that four of your ten
 * cards were people you already knew is a worse moment to find out than seeing
 * it on the review screen while you can still decide.
 */
export async function appendDetectedCards(
  supabase: SupabaseClient,
  ownerId: string,
  batchId: string,
  detected: DetectedCard[],
  startPosition: number
): Promise<BatchItem[]> {
  if (detected.length === 0) return []

  const rows = await Promise.all(
    detected.map(async (card, index) => {
      const clean = sanitizeCardExtract({
        name: card.name,
        company: card.company,
        role: card.role,
        email: card.email,
        phone: card.phone,
        website: card.website,
        linkedin_url: card.linkedin_url,
      } as CardExtract)

      const fields = toCandidate({
        name: clean.name,
        company: clean.company,
        role: clean.role,
        email: clean.email,
        phone: clean.phone,
        website: clean.website,
        linkedin_url: clean.linkedin_url,
      })

      const warnings = deriveWarnings(fields, card.confidence)

      /*
        Only deterministic identifiers, exactly as the single-card save does.
        A name-and-company guess would flag colleagues from the same stand as
        each other, which at a trade fair is the common case rather than the
        exception.
      */
      const match = await findExistingContactMatches(supabase, {
        ownerId,
        abcUserId: null,
        email: clean.email,
        phone: clean.phone,
      })

      /*
        A match is recorded as a link, not merely as a warning.

        A contact is a person and an encounter is a time you met them, so
        meeting somebody again at a second fair must add to the person rather
        than manufacture a second copy of them. The id is stored here, where the
        server established it — never taken from the client — and `selected`
        stays true because the card is still something the owner is keeping;
        what changes is whether keeping it creates a person or adds to one.

        Only when exactly one contact matched. Several matches is a decision the
        owner has to make with names in front of them, and picking one on their
        behalf would attach a meeting to the wrong person silently.
      */
      const singleMatch = match && match.contacts.length === 1 ? match.contacts[0] : null
      if (match) warnings.push('possible_duplicate')

      return {
        batch_id: batchId,
        user_id: ownerId,
        position: startPosition + index,
        first_name: fields.first_name || null,
        last_name: fields.last_name || null,
        company: fields.company || null,
        role: fields.role || null,
        email: fields.email || null,
        phone: fields.phone || null,
        website: fields.website || null,
        linkedin_url: fields.linkedin_url || null,
        raw_ocr: card as unknown as Record<string, unknown>,
        confidence: card.confidence,
        warnings,
        selected: true,
        link_contact_id: singleMatch?.contactId ?? null,
        link_to_existing: Boolean(singleMatch),
      }
    })
  )

  const { data, error } = await supabase.from('scan_batch_items').insert(rows).select('*')

  if (error || !data) {
    console.error('[scan/batch] item insert failed:', error)
    return []
  }

  await supabase
    .from('scan_batches')
    .update({
      total_detected: startPosition + rows.length,
      updated_at: new Date().toISOString(),
    })
    .eq('id', batchId)
    .eq('user_id', ownerId)

  return (data as Row[]).map((row) => rowToItem(row)).sort((a, b) => a.position - b.position)
}

/** The owner's corrections to one detected card, before anything is saved. */
export type ItemPatch = {
  id: string
  fields?: Partial<ContactCandidate>
  selected?: boolean
  /**
   * The owner overriding a match: keep this card as its own person.
   *
   * Only ever narrows what the server found — there is no way to assert a link
   * that detection did not establish, because `link_contact_id` is not patchable
   * and a link with no id does nothing.
   */
  linkToExisting?: boolean
}

export async function applyItemPatches(
  supabase: SupabaseClient,
  ownerId: string,
  batchId: string,
  patches: ItemPatch[]
): Promise<void> {
  for (const patch of patches) {
    const update: Row = { updated_at: new Date().toISOString() }

    if (patch.fields) {
      /*
        The same sanitizer the single-card save runs, so a corrected email is
        held to the identical standard whichever screen typed it.
      */
      const clean = sanitizeCardExtract({
        name: [patch.fields.first_name, patch.fields.last_name].filter(Boolean).join(' ') || null,
        company: patch.fields.company ?? null,
        role: patch.fields.role ?? null,
        email: patch.fields.email ?? null,
        phone: patch.fields.phone ?? null,
        website: patch.fields.website ?? null,
        linkedin_url: patch.fields.linkedin_url ?? null,
      } as CardExtract)

      const derived = splitName(clean.name)
      update.first_name = (patch.fields.first_name ?? derived.first_name) || null
      update.last_name = (patch.fields.last_name ?? derived.last_name) || null
      update.company = clean.company
      update.role = clean.role
      update.email = clean.email
      update.phone = clean.phone
      update.website = clean.website
      update.linkedin_url = clean.linkedin_url
    }

    if (typeof patch.selected === 'boolean') update.selected = patch.selected
    if (typeof patch.linkToExisting === 'boolean') update.link_to_existing = patch.linkToExisting

    await supabase
      .from('scan_batch_items')
      .update(update)
      .eq('id', patch.id)
      .eq('batch_id', batchId)
      .eq('user_id', ownerId)
  }
}

export async function saveSharedContext(
  supabase: SupabaseClient,
  ownerId: string,
  batchId: string,
  context: BatchSharedContext
): Promise<void> {
  await supabase
    .from('scan_batches')
    .update({
      shared_event: context.event.trim() || null,
      shared_event_normalized: sanitizeEventName(context.event) || null,
      shared_location: context.location.trim() || null,
      shared_discussed: context.discussed.trim() || null,
      shared_next_action: context.nextAction.trim() || null,
      shared_follow_up_at: context.followUpAt,
      shared_met_at: context.metAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', batchId)
    .eq('user_id', ownerId)
}

export type SavedBatchContact = {
  itemId: string
  contactId: string
  encounterId: string | null
  name: string
  /** True when this card added a meeting to somebody the owner already had. */
  linked: boolean
}

export type SaveBatchResult = {
  batch: ScanBatch
  created: SavedBatchContact[]
  failed: { itemId: string; name: string; reason: string }[]
  /** Cards that became new people. */
  newContacts: number
  /** Cards that became a further meeting with a person already on file. */
  linkedContacts: number
  /**
   * Credits this attempt actually spent — one per accepted card, of either
   * kind. The number the caller charges, and never larger than what it was
   * given room for.
   */
  creditsConsumed: number
  /** Set when the owner's remaining credits, not their selection, ended it. */
  stoppedForCredits: boolean
}

/**
 * Turn the selected cards into meetings — with new people, or with people the
 * owner already has.
 *
 * The distinction is the product's central rule. A contact is a person and an
 * encounter is a time you met them, so a card matching somebody already on file
 * adds an encounter to them; it does not manufacture a second copy of a person
 * because they came to two fairs.
 *
 * Per item rather than as one bulk insert, deliberately. A bulk insert that
 * fails leaves the owner with nothing and no way to tell which card was the
 * problem; ten separate writes leave nine saved and one honest failure they can
 * fix. `created_contact_id` makes the whole thing re-runnable: an item that
 * already resolved to a contact is skipped, so pressing Save again after a
 * partial failure finishes the job rather than duplicating what worked — and,
 * because credits are charged from what this attempt created, never charges
 * twice for the same card.
 *
 * `creditsAvailable` caps how many *cards* may be accepted, of either kind. A
 * Smart Scan credit pays for reading a physical card — the vision call, the
 * parse, the normalization — and that work costs the same whether the person
 * turns out to be new or somebody met before. The unit is the card.
 */
export async function saveBatchContacts(
  supabase: SupabaseClient,
  ownerId: string,
  batchId: string,
  creditsAvailable: number = Infinity
): Promise<SaveBatchResult | null> {
  const batch = await loadBatch(supabase, ownerId, batchId)
  if (!batch) return null

  const context = batch.sharedContext
  const eventText = encounterEventText(context)
  const metAt = context.metAt || new Date().toISOString()

  const created: SavedBatchContact[] = []
  const failed: SaveBatchResult['failed'] = []
  let newContacts = 0
  let linkedContacts = 0
  let creditsConsumed = 0
  let stoppedForCredits = false

  for (const item of batch.items) {
    /*
      An item that already resolved to a contact is finished, and finished
      items are never revisited — which is exactly why a retry cannot charge
      twice: the same skip that prevents a duplicate contact prevents a
      duplicate charge.
    */
    if (!item.selected || item.createdContactId) continue

    const firstName = item.fields.first_name.trim()
    const lastName = item.fields.last_name.trim()
    const fullName = [firstName, lastName].filter(Boolean).join(' ')
    const label = fullName || item.fields.company.trim() || 'Unnamed card'

    if (!fullName && !item.fields.company.trim() && !item.fields.email.trim()) {
      failed.push({
        itemId: item.id,
        name: label,
        reason: 'Needs a name, company or email.',
      })
      continue
    }

    /*
      Two separate facts, each with its own guard.

      Whether the work is redone is answered by `createdContactId` above.
      Whether the card has been *paid for* is answered here, by a flag of its
      own — so a card can never be charged twice even if the saving rules
      change later. Today the two are written together and cannot diverge; the
      guarantee should not depend on that staying true.
    */
    const alreadyPaid = item.creditConsumed

    /*
      The card is about to be processed into its saved state, so it needs a
      credit — before either branch, because both branches accept a physical
      card and both cost the same to have read. Checking here rather than in
      each branch is what stops the two from drifting apart.

      Stopping leaves the remaining cards untouched and re-savable once the
      owner has more; nothing is discarded.
    */
    if (!alreadyPaid && creditsConsumed >= creditsAvailable) {
      stoppedForCredits = true
      failed.push({
        itemId: item.id,
        name: label,
        reason: 'No Smart Scan credits left for this card.',
      })
      continue
    }

    /*
      Somebody already on file: a further meeting with them, not a second them.

      The id was established by the server at detection and re-verified here
      against this owner's contacts, so a tampered batch cannot attach a meeting
      to a stranger's record. Still costs a credit: reading the card is the work
      being paid for, and the person already existing does not make that free.
    */
    if (item.linkContactId && item.linkToExisting) {
      const { data: existing } = await supabase
        .from('scanned_contacts')
        .select('id, name')
        .eq('id', item.linkContactId)
        .eq('user_id', ownerId)
        .maybeSingle()

      if (!existing) {
        failed.push({
          itemId: item.id,
          name: label,
          reason: 'The matching contact could not be found.',
        })
        continue
      }

      const linkedEncounter = await createEncounter(supabase, {
        contactId: item.linkContactId,
        userId: ownerId,
        meeting: {
          event: eventText,
          eventNormalized: sanitizeEventName(context.event) || null,
          discussed: context.discussed.trim() || null,
          nextAction: context.nextAction.trim() || null,
          followUpAt: context.followUpAt,
          metAt,
        },
        capture: { captureOrigin: 'camera', captureKind: 'business_card' },
      })

      if (!linkedEncounter) {
        failed.push({
          itemId: item.id,
          name: label,
          reason: 'Could not add this meeting to the existing contact.',
        })
        continue
      }

      /*
        The contact link and the charge are recorded in one write. Two writes
        would leave a window where the card is saved but unpaid, and a crash in
        that window would give it away for free on the retry.
      */
      await supabase
        .from('scan_batch_items')
        .update({
          created_contact_id: item.linkContactId,
          created_encounter_id: linkedEncounter.id,
          credit_consumed: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)
        .eq('user_id', ownerId)

      linkedContacts += 1
      if (!alreadyPaid) creditsConsumed += 1
      created.push({
        itemId: item.id,
        contactId: item.linkContactId,
        encounterId: linkedEncounter.id,
        name: str(existing.name) || label,
        linked: true,
      })
      continue
    }

    const { data: contact, error } = await supabase
      .from('scanned_contacts')
      .insert({
        user_id: ownerId,
        name: fullName || item.fields.company.trim(),
        first_name: firstName || null,
        last_name: lastName || null,
        company: item.fields.company.trim() || null,
        role: item.fields.role.trim() || null,
        email: item.fields.email.trim() || null,
        phone: item.fields.phone.trim() || null,
        website: item.fields.website.trim() || null,
        linkedin_url: item.fields.linkedin_url.trim() || null,
        status: 'pending',
        scan_status: 'basic',
        source: 'business_card',
        capture_origin: 'camera',
        capture_kind: 'business_card',
        enrichment_status: 'DONE',
        enrichment_step: 'none',
        lead_source: 'ABC AI Business Card',
        scanned_at: new Date().toISOString(),
        scan_batch_id: batchId,
        scan_batch_item_id: item.id,
      })
      .select('*')
      .single()

    if (error || !contact) {
      console.error('[scan/batch] contact insert failed:', error)
      failed.push({ itemId: item.id, name: label, reason: 'Could not save this contact.' })
      continue
    }

    /*
      The meeting, copied from the batch onto this contact. Written even when
      the owner typed nothing: meeting someone and writing nothing down is
      still meeting them, which is exactly what the single-card save already
      does. What makes it a batch is that all ten carry the same one.
    */
    const encounter = await createEncounter(supabase, {
      contactId: contact.id as string,
      userId: ownerId,
      meeting: {
        event: eventText,
        eventNormalized: sanitizeEventName(context.event) || null,
        discussed: context.discussed.trim() || null,
        nextAction: context.nextAction.trim() || null,
        followUpAt: context.followUpAt,
        metAt,
      },
      capture: { captureOrigin: 'camera', captureKind: 'business_card' },
    })

    // Contact link and charge in one write, for the same reason as above.
    await supabase
      .from('scan_batch_items')
      .update({
        created_contact_id: contact.id,
        created_encounter_id: encounter?.id ?? null,
        credit_consumed: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)
      .eq('user_id', ownerId)

    // Same CRM defaults and activity a single scan gets, at the same moment:
    // when the contact starts existing.
    onCardScanned(contact.id as string, ownerId, { enrichmentPending: false }).catch(
      console.error
    )

    newContacts += 1
    if (!alreadyPaid) creditsConsumed += 1
    created.push({
      itemId: item.id,
      contactId: contact.id as string,
      encounterId: encounter?.id ?? null,
      name: label,
      linked: false,
    })
  }

  const totalSaved = batch.items.filter((i) => i.createdContactId).length + created.length

  await supabase
    .from('scan_batches')
    .update({
      // Only once something exists. A batch that saved nothing stays a draft,
      // because "saved" is a claim about contacts and there are none.
      status: totalSaved > 0 ? 'saved' : 'draft',
      total_saved: totalSaved,
      saved_at: totalSaved > 0 ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', batchId)
    .eq('user_id', ownerId)

  const refreshed = await loadBatch(supabase, ownerId, batchId)
  return {
    batch: refreshed || batch,
    created,
    failed,
    newContacts,
    linkedContacts,
    creditsConsumed,
    stoppedForCredits,
  }
}

/**
 * Every meeting this batch produced, with the person it belongs to.
 *
 * Sourced from the batch's own items rather than from contacts tagged with the
 * batch id, and the difference matters: a card that matched somebody already on
 * file adds a meeting to a contact created long before this batch, so that
 * contact carries a different `scan_batch_id` — or none. Reading the items
 * catches both the people this batch created and the people it met again.
 *
 * The encounter is the one this batch wrote, not the newest one. "Newest" stops
 * being the right answer the moment the owner meets that person again: pushing
 * this batch afterwards would send a meeting that has nothing to do with it.
 */
export async function batchExportTargets(
  supabase: SupabaseClient,
  ownerId: string,
  batchId: string
): Promise<{ contactId: string; encounterId: string; name: string }[]> {
  const { data: itemRows } = await supabase
    .from('scan_batch_items')
    .select('created_contact_id, created_encounter_id, position')
    .eq('batch_id', batchId)
    .eq('user_id', ownerId)
    .order('position', { ascending: true })

  const rows = ((itemRows || []) as Row[]).filter(
    // A card whose encounter write failed has nothing to export yet. Skipped
    // rather than exported without its meeting, which would push a person into
    // the CRM stripped of the reason they are there.
    (row) => nullableStr(row.created_contact_id) && nullableStr(row.created_encounter_id)
  )

  if (rows.length === 0) return []

  const contactIds = Array.from(
    new Set(rows.map((row) => String(row.created_contact_id)))
  )

  const { data: contacts } = await supabase
    .from('scanned_contacts')
    .select('id, name')
    .eq('user_id', ownerId)
    .in('id', contactIds)

  const names = new Map<string, string>()
  for (const contact of (contacts || []) as Row[]) {
    names.set(String(contact.id), str(contact.name) || 'Contact')
  }

  /*
    One entry per contact. A batch that met the same person on two cards — the
    same switchboard number read twice — must not push them to the CRM twice.
  */
  const seen = new Set<string>()
  const targets: { contactId: string; encounterId: string; name: string }[] = []

  for (const row of rows) {
    const contactId = String(row.created_contact_id)
    if (seen.has(contactId)) continue
    // A contact that has since been deleted is no longer exportable.
    if (!names.has(contactId)) continue

    seen.add(contactId)
    targets.push({
      contactId,
      encounterId: String(row.created_encounter_id),
      name: names.get(contactId) as string,
    })
  }

  return targets
}
