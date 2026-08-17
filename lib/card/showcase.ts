/**
 * Showcase — the optional gallery of an owner's own work.
 *
 * Deliberately small: images, an optional caption, an order the owner chooses.
 * No likes, no counts, no feed. The item type is stored but not shown; it
 * exists so a later filter or layout rule has something to read rather than
 * needing a second migration.
 */

/** Product rule. Mirrored by a database trigger, which is what actually binds. */
export const SHOWCASE_MAX_ITEMS = 8

export const SHOWCASE_TITLE_DEFAULT = 'My work'
export const SHOWCASE_TITLE_MAX = 50
export const SHOWCASE_CAPTION_MAX = 100

export const SHOWCASE_TITLE_SUGGESTIONS = [
  'My work',
  'Projects',
  'Portfolio',
  'Products',
  'References',
  'Recent projects',
] as const

export type ShowcaseItemType = 'project' | 'product' | 'reference' | 'event' | 'other'

export const SHOWCASE_ITEM_TYPES: { id: ShowcaseItemType; label: string }[] = [
  { id: 'project', label: 'Project' },
  { id: 'product', label: 'Product' },
  { id: 'reference', label: 'Reference' },
  { id: 'event', label: 'Event' },
  { id: 'other', label: 'Other' },
]

export interface ShowcaseItem {
  id: string
  user_id: string
  image_url: string
  caption: string | null
  item_type: ShowcaseItemType
  sort_order: number
}

function asType(value: unknown): ShowcaseItemType {
  const known = SHOWCASE_ITEM_TYPES.some((t) => t.id === value)
  return known ? (value as ShowcaseItemType) : 'other'
}

/** Tolerates whatever a row actually holds — the column is free text. */
export function normalizeShowcaseRow(row: Record<string, unknown>): ShowcaseItem {
  const caption = typeof row.caption === 'string' ? row.caption.trim() : ''
  return {
    id: String(row.id),
    user_id: String(row.user_id ?? ''),
    image_url: typeof row.image_url === 'string' ? row.image_url : '',
    caption: caption ? caption.slice(0, SHOWCASE_CAPTION_MAX) : null,
    item_type: asType(row.item_type),
    sort_order: typeof row.sort_order === 'number' ? row.sort_order : 0,
  }
}

export function showcaseItemToRow(
  item: ShowcaseItem,
  userId: string,
  sortOrder: number
): Record<string, unknown> {
  return {
    id: item.id,
    user_id: userId,
    image_url: item.image_url,
    caption: item.caption?.trim().slice(0, SHOWCASE_CAPTION_MAX) || null,
    item_type: item.item_type,
    sort_order: sortOrder,
  }
}

/** Empty falls back to the default rather than publishing a headless section. */
export function normalizeShowcaseTitle(value: unknown): string {
  if (typeof value !== 'string') return SHOWCASE_TITLE_DEFAULT
  const trimmed = value.trim().slice(0, SHOWCASE_TITLE_MAX)
  return trimmed || SHOWCASE_TITLE_DEFAULT
}

/**
 * Ordering is deterministic even when two rows share a sort_order — id breaks
 * the tie, so a gallery never quietly reshuffles between two page loads.
 */
export function sortShowcaseItems(items: ShowcaseItem[]): ShowcaseItem[] {
  return items
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
    .slice(0, SHOWCASE_MAX_ITEMS)
}
