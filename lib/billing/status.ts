import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PRODUCT_KEYS,
  PRODUCTS,
  resolveProduct,
  type ProKey,
  type ProductKey,
} from '@/lib/billing/catalog'
import type { ProSource } from '@/lib/billing/pro-features'
import { readStripeConfig } from '@/lib/billing/stripe'
import { resolveProState } from '@/lib/entitlements'
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
 * credits there are (or that none are needed), whether ABC Pro is active, where
 * it comes from and when it ends, and which products can currently be bought. A
 * product whose quantity is not decided is reported as unavailable, with no
 * quantity at all.
 *
 * Pro is read through `resolveProState`, the same resolver every Pro gate uses,
 * so this page and the gates cannot disagree about whether somebody is Pro.
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
    /** Where current access comes from; `none` when not active. */
    source: ProSource
    /** When current access ends or renews. Null for the founder and when not active. */
    endsAt: string | null
    /** A subscription that will renew; false for an Event Pass or a cancelling subscription. */
    renews: boolean
    /** The current entitlement's product, or the most recent one when none is active. */
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

export async function readBillingStatus(
  db: SupabaseClient,
  profile: EntitlementProfile & { id: string },
  identity: AuthIdentity | null | undefined,
  env: Env = process.env,
  now: Date = new Date()
): Promise<BillingStatus> {
  const scan = await resolveScanEntitlement(db, profile, identity, env)
  const proState = await resolveProState(db, identity, now)
  const shown = proState.current ?? proState.lastKnown

  const pro: BillingStatus['pro'] = {
    active: proState.pro,
    viaFounder: proState.founder,
    source: proState.proSource,
    endsAt: proState.proEndsAt,
    renews: proState.proRenews,
    productKey: shown?.productKey ?? null,
    status: shown?.status ?? null,
    currentPeriodEnd: shown?.currentPeriodEnd ?? null,
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
