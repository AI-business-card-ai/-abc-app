import { sourceList, sourceText } from '@/lib/event-intelligence/normalize'
import type { ProviderExhibitor } from '@/lib/event-intelligence/provider'
import type {
  NormalizationNote,
  NormalizedListing,
} from '@/lib/event-intelligence/sources/adapter'

/**
 * From a source's record to ABC's listing, by configuration.
 *
 * A structured source — an organiser's API, a public JSON endpoint, a finished
 * dataset — differs from the next mostly in what it calls things. A field map
 * says where each of ABC's fields lives in one source's record; everything the
 * map does not name is dropped here, at the boundary, and never reaches core.
 *
 * Deterministic throughout. A URL, a country, a hall and a stand are read, not
 * inferred, and a value the record does not hold stays absent.
 */

/** A dotted path into a record, or several to try in order. */
export type FieldPath = string | readonly string[]

export type ListingFieldMap = {
  id: FieldPath
  companyName: FieldPath
  website?: FieldPath
  country?: FieldPath
  companyDescription?: FieldPath
  companyCategories?: FieldPath
  hall?: FieldPath
  stand?: FieldPath
  /**
   * A combined location such as "Hall 12 / D18", for sources that do not
   * split it. Parsed only when the pattern is unambiguous; otherwise hall and
   * stand stay absent and the listing is noted, never guessed.
   */
  location?: FieldPath
  eventCategories?: FieldPath
  eventDescription?: FieldPath
  productsServices?: FieldPath
  listingUrl?: FieldPath
  sourceUpdatedAt?: FieldPath
}

