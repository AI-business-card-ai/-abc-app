import type { MatchRow } from '@/lib/event-intelligence/view'
import type { MatchType } from '@/lib/event-intelligence/types'

/**
 * Finding one company in a fair that has three thousand of them.
 *
 * A flat ranked list is the right answer for twenty matches and the wrong one
 * for eight hundred: the twentieth-best customer is on screen four, and the
 * person looking for "that bearings company in hall 3" has no way to say so.
 * This is the search, the filters and the sorts — pure, so the behaviour can be
 * argued with in a test rather than clicked at.
 *
 * Every dimension here is something the data actually holds. There is no
 * "trending", no "recommended for you" and no second opinion about relevance:
 * the only score is the deterministic one the engine produced, with its reasons
 * still attached.
 */

export type MatchSort = 'relevance' | 'name' | 'hall'

export const SORT_LABEL: Record<MatchSort, string> = {
  relevance: 'Most relevant',
  name: 'Company name',
  hall: 'Hall and stand',
}

export type MatchQuery = {
  /** Free text over company name, categories and products. */
  search: string
  type: 'all' | MatchType
  /** A hall from the listing, or null for any. */
  hall: string | null
  savedOnly: boolean
  /** Hide the ones whose listing gives no stand — they cost time to find. */
  withStandOnly: boolean
  sort: MatchSort
}

export const EMPTY_MATCH_QUERY: MatchQuery = {
  search: '',
  type: 'all',
  hall: null,
  savedOnly: false,
  withStandOnly: false,
  sort: 'relevance',
}

export function isDefaultQuery(query: MatchQuery): boolean {
  return (
    query.search.trim() === '' &&
    query.type === 'all' &&
    query.hall === null &&
    !query.savedOnly &&
    !query.withStandOnly
  )
}

/**
 * Halls sort as numbers, so 2 comes before 10.
 *
 * A plain string sort puts Hall 10 before Hall 2, which reads as a mistake to
 * somebody standing in front of Hall 2. Named halls ("West") come after
 * numbered ones, and "no hall given" comes last — it is not a place.
 */
export function hallOrder(hall: string | null): [number, string] {
  if (!hall) return [Number.MAX_SAFE_INTEGER, '']
  const trimmed = hall.trim()
  const numeric = /^\d+$/.test(trimmed) ? Number(trimmed) : null
  return numeric === null ? [Number.MAX_SAFE_INTEGER - 1, trimmed.toLowerCase()] : [numeric, '']
}

/** Every hall this fair actually lists, in the order a plan would walk them. */
export function hallOptions(rows: MatchRow[]): string[] {
  const halls = [...new Set(rows.map((row) => row.hall).filter((hall): hall is string => Boolean(hall)))]
  return halls.sort((a, b) => {
    const [aNum, aText] = hallOrder(a)
    const [bNum, bText] = hallOrder(b)
    return aNum - bNum || aText.localeCompare(bText)
  })
}

/**
 * Search terms, all of which must appear somewhere in the row.
 *
 * Every word rather than the whole phrase, so "bearing hall" finds a bearings
 * company without the person having to guess ABC's field order. Matching is on
 * the row's precomputed `searchText`, which is name + categories + products
 * folded once at build time.
 */
function matchesSearch(row: MatchRow, search: string): boolean {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  return terms.every((term) => row.searchText.includes(term))
}

export function matchesQuery(row: MatchRow, query: MatchQuery): boolean {
  if (query.type !== 'all' && row.matchType !== query.type) return false
  if (query.savedOnly && !row.saved) return false
  if (query.withStandOnly && !row.stand) return false
  if (query.hall !== null && row.hall !== query.hall) return false
  return matchesSearch(row, query.search)
}

const byName = (a: MatchRow, b: MatchRow) => a.companyName.localeCompare(b.companyName)

/**
 * Sorting, always total.
 *
 * Every comparator ends in the company name, so two rows never tie and the list
 * cannot reorder itself between renders — a list that quietly reshuffles while
 * somebody is reading it is worse than one sorted the way they did not expect.
 */
export function sortMatches(rows: MatchRow[], sort: MatchSort): MatchRow[] {
  const sorted = [...rows]
  switch (sort) {
    case 'name':
      return sorted.sort(byName)
    case 'hall':
      return sorted.sort((a, b) => {
        const [aNum, aText] = hallOrder(a.hall)
        const [bNum, bText] = hallOrder(b.hall)
        if (aNum !== bNum) return aNum - bNum
        if (aText !== bText) return aText.localeCompare(bText)
        // Within a hall, by stand, so a walk down one aisle reads in order.
        const stand = (a.stand ?? '').localeCompare(b.stand ?? '', undefined, { numeric: true })
        return stand !== 0 ? stand : byName(a, b)
      })
    case 'relevance':
    default:
      return sorted.sort((a, b) => b.score - a.score || byName(a, b))
  }
}

export function applyMatchQuery(rows: MatchRow[], query: MatchQuery): MatchRow[] {
  return sortMatches(
    rows.filter((row) => matchesQuery(row, query)),
    query.sort
  )
}

/**
 * How many rows each type would show, given everything *except* the type.
 *
 * Counting with the type filter applied would make every chip but the active
 * one read zero, which tells the reader nothing about where else to look.
 */
export function typeCounts(rows: MatchRow[], query: MatchQuery): Record<'all' | MatchType, number> {
  const scoped = rows.filter((row) => matchesQuery(row, { ...query, type: 'all' }))
  return {
    all: scoped.length,
    customer: scoped.filter((row) => row.matchType === 'customer').length,
    supplier: scoped.filter((row) => row.matchType === 'supplier').length,
    partner: scoped.filter((row) => row.matchType === 'partner').length,
  }
}

/**
 * The most matches a page hands the browser.
 *
 * A row is small, but three thousand of them is close to a megabyte of JSON on
 * a phone before anything is rendered. The list is ordered by relevance before
 * this applies, so the cap keeps the strongest ones and the screen says plainly
 * how many it is showing out of how many exist — rather than implying the fair
 * has 500 matches when it has 3,000.
 */
export const MATCH_PAYLOAD_LIMIT = 500

/** How many are rendered at once, before "Show more". */
export const MATCH_PAGE_SIZE = 50
