import { termsOfAll } from '@/lib/event-intelligence/normalize'
import { materialVisible, type EventMaterial, type EventPhase, type EventProduct } from '@/lib/event-intelligence/profile'
import type { MatchEvidence } from '@/lib/event-intelligence/types'

/**
 * Which of the owner's own products — and which piece of their material — is
 * worth showing a target, and why.
 *
 * A suggestion, never a selection. It fills nothing in and sends nothing: the
 * Expo Mission shows it as "ABC suggests showing …", labelled as ABC's, next
 * to whatever the owner chose themselves, and the owner's choice always wins.
 *
 * Deterministic and explainable: the product whose own words (name,
 * description, tags) share the most terms with what the target's listing
 * says, with those shared terms returned as the reason. No overlap, no
 * suggestion — "show them your brochure" with nothing behind it is not advice.
 */

export type ShowSuggestion = {
  productId: string
  productName: string
  materialId: string | null
  materialTitle: string | null
  /** The terms the product and the listing share: the reason, in the listing's words. */
  sharedTerms: string[]
}

export function suggestWhatToShow(
  evidence: MatchEvidence[],
  products: EventProduct[],
  materials: EventMaterial[] = [],
  now: Date = new Date(),
  eventPhase: Exclude<EventPhase, 'any'> | null = null
): ShowSuggestion | null {
  const listing = new Set(termsOfAll(evidence.map((e) => e.value)))
  if (listing.size === 0 || products.length === 0) return null

  let best: { product: EventProduct; shared: string[] } | null = null
  for (const product of [...products].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))) {
    const own = termsOfAll([product.name, product.description, ...product.productTags, ...product.industryTags, ...product.useCaseTags])
    const shared = own.filter((term) => listing.has(term)).sort()
    if (shared.length === 0) continue
    if (!best || shared.length > best.shared.length) best = { product, shared }
  }
  if (!best) return null

  // Material made for that product, showable now, in the owner's own priority order.
  const material =
    materials
      .filter((m) => m.productId === best.product.id && materialVisible(m, now, eventPhase))
      .sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title))[0] ?? null

  return {
    productId: best.product.id,
    productName: best.product.name,
    materialId: material?.id ?? null,
    materialTitle: material?.title ?? null,
    sharedTerms: best.shared.slice(0, 3),
  }
}
