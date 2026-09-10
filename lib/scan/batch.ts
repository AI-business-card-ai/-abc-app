import type { ContactCandidate } from '@/lib/scan/candidate'

/**
 * Multi-card scanning: the shapes shared by the client and the server.
 *
 * The idea this feature rests on is that ten cards at one stand are ten people
 * and one meeting. So there is no second notion of "context" here — the batch
 * holds the meeting once, and every contact it creates gets an ordinary
 * `contact_encounters` row carrying it. That is why the fields below are the
 * same fields the single-scan meeting form already collects: anything else
 * would be a parallel vocabulary that the contact screen, follow-ups and CRM
 * export would each have to learn.
 */

/**
 * Ten, and the number is a product decision rather than a technical ceiling.
 *
 * It is roughly what fits legibly in one photograph at arm's length, and it is
 * small enough that reviewing the batch stays a quick pass rather than a data
 * entry session. The vision prompt, the API and the UI all read this constant,
 * so raising it is one edit.
 */
export const MAX_BATCH_CARDS = 10

export type BatchStatus = 'draft' | 'saved'
export type BatchSourceKind = 'single_photo' | 'guided' | 'mixed'

/** Why an item might deserve a second look. Never a reason to refuse it. */
export type BatchItemWarning =
  | 'low_confidence'
  | 'no_name'
  | 'no_contact_method'
  | 'possible_duplicate'

/**
 * The meeting every contact in the batch shares.
 *
 * `metAt` is when the meeting happened, not when the row was written — the same
 * distinction `contact_encounters` draws. Everything is optional: a batch saved
 * with no context at all is still a batch, and it produces exactly the empty
 * encounter a single scan with no notes already writes.
 */
export type BatchSharedContext = {
  event: string
  location: string
  discussed: string
  nextAction: string
  followUpAt: string | null
  metAt: string | null
}

export function emptySharedContext(): BatchSharedContext {
  return { event: '', location: '', discussed: '', nextAction: '', followUpAt: null, metAt: null }
}

export function sharedContextHasContent(context: BatchSharedContext): boolean {
  return Boolean(
    context.event.trim() ||
      context.location.trim() ||
      context.discussed.trim() ||
      context.nextAction.trim() ||
      context.followUpAt
  )
}

/**
 * One detected card, as the review screen holds it.
 *
 * `fields` is the ordinary `ContactCandidate` every other capture source
 * produces, so the review inputs, the validation and the save payload are the
 * same ones single-card scanning already uses.
 */
export type BatchItem = {
  id: string
  position: number
  fields: ContactCandidate
  confidence: number | null
  warnings: BatchItemWarning[]
  selected: boolean
  createdContactId: string | null
  /**
   * The person the owner already has, when this card matched one.
   *
   * A contact is a person; an encounter is a time you met them. Meeting
   * somebody again is a second encounter, not a second copy of them — so a
   * matched card adds to the person it matched.
   */
  linkContactId: string | null
  /** That person's name, for a review row that has to be readable at a stand. */
  linkContactName: string | null
  /** The owner's decision. Defaults to the canonical rule; overridable per card. */
  linkToExisting: boolean
  /**
   * Whether this card has already cost a Smart Scan credit.
   *
   * The credit buys the processing of one physical card, so it is spent once
   * per accepted card — whether that card produced a new person or another
   * meeting with one already on file.
   */
  creditConsumed: boolean
}

/** Whether saving this card will add to somebody rather than create them. */
export function batchItemLinksToPerson(item: BatchItem): boolean {
  return Boolean(item.linkContactId && item.linkToExisting)
}

export type ScanBatch = {
  id: string
  status: BatchStatus
  sourceKind: BatchSourceKind
  sharedContext: BatchSharedContext
  totalDetected: number
  totalSaved: number
  items: BatchItem[]
  createdAt: string
  savedAt: string | null
}

/**
 * Where the meeting happened, as one line.
 *
 * The batch collects event and location separately because a trade fair and its
 * hall are different facts, but an encounter has a single `event` field and
 * every existing reader expects one string. Joining here means the two screens
 * cannot disagree about how they combine.
 */
export function encounterEventText(context: BatchSharedContext): string | null {
  const parts = [context.event.trim(), context.location.trim()].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** Enough of a person to be worth keeping. Mirrors `candidateHasIdentity`. */
export function batchItemIsSaveable(item: BatchItem): boolean {
  const { first_name, last_name, company, email } = item.fields
  return Boolean(first_name.trim() || last_name.trim() || company.trim() || email.trim())
}

export function selectedItems(batch: ScanBatch): BatchItem[] {
  return batch.items.filter((item) => item.selected && !item.createdContactId)
}

/**
 * Warnings derived from the parsed fields alone.
 *
 * Kept separate from whatever the model reported so the review screen says the
 * same thing about a card the owner has just edited as it does about a fresh
 * one — a warning that survives being fixed is noise.
 */
export function deriveWarnings(
  fields: ContactCandidate,
  confidence: number | null
): BatchItemWarning[] {
  const warnings: BatchItemWarning[] = []

  if (!fields.first_name.trim() && !fields.last_name.trim()) warnings.push('no_name')
  if (!fields.email.trim() && !fields.phone.trim()) warnings.push('no_contact_method')
  if (confidence !== null && confidence < 0.6) warnings.push('low_confidence')

  return warnings
}

/** What the owner should read. One line, plain, never alarming. */
export function warningLabel(warning: BatchItemWarning): string {
  switch (warning) {
    case 'no_name':
      return 'No name read'
    case 'no_contact_method':
      return 'No email or phone'
    case 'low_confidence':
      return 'Hard to read — check the details'
    case 'possible_duplicate':
      return 'You may already have this contact'
  }
}
