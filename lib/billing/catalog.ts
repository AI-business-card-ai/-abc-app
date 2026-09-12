/**
 * What ABC sells, and what each thing does once it is paid for.
 *
 * Internal keys are stable and belong to ABC; Stripe Price IDs and credit
 * quantities belong to configuration. The seam between them is deliberate:
 * pricing will change, and a price change must be a configuration change —
 * never a code change, and never a migration.
 *
 * NOTHING HERE INVENTS A QUANTITY. The three scan packs have locked public price
 * points (€8, €17, €28) and no locked credit count yet. Until an owner sets both
 * the Price ID and the credit count for a pack, that pack is simply not
 * configured: it cannot be checked out and it cannot be fulfilled. A missing,
 * zero or malformed quantity is "not configured", never a silent grant of zero.
 *
 * ABC Pro is prepared here as billing state only. Pro does not mean unlimited
 * Smart Scans, and no Pro product grants credits in this version — an included
 * allowance, if one is chosen, is a later decision with its own configuration.
 */

export const SCAN_PACK_KEYS = ['scan_pack_8', 'scan_pack_17', 'scan_pack_28'] as const
export const PRO_KEYS = ['pro_event', 'pro_monthly', 'pro_annual'] as const
export const PRODUCT_KEYS = [...SCAN_PACK_KEYS, ...PRO_KEYS] as const

export type ScanPackKey = (typeof SCAN_PACK_KEYS)[number]
export type ProKey = (typeof PRO_KEYS)[number]
export type ProductKey = (typeof PRODUCT_KEYS)[number]

type Env = Record<string, string | undefined>

type ScanPackDefinition = {
  key: ScanPackKey
  kind: 'scan_pack'
  /** One-time purchase. */
  mode: 'payment'
  /** The locked public price point, for display and documentation only. Stripe's price is authoritative. */
  publicPriceEurCents: 800 | 1700 | 2800
  priceIdEnv: string
  /** Credits granted per purchase. Not decided yet, so not defaulted. */
  creditsEnv: string
}

type ProPassDefinition = {
  key: 'pro_event'
  kind: 'pro_pass'
  /** A one-time purchase that grants Pro for a fixed period. */
  mode: 'payment'
  priceIdEnv: string
  /** How long the pass lasts. Not decided yet, so not defaulted. */
  passDaysEnv: string
}

type ProSubscriptionDefinition = {
  key: 'pro_monthly' | 'pro_annual'
  kind: 'pro_subscription'
  mode: 'subscription'
  priceIdEnv: string
}

export type ProductDefinition = ScanPackDefinition | ProPassDefinition | ProSubscriptionDefinition

export const PRODUCTS: Record<ProductKey, ProductDefinition> = {
  scan_pack_8: {
    key: 'scan_pack_8',
    kind: 'scan_pack',
    mode: 'payment',
    publicPriceEurCents: 800,
    priceIdEnv: 'STRIPE_PRICE_SCAN_PACK_8',
    creditsEnv: 'SCAN_PACK_8_CREDITS',
  },
  scan_pack_17: {
    key: 'scan_pack_17',
    kind: 'scan_pack',
    mode: 'payment',
    publicPriceEurCents: 1700,
    priceIdEnv: 'STRIPE_PRICE_SCAN_PACK_17',
    creditsEnv: 'SCAN_PACK_17_CREDITS',
  },
  scan_pack_28: {
    key: 'scan_pack_28',
    kind: 'scan_pack',
    mode: 'payment',
    publicPriceEurCents: 2800,
    priceIdEnv: 'STRIPE_PRICE_SCAN_PACK_28',
    creditsEnv: 'SCAN_PACK_28_CREDITS',
  },
  pro_event: {
    key: 'pro_event',
    kind: 'pro_pass',
    mode: 'payment',
    priceIdEnv: 'STRIPE_PRICE_PRO_EVENT',
    passDaysEnv: 'PRO_EVENT_PASS_DAYS',
  },
  pro_monthly: {
    key: 'pro_monthly',
    kind: 'pro_subscription',
    mode: 'subscription',
    priceIdEnv: 'STRIPE_PRICE_PRO_MONTHLY',
  },
  pro_annual: {
    key: 'pro_annual',
    kind: 'pro_subscription',
    mode: 'subscription',
    priceIdEnv: 'STRIPE_PRICE_PRO_ANNUAL',
  },
}

export function isProductKey(value: unknown): value is ProductKey {
  return typeof value === 'string' && (PRODUCT_KEYS as readonly string[]).includes(value)
}

/** Stripe Price IDs have one shape. Anything else is a typo or a placeholder. */
const PRICE_ID = /^price_[A-Za-z0-9]{8,}$/

/** A whole number of credits or days, within sane bounds. "0", "", "ten" are all unconfigured. */
function positiveInteger(raw: string | undefined, max: number): number | null {
  const text = (raw || '').trim()
  if (!/^[0-9]+$/.test(text)) return null
  const value = Number(text)
  return Number.isSafeInteger(value) && value >= 1 && value <= max ? value : null
}

export const MAX_CREDITS_PER_PACK = 10_000
export const MAX_PASS_DAYS = 366

export type ResolvedProduct =
  | {
      configured: true
      definition: ProductDefinition
      priceId: string
      /** Present for scan packs. */
      credits?: number
      /** Present for the Event Pass. */
      passDays?: number
    }
  | {
      configured: false
      definition: ProductDefinition
      /** Env names that are missing or invalid. Names only — never values. */
      missing: string[]
    }

/**
 * Whether a product can be sold right now, and on what terms.
 *
 * Read at checkout and again at fulfilment. Fulfilment trusts the terms stamped
 * into the Checkout Session at purchase time, not a re-read of configuration, so
 * changing a quantity later never changes what an earlier buyer receives — this
 * resolution only decides whether a new sale may begin.
 */
export function resolveProduct(key: ProductKey, env: Env = process.env): ResolvedProduct {
  const definition = PRODUCTS[key]
  const missing: string[] = []

  const priceId = (env[definition.priceIdEnv] || '').trim()
  if (!PRICE_ID.test(priceId)) missing.push(definition.priceIdEnv)

  let credits: number | undefined
  let passDays: number | undefined

  if (definition.kind === 'scan_pack') {
    const value = positiveInteger(env[definition.creditsEnv], MAX_CREDITS_PER_PACK)
    if (value === null) missing.push(definition.creditsEnv)
    else credits = value
  }

  if (definition.kind === 'pro_pass') {
    const value = positiveInteger(env[definition.passDaysEnv], MAX_PASS_DAYS)
    if (value === null) missing.push(definition.passDaysEnv)
    else passDays = value
  }

  if (missing.length > 0) return { configured: false, definition, missing }
  return { configured: true, definition, priceId, credits, passDays }
}

/** The product a configured Price ID sells, if any. Used to check a paid session against the catalogue. */
export function productForPriceId(priceId: string | null | undefined, env: Env = process.env): ProductKey | null {
  if (!priceId) return null
  for (const key of PRODUCT_KEYS) {
    const configured = (env[PRODUCTS[key].priceIdEnv] || '').trim()
    if (configured && configured === priceId) return key
  }
  return null
}

/** Every env name the catalogue reads, for the owner's setup checklist. */
export function catalogEnvNames(): string[] {
  const names: string[] = []
  for (const key of PRODUCT_KEYS) {
    const definition = PRODUCTS[key]
    names.push(definition.priceIdEnv)
    if (definition.kind === 'scan_pack') names.push(definition.creditsEnv)
    if (definition.kind === 'pro_pass') names.push(definition.passDaysEnv)
  }
  return names
}
