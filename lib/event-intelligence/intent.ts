/**
 * Reading what the owner typed.
 *
 * The form asks four questions in plain language and stores structured fields,
 * so this is where one becomes the other. It is pure and has no database in it,
 * which is what lets the rules below be argued with in a test rather than
 * discovered in production.
 *
 * Two principles:
 *
 *   * **Ask little, accept less.** Nothing is mandatory except that the owner
 *     must say *something* to match against, because an empty profile produces
 *     an exhibitor directory and that is the thing this feature replaces.
 *   * **Never silently truncate meaning.** Input that is too long is refused
 *     with a reason, not quietly cut in half and stored as though it were what
 *     somebody wrote.
 */

/** One answer's ceiling. Generous for prose, finite for a database column. */
const MAX_TEXT = 2000
/** One item in a list — "precision CNC aluminium housings" is 33 characters. */
const MAX_ITEM = 120
/** Enough for a real capability list, few enough to stay a list. */
const MAX_ITEMS = 40

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * A list, from however somebody typed it.
 *
 * Commas, semicolons and new lines all separate, because people use all three
 * and correcting them is not the product's job. Bullet characters at the start
 * of a line go too, since pasting from a slide is the normal case.
 */
export function parseList(raw: unknown): string[] {
  if (Array.isArray(raw)) return dedupe(raw.map((v) => (typeof v === 'string' ? v : '')).map(clean))
  if (typeof raw !== 'string') return []
  return dedupe(raw.split(/[\n,;]+/).map(clean))
}

function clean(value: string): string {
  return value.replace(/^\s*[-•*–]\s*/, '').trim().replace(/\s+/g, ' ')
}

function dedupe(values: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

function text(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim().replace(/\r\n/g, '\n')
  return value || null
}

/** What a company says about itself, ready to store. */
export type IntentProfileWrite = {
  companyName: string | null
  whatWeDo: string | null
  whatWeSell: string[]
  whatWeBuy: string[]
  whoWeWantToMeet: string | null
  targetIndustries: string[]
  targetCompanyTypes: string[]
  capabilities: string[]
  technologies: string[]
  materials: string[]
  certifications: string[]
  geographies: string[]
}

const LIST_FIELDS = [
  'whatWeSell',
  'whatWeBuy',
  'targetIndustries',
  'targetCompanyTypes',
  'capabilities',
  'technologies',
  'materials',
  'certifications',
  'geographies',
] as const

export function parseIntentProfile(input: Record<string, unknown>): ParseResult<IntentProfileWrite> {
  const value: IntentProfileWrite = {
    companyName: text(input.companyName),
    whatWeDo: text(input.whatWeDo),
    whatWeSell: parseList(input.whatWeSell),
    whatWeBuy: parseList(input.whatWeBuy),
    whoWeWantToMeet: text(input.whoWeWantToMeet),
    targetIndustries: parseList(input.targetIndustries),
    targetCompanyTypes: parseList(input.targetCompanyTypes),
    capabilities: parseList(input.capabilities),
    technologies: parseList(input.technologies),
    materials: parseList(input.materials),
    certifications: parseList(input.certifications),
    geographies: parseList(input.geographies),
  }

  for (const [field, prose] of [
    ['whatWeDo', value.whatWeDo],
    ['whoWeWantToMeet', value.whoWeWantToMeet],
    ['companyName', value.companyName],
  ] as const) {
    if (prose && prose.length > MAX_TEXT) {
      return { ok: false, error: `${label(field)} is too long. Please keep it under ${MAX_TEXT} characters.` }
    }
  }

  for (const field of LIST_FIELDS) {
    const list = value[field]
    if (list.length > MAX_ITEMS) {
      return { ok: false, error: `${label(field)} has too many entries. Please keep it to ${MAX_ITEMS}.` }
    }
    if (list.some((item) => item.length > MAX_ITEM)) {
      return { ok: false, error: `${label(field)} has an entry over ${MAX_ITEM} characters. Please shorten it.` }
    }
  }

  /*
    The one hard requirement. Matching compares what the owner said against what
    a listing says; with neither a description, nor something they sell, nor
    something they buy, there is nothing on one side of that comparison, and the
    honest output would be the whole exhibitor list in arbitrary order.
  */
  if (!value.whatWeDo && value.whatWeSell.length === 0 && value.whatWeBuy.length === 0) {
    return {
      ok: false,
      error: 'Tell ABC what your company does, sells or needs — matching has nothing to work from otherwise.',
    }
  }

  return { ok: true, value }
}

/** What the owner wants from one particular fair. */
export type EventObjectiveWrite = {
  goals: string | null
  sellFocus: string[]
  buyFocus: string[]
  partnerFocus: string[]
  priorityIndustries: string[]
  priorityGeographies: string[]
  notes: string | null
}

export function parseEventObjective(input: Record<string, unknown>): ParseResult<EventObjectiveWrite> {
  const value: EventObjectiveWrite = {
    goals: text(input.goals),
    sellFocus: parseList(input.sellFocus),
    buyFocus: parseList(input.buyFocus),
    partnerFocus: parseList(input.partnerFocus),
    priorityIndustries: parseList(input.priorityIndustries),
    priorityGeographies: parseList(input.priorityGeographies),
    notes: text(input.notes),
  }

  for (const [field, prose] of [
    ['goals', value.goals],
    ['notes', value.notes],
  ] as const) {
    if (prose && prose.length > MAX_TEXT) {
      return { ok: false, error: `${label(field)} is too long. Please keep it under ${MAX_TEXT} characters.` }
    }
  }

  for (const field of ['sellFocus', 'buyFocus', 'partnerFocus', 'priorityIndustries', 'priorityGeographies'] as const) {
    const list = value[field]
    if (list.length > MAX_ITEMS) {
      return { ok: false, error: `${label(field)} has too many entries. Please keep it to ${MAX_ITEMS}.` }
    }
    if (list.some((item) => item.length > MAX_ITEM)) {
      return { ok: false, error: `${label(field)} has an entry over ${MAX_ITEM} characters. Please shorten it.` }
    }
  }

  /*
    An objective may be empty, and that is a real answer: it means "use our
    general profile for this fair". The profile above already guarantees there
    is something to match on, so nothing is lost by letting somebody skip this
    screen on the way to their results.
  */
  return { ok: true, value }
}

const LABELS: Record<string, string> = {
  companyName: 'Company name',
  whatWeDo: 'What you do',
  whatWeSell: 'What you sell',
  whatWeBuy: 'What you need',
  whoWeWantToMeet: 'Who you want to meet',
  targetIndustries: 'Target industries',
  targetCompanyTypes: 'Target company types',
  capabilities: 'Capabilities',
  technologies: 'Technologies',
  materials: 'Materials',
  certifications: 'Certifications',
  geographies: 'Countries',
  goals: 'Goals',
  notes: 'Notes',
  sellFocus: 'What to sell here',
  buyFocus: 'What to source here',
  partnerFocus: 'Partnerships to explore',
  priorityIndustries: 'Priority industries',
  priorityGeographies: 'Priority countries',
}

function label(field: string): string {
  return LABELS[field] ?? field
}
