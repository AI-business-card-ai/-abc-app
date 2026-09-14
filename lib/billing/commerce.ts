import type { NativePlatform } from '@/lib/native/runtime'

/**
 * Which way ABC may sell, depending on where it is running.
 *
 * On the web and in the installed PWA: Stripe, exactly as before.
 *
 * Inside the App Store and Google Play apps: nothing, for now. Smart Scan packs
 * and ABC Pro are digital functionality, and both stores have their own rules for
 * selling that inside an app. Which rules apply, and whether ABC sells through
 * In-App Purchase, Play Billing or not at all in the apps, is an owner decision
 * that has not been made — so the apps neither show the web checkout nor point
 * anywhere else to buy. The seam for store billing is lib/billing/native-store.ts.
 *
 * Enforced at every entry point the app can reach: Plan & Billing hides the web
 * checkout and the billing portal, the middleware sends the pricing pages to Plan
 * & Billing, and /api/billing/checkout refuses requests from the app. The legacy
 * pricing checkout and portal routes are called only from those withheld screens
 * and stay untouched until the legacy pricing flow is replaced. The route and
 * middleware checks read the app's user-agent marker, which a client can fake;
 * that only ever withholds a checkout from somebody pretending to be the app, and
 * grants nothing.
 */

export type CommerceChannel = 'stripe_web' | 'app_store' | 'google_play'

export const NATIVE_PURCHASES_UNAVAILABLE_CODE = 'native_purchases_unavailable'
export const NATIVE_PURCHASES_UNAVAILABLE_MESSAGE = 'Purchases aren’t available in the ABC Card app yet.'

export function commerceChannelFor(platform: NativePlatform | null): CommerceChannel {
  if (platform === 'ios') return 'app_store'
  if (platform === 'android') return 'google_play'
  return 'stripe_web'
}

export function webCheckoutAvailable(platform: NativePlatform | null): boolean {
  return commerceChannelFor(platform) === 'stripe_web'
}
