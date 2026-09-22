import type { CompanyUpsert, PresenceUpsert } from '@/lib/event-intelligence/ingest'

/**
 * What changed in a listing between two reads of the same source.
 *
 * Not a second refresh system. Ingestion already decides *whether* a listing
 * changed — the content hash — and already withdraws what a newer fetch no
 * longer mentions. This only answers *what* changed, from the snapshot each
 * source record now keeps of what the source said last time, so a refresh can
 * report "the stand moved" rather than "something is different".
 *
 * Pure: two snapshots in, a list of field names out.
 */

/**
 * A listing as one source stated it, in ABC's normalised vocabulary.
 *
 * Exactly the object ingestion hashes, so `contentHash(snapshot)` is the
 * `content_hash` stored beside it. Only fields of the provider contract: the
 * contract has no field for personal data, and no raw or "extra" bag exists.
 */
export type ListingSnapshot = {
  company: Omit<CompanyUpsert, 'mergeCandidateOf'>
  presence: Omit<PresenceUpsert, 'eventId' | 'companyId' | 'lastSeenAt'>
}

export type ChangedField =
  | 'name'
  | 'website'
  | 'country'
  | 'company_description'
  | 'company_categories'
  | 'hall'
  | 'stand'
  | 'event_categories'
  | 'event_description'
  | 'products'
  | 'listing_url'

export const CHANGED_FIELDS: ChangedField[] = [
  'name',
  'website',
  'country',
  'company_description',
  'company_categories',
  'hall',
  'stand',
  'event_categories',
  'event_description',
  'products',
  'listing_url',
]

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index])

/** Which fields differ. An empty list means the two say the same thing. */
export function snapshotDiff(before: ListingSnapshot, after: ListingSnapshot): ChangedField[] {
  const changed: ChangedField[] = []
  const c0 = before.company
  const c1 = after.company
  const p0 = before.presence
  const p1 = after.presence

  if (c0.displayName !== c1.displayName || p0.exhibitorDisplayName !== p1.exhibitorDisplayName) changed.push('name')
  if (c0.websiteDomain !== c1.websiteDomain) changed.push('website')
  if (c0.country !== c1.country) changed.push('country')
  if (c0.descriptionPublic !== c1.descriptionPublic) changed.push('company_description')
  if (!sameList(c0.categories, c1.categories)) changed.push('company_categories')
  if (p0.hall !== p1.hall) changed.push('hall')
  if (p0.stand !== p1.stand) changed.push('stand')
  if (!sameList(p0.eventCategories, p1.eventCategories)) changed.push('event_categories')
  if (p0.eventDescription !== p1.eventDescription) changed.push('event_description')
  if (!sameList(p0.productsServices, p1.productsServices)) changed.push('products')
  if (p0.listingUrl !== p1.listingUrl) changed.push('listing_url')

  return changed
}

/** How one listing relates to what ABC held before this read. */
export type ListingChangeKind =
  /** No presence for this company at this edition until now. */
  | 'new'
  /** Same content hash as last time. */
  | 'unchanged'
  /** Content differs; `fields` says where, when the last snapshot is known. */
  | 'changed'
  /** The presence had been withdrawn and the source lists it again. */
  | 'reappeared'

export type ListingChange = {
  providerRecordId: string
  kind: ListingChangeKind
  fields: ChangedField[]
}

/** How many samples a summary keeps. Enough to read, bounded at any size. */
export const CHANGE_SAMPLE_LIMIT = 25

export type ChangeSummary = {
  new: number
  unchanged: number
  changed: number
  reappeared: number
  /** Listed before this read and absent from it. Set by the commit, or projected before it. */
  withdrawn: number
  /**
   * Changed listings whose previous snapshot is unknown — imported before
   * snapshots existed. Counted apart so "changed" never claims a field it
   * cannot name.
   */
  changedWithoutSnapshot: number
  byField: Record<ChangedField, number>
  samples: ListingChange[]
}

export function emptyChangeSummary(): ChangeSummary {
  return {
    new: 0,
    unchanged: 0,
    changed: 0,
    reappeared: 0,
    withdrawn: 0,
    changedWithoutSnapshot: 0,
    byField: Object.fromEntries(CHANGED_FIELDS.map((field) => [field, 0])) as Record<ChangedField, number>,
    samples: [],
  }
}

/** Fold one listing's change into a summary, in place. */
export function recordChange(summary: ChangeSummary, change: ListingChange, snapshotKnown = true): void {
  summary[change.kind]++
  if (change.kind === 'changed' && !snapshotKnown) summary.changedWithoutSnapshot++
  for (const field of change.fields) summary.byField[field]++
  if (change.kind !== 'unchanged' && summary.samples.length < CHANGE_SAMPLE_LIMIT) summary.samples.push(change)
}
