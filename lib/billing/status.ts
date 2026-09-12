import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PRODUCT_KEYS,
  PRO_KEYS,
  PRODUCTS,
  resolveProduct,
  type ProKey,
  type ProductKey,
} from '@/lib/billing/catalog'
import { readStripeConfig } from '@/lib/billing/stripe'
import {
  resolveScanEntitlement,
  type AuthIdentity,
  type EntitlementProfile,
  type ScanCreditState,
} from '@/lib/scan/entitlement'

/**
 * What the app may show about an owner's billing. Nothing more.
 *
 * No Stripe object, customer id, subscription id, secret or payment detail
 * leaves this function — only the facts a screen needs: how many Smart Scan
 * credits there are (or that none are needed), whether Pro is active and until
 * when, and which products can currently be bought. A product whose quantity is
 * not decided is reported as unavailable, with no quantity at all.
 */

type Env = Record<string, string | undefined>

export type BillingStatus = {
  smartScan: {
    unmetered: boolean
    founder: boolean
    /** Null when unmetered, or when the balance could not be read. */
    balance: number | null
    source: ScanCreditState['source']
  }
  pro: {
    active: boolean
    /** Founder Pro is lifetime and independent of any purchase. */
    viaFounder: boolean
    productKey: ProKey | null
    status: string | null
    currentPeriodEnd: string | null
  }
  stripeConfigured: boolean
  products: {
    key: ProductKey
    kind: string
    mode: string
    /** True only when Stripe and this product are both fully configured. */
    available: boolean
    publicPriceEurCents: number | null
    /** Only ever the configured quantity; never a default. */
    credits: number | null
  }[]
}

type EntitlementRow = {
  product_key: string
  status: string
  current_period_end: string | null
}

const ACTIVE = new Set(['active', 'trialing'])

export async function readBillingStatus(
  db: SupabaseClient,
  profile: EntitlementProfile & { id: string },
  identity: AuthIdentity | null | undefined,
  env: Env = process.env,
  now: Date = new Date()
): Promise<BillingStatus> {
  const scan = await resolveScanEntitlement(db, profile, identity, env)

  let pro: BillingStatus['pro'] = {
    active: scan.founder,
    viaFounder: scan.founder,
    productKey: null,
    status: null,
    currentPeriodEnd: null,
  }

  if (!scan.founder) {
    const { data, error } = await db
      .from('billing_entitlements')
      .select('product_key, status, current_period_end')
      .eq('user_id', profile.id)
      .order('current_period_end', { ascending: false, nullsFirst: false })
      .limit(10)

    if (error) {
      console.error('[billing/status] entitlement read failed:', error.code ?? 'unknown')
    } else {
      const rows = (data ?? []) as EntitlementRow[]
      const current = rows.find(
        (row) =>
          ACTIVE.has(row.status) &&
          (PRO_KEYS as readonly string[]).includes(row.product_key) &&
          (!row.current_period_end || new Date(row.current_period_end) > now)
      )
      const latest = current ?? rows[0]
      if (latest) {
        pro = {
          active: Boolean(current),
          viaFounder: false,
          productKey: (PRO_KEYS as readonly string[]).includes(latest.product_key)
            ? (latest.product_key as ProKey)
            : null,
          status: latest.status,
          currentPeriodEnd: latest.current_period_end,
        }
      }
    }
  }

  const stripeConfigured = readStripeConfig(env).ok

  const products = PRODUCT_KEYS.map((key) => {
    const resolved = resolveProduct(key, env)
    const definition = PRODUCTS[key]
    return {
      key,
      kind: definition.kind,
      mode: definition.mode,
      available: stripeConfigured && resolved.configured,
      publicPriceEurCents: definition.kind === 'scan_pack' ? definition.publicPriceEurCents : null,
      credits: resolved.configured && resolved.credits ? resolved.credits : null,
    }
  })

  return {
    smartScan: {
      unmetered: scan.unmetered,
      founder: scan.founder,
      balance: scan.unmetered ? null : scan.creditBalance,
      source: scan.source,
    },
    pro,
    stripeConfigured,
    products,
  }
}
