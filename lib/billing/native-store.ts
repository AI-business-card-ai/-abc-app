import type { ProductKey } from '@/lib/billing/catalog'

/**
 * The seam where Apple In-App Purchase and Google Play Billing will attach.
 *
 * Nothing is sold through it yet. Whether ABC sells inside the apps at all,
 * through which store mechanism, at what price and under which store product ids
 * are owner decisions that have not been made, so the mappings below are empty
 * and no product id is invented.
 *
 * The rule it fixes in place before any of that is built: a purchase made in an
 * app is a claim until the server has verified it with Apple or Google.
 * Verification — the App Store Server API, the Google Play Developer API — runs
 * on the server, and a verified purchase lands in the same billing model the
 * Stripe webhook writes (scan_credit_ledger, billing_entitlements), read by the
 * same entitlement resolver. Nothing on the device, in the WebView or in native
 * code grants credits or Pro.
 */

export type StorePlatform = 'app_store' | 'google_play'

export type StoreProductMapping = { productKey: ProductKey; storeProductId: string }

/** Empty until the store products exist. Never filled with placeholders. */
export const STORE_PRODUCT_MAPPINGS: Readonly<Record<StorePlatform, readonly StoreProductMapping[]>> = {
  app_store: [],
  google_play: [],
}

/** Server-side verification is not built; until it is, no store can sell. */
const STORE_VERIFICATION_IMPLEMENTED = false

export function storeBillingAvailable(platform: StorePlatform): boolean {
  return STORE_VERIFICATION_IMPLEMENTED && STORE_PRODUCT_MAPPINGS[platform].length > 0
}

export type StorePurchaseClaim = {
  platform: StorePlatform
  storeProductId: string
  /** The App Store transaction id or Google Play purchase token, exactly as the store issued it. */
  purchaseToken: string
}

export type StorePurchaseVerification = { ok: false; reason: 'store_billing_not_available' }

/**
 * Verify a store purchase on the server. Not implemented: every claim is refused,
 * and a refused claim grants nothing.
 */
export async function verifyStorePurchase(claim: StorePurchaseClaim): Promise<StorePurchaseVerification> {
  void claim
  return { ok: false, reason: 'store_billing_not_available' }
}