export function readPath(record: unknown, path: string): unknown {
  let current: unknown = record
  for (const part of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function first(record: unknown, path: FieldPath | undefined): unknown {
  if (!path) return undefined
  for (const candidate of typeof path === 'string' ? [path] : path) {
    const value = readPath(record, candidate)
    if (value === undefined || value === null) continue
    if (typeof value === 'string' && !value.trim()) continue
    if (Array.isArray(value) && value.length === 0) continue
    return value
  }
  return undefined
}

/** Text from a scalar, or from the `name`/`label`/`value` of an object. */
function asText(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string') return sourceText(value)
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const v = value as Record<string, unknown>
    return asText(v.name ?? v.label ?? v.value ?? v.title)
  }
  return null
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return sourceList(value.map(asText))
  const text = asText(value)
  if (!text) return []
  // A delimited cell; commas are left alone, because "Pumps, valves" can be one category.
  return sourceList(text.split(/\s*[;|]\s*/))
}

// ── Contact details ──────────────────────────────────────────────

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
// A number written the way phone numbers are: an international prefix or a
// trunk zero, then seven or more digits with the usual separators. Year ranges
// ("2019-2024"), ISO numbers and stand codes do not start that way.
const PHONE = /(?:\+\d{1,3}|\b0)[\d\s().\/-]{6,}\d/g

/** Sentence ends, not counting the abbreviations a contact line is full of. */
const SENTENCE_BREAK = /(?<=[.!?])(?<!\b(?:Dr|Mr|Mrs|Ms|Prof|Dipl|Ing|Nr|No|St|Co|Inc|Ltd|ca|approx|bzw|z\.B)\.)\s+(?=[A-Z0-9ÄÖÜ"“(])/

function hasContactDetail(sentence: string): boolean {
  if (new RegExp(EMAIL.source, 'i').test(sentence)) return true
  for (const match of sentence.matchAll(new RegExp(PHONE.source, 'g'))) {
    if (match[0].replace(/\D/g, '').length >= 7) return true
  }
  return false
}

/**
 * Free text with every sentence that carries an email address or a phone
 * number removed.
 *
 * The provider contract has no field for a person, and that is not enough on
 * its own: a description reading "Contact Dr. Weber at weber@… or +49 …" would
 * carry one in through the text. Names cannot be detected reliably, so the
 * sentence goes whole — a sentence that gives an address or a number to call
 * is a contact line, and the name in it goes with it. What the company says
 * about itself in its other sentences stays.
 */
export function scrubContactDetails(text: string | null): { text: string | null; removed: boolean } {
  if (!text) return { text, removed: false }
  const sentences = text.split(SENTENCE_BREAK)
  const kept = sentences.filter((sentence) => !hasContactDetail(sentence))
  if (kept.length === sentences.length) return { text, removed: false }
  const scrubbed = kept.join(' ').replace(/\s{2,}/g, ' ').trim()
  return { text: scrubbed || null, removed: true }
}

// ── Location ─────────────────────────────────────────────────────

const LOCATION =
  /^(?:hall|halle|h\.?)\s*([0-9]{1,2}[a-z]?)\s*(?:[/,|\-–]\s*|\s+)(?:stand|booth|st\.?)?\s*([a-z0-9][a-z0-9.\-]*)$/i

/**
 * "Hall 12 / D18" → hall 12, stand D18. Only this unambiguous shape: a hall
 * word, a hall number, a separator, a stand code. Anything else — "12D18",
 * "Outdoor area", "see hall plan" — is not parsed, because splitting a string
 * one way or another is a guess, and a guessed stand sends somebody to the
 * wrong end of a hall.
 */
export function parseHallStand(raw: string | null): { hall: string | null; stand: string | null } | null {
  const text = sourceText(raw)
  if (!text) return { hall: null, stand: null }
  const match = text.match(LOCATION)
  if (!match) return null
  return { hall: match[1].toUpperCase(), stand: match[2].toUpperCase() }
}

// ── The mapping ──────────────────────────────────────────────────

/**
 * One record, as ABC's listing, or the reason it is not one.
 *
 * `baseUrl` resolves relative listing links against the page they were read
 * from. A record with no company name, or nothing stable to know it by next
 * time, is rejected: a row ABC cannot recognise on the next read would become
 * a new company every time.
 */
export function mapListing(record: unknown, map: ListingFieldMap, baseUrl?: string | null): NormalizedListing {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { ok: false, reason: 'malformed' }

  const companyName = asText(first(record, map.companyName))
  if (!companyName) return { ok: false, reason: 'no_company_name' }

  const providerRecordId = asText(first(record, map.id))
  if (!providerRecordId) return { ok: false, reason: 'no_stable_id' }

  const notes: NormalizationNote[] = []

  let hall = asText(first(record, map.hall))
  let stand = asText(first(record, map.stand))
  if (!hall && !stand && map.location) {
    const parsed = parseHallStand(asText(first(record, map.location)))
    if (parsed) {
      hall = parsed.hall
      stand = parsed.stand
    } else {
      notes.push('location_unparsed')
    }
  }

  let listingUrl = asText(first(record, map.listingUrl))
  if (listingUrl && baseUrl) {
    try {
      listingUrl = new URL(listingUrl, baseUrl).toString()
    } catch {
      listingUrl = null
    }
  }
  if (listingUrl && !/^https?:\/\//i.test(listingUrl)) listingUrl = null

  const companyDescription = scrubContactDetails(asText(first(record, map.companyDescription)))
  const eventDescription = scrubContactDetails(asText(first(record, map.eventDescription)))
  if (companyDescription.removed || eventDescription.removed) notes.push('contact_details_removed')

  const exhibitor: ProviderExhibitor = {
    providerRecordId,
    companyName,
    website: asText(first(record, map.website)),
    country: asText(first(record, map.country)),
    companyDescription: companyDescription.text,
    companyCategories: asList(first(record, map.companyCategories)),
    hall,
    stand,
    eventCategories: asList(first(record, map.eventCategories)),
    eventDescription: eventDescription.text,
    productsServices: asList(first(record, map.productsServices)),
    listingUrl,
    sourceUpdatedAt: asText(first(record, map.sourceUpdatedAt)),
  }

  return { ok: true, exhibitor, ...(notes.length > 0 ? { notes } : {}) }
}
