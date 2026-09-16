/**
 * The single source of truth for what the public landing says about money.
 *
 * Commercial values live here rather than inside JSX so that settling a price
 * or a pack size is a data edit, not a redesign. The previous landing scattered
 * figures through the markup and ended up advertising monthly allowances for
 * plans whose limits were lifetime.
 *
 * Two rules this file exists to enforce:
 *
 *  1. `null` means "not approved yet", and the UI must render the absence
 *     rather than invent a number. Nothing here may be filled in with a
 *     plausible guess — scan counts and Pro prices come from unit economics
 *     that have not been calculated.
 *
 *  2. Nothing here is wired to checkout. Stripe is subscription-only today and
 *     there is no credit ledger, so Scan Packs and the Pro access models are
 *     presented as architecture, not as things you can buy this minute. When
 *     billing exists, the CTA treatment changes here and in one component.
 */

/** Prices are locked in euro. The existing subscriptions are priced in USD;
 *  reconciling the two is an open commercial decision, flagged to the owner. */
export const CURRENCY = '€' as const

export type ScanPack = {
  /** Locked. */
  price: number
  /** Not approved — derived from Smart Scan unit economics. Never guess. */
  scans: number | null
}

export const SCAN_PACKS: ScanPack[] = [
  { price: 8, scans: null },
  { price: 17, scans: null },
  { price: 28, scans: null },
]

/** True of every pack, and the thing that makes them worth buying occasionally. */
export const SCAN_PACK_TERMS = {
  oneTime: true,
  creditsExpire: false,
} as const

export type ProAccessModel = {
  id: 'event' | 'monthly' | 'annual'
  name: string
  /** What you are buying access for — the part that differs between models. */
  cadence: string
  /** Not approved. */
  price: number | null
  /** Not approved. */
  includedScans: number | null
  /** Not approved: the Event Pass window is around 30 days but not locked. */
  durationDays: number | null
}

/**
 * One product, three ways to buy it. Deliberately not three feature tiers —
 * the workflow is identical in all three, only the access window changes.
 */
export const PRO_ACCESS: ProAccessModel[] = [
  {
    id: 'event',
    name: 'Event Pass',
    cadence: 'For the event you are working',
    price: null,
    includedScans: null,
    durationDays: null,
  },
  {
    id: 'monthly',
    name: 'Monthly',
    cadence: 'Month to month',
    price: null,
    includedScans: null,
    durationDays: null,
  },
  {
    id: 'annual',
    name: 'Annual',
    cadence: 'For people at events all year',
    price: null,
    includedScans: null,
    durationDays: null,
  },
]

/** Shown wherever a price is not yet approved. Never a fake number. */
export const PRICE_TBC = 'Pricing coming soon'

/** Formats a locked price, or the honest placeholder when one is not set. */
export function formatPrice(value: number | null): string {
  return value === null ? PRICE_TBC : `${CURRENCY}${value}`
}
