/**
 * Turning what a listing says into something comparable.
 *
 * Every function here is pure and total: same input, same output, no I/O, no
 * clock. That matters twice over — matching has to be reproducible, and the
 * identity of a company has to be decided the same way on every import, or
 * re-running one creates duplicates.
 */

/**
 * Legal-form suffixes, dropped before comparing names.
 *
 * "Helios Motion Systems GmbH" and "Helios Motion Systems" are the same
 * exhibitor written twice. The list is deliberately short and only holds forms
 * that are unambiguously legal suffixes — anything that could be a real word in
 * a company's actual name stays in.
 */
const LEGAL_FORMS = new Set([
  'ag', 'gmbh', 'mbh', 'kg', 'gmbhcokg', 'ohg', 'ug', 'se',
  'ltd', 'limited', 'plc', 'llp', 'llc', 'inc', 'incorporated', 'corp', 'corporation', 'co',
  'bv', 'nv', 'sa', 'sas', 'sarl', 'srl', 'spa', 'ab', 'as', 'oy', 'aps',
  'sp', 'zoo', 'sro', 'as', 'kft', 'doo', 'dd',
])

/**
 * A company name reduced to what identifies it.
 *
 * Accents folded, case dropped, punctuation removed, legal form removed. Never
 * used to *merge* two companies on its own — see `resolve.ts`, where a name
 * agreement without a domain or a country behind it produces a flagged
 * candidate rather than a merge.
 */
export function normalizeCompanyName(raw: string): string {
  const base = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Periods go before the general fold, so a dotted abbreviation survives as
    // one word: "S.A." becomes "sa", which the suffix list below recognises.
    // Folding punctuation first would scatter it into "s a" and hide it.
    .replace(/\./g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

  if (!base) return ''

  const words = base.split(' ').filter(Boolean)
  // Strip trailing legal forms only. "Corporation Ltd" loses "ltd"; a company
  // genuinely called "Corp Technologies" keeps every word, because the suffix
  // is not at the end.
  while (words.length > 1 && LEGAL_FORMS.has(words[words.length - 1])) words.pop()

  return words.join(' ')
}

/**
 * The registrable host of a website, or null.
 *
 * `www.` is dropped and the case is folded, because those never distinguish two
 * companies. Nothing else is: a subdomain that is not `www` may well be a
 * different organisation, and paths and query strings are not identity at all.
 *
 * Returns null rather than guessing whenever the input is not a usable host —
 * an empty domain is an honest "we do not know", and the partial unique index
 * in the migration is built so that many of them cannot collide.
 */
export function normalizeDomain(raw: string | null | undefined): string | null {
  const text = (raw || '').trim()
  if (!text) return null

  let host = text
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`).hostname
  } catch {
    return null
  }

  host = host.toLowerCase().replace(/^www\./, '').replace(/\.+$/, '')
  // A host with no dot is a hostname on someone's LAN, not a company's website.
  if (!host || !host.includes('.')) return null
  if (!/^[a-z0-9.-]+$/.test(host)) return null
  return host
}

/**
 * Words stripped before comparing capabilities, so that two listings do not
 * appear to line up because they both said "and" or "solutions".
 *
 * `solutions`, `systems`, `technologies`, `services` are in here for a reason
 * that shows up immediately in real exhibitor data: almost every company uses
 * at least one of them, so leaving them in makes everything match everything.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with', 'by',
  'we', 'our', 'us', 'is', 'are', 'be', 'from', 'at', 'as', 'that', 'this',
  'solutions', 'solution', 'systems', 'system', 'technologies', 'technology',
  'services', 'service', 'products', 'product', 'company', 'group', 'international',
  'gmbh', 'ltd', 'inc', 'ag', 'bv', 'sa',
])

/**
 * Light singularisation, so "bearings" and "bearing" are one term.
 *
 * Rules rather than a dictionary, and only the ones that are safe on technical
 * nouns: "-ies" to "-y", "-sses" to "-ss", and a trailing "s" on a word long
 * enough that dropping it cannot produce nonsense. Words ending "ss" are left
 * alone, so "stainless" survives.
 */
function singular(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (word.length > 4 && word.endsWith('sses')) return word.slice(0, -2)
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) {
    return word.slice(0, -1)
  }
  return word
}

/** The comparable words of a phrase: folded, split, de-stopped, singularised. */
export function terms(raw: string | null | undefined): string[] {
  const text = (raw || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

  if (!text) return []

  const out: string[] = []
  const seen = new Set<string>()
  for (const word of text.split(' ')) {
    if (word.length < 2) continue
    if (STOP_WORDS.has(word)) continue
    const term = singular(word)
    if (STOP_WORDS.has(term)) continue
    if (seen.has(term)) continue
    seen.add(term)
    out.push(term)
  }
  return out
}

/** The comparable words of a list of phrases, de-duplicated across all of them. */
export function termsOfAll(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    for (const term of terms(value)) {
      if (seen.has(term)) continue
      seen.add(term)
      out.push(term)
    }
  }
  return out
}

/**
 * A stable hash of a provider payload, used to tell a changed listing from one
 * that merely arrived again.
 *
 * FNV-1a over the JSON: short, dependency-free, and deterministic across runs
 * and platforms. It is a change detector, never a security primitive — nothing
 * is authenticated with it, so collision resistance is not the property being
 * relied on.
 */
export function contentHash(value: unknown): string {
  const json = stableStringify(value)
  let hash = 0x811c9dc5
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** JSON with object keys in a fixed order, so equal payloads hash equal. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}

/**
 * Text as a listing gave it, or null.
 *
 * Empty strings, whitespace and the literal words some directories use for a
 * blank cell all become null. A missing hall has to be *missing*, so that the
 * screen can say so instead of printing "n/a" as though it were a location.
 */
const NULLISH = new Set(['', '-', '--', 'n/a', 'na', 'none', 'null', 'undefined', 'tbd', 'tba'])

export function sourceText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim().replace(/\s+/g, ' ')
  if (NULLISH.has(text.toLowerCase())) return null
  return text || null
}

/** A list of source strings, cleaned and de-duplicated, order preserved. */
export function sourceList(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    const single = sourceText(raw)
    return single ? [single] : []
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    const text = sourceText(entry)
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }
  return out
}
