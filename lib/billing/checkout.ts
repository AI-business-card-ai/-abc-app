import type Stripe from 'stripe'
import { isProductKey, PRODUCTS, resolveProduct, type ProductKey } from '@/lib/billing/catalog'
import { ensureStripeCustomer, type CustomerIdentity, type CustomerStore } from '@/lib/billing/customer'
import { ledgerEnabled } from '@/lib/billing/ledger'
import { readStripeConfig } from '@/lib/billing/stripe'

/**
 * Starting a purchase.
 *
 * Three things are decided here and nowhere else:
 *
 *   - WHO is buying: the verified session user, handed in by the route. The
 *     request body names a product and nothing more — no user id, no customer
 *     id, no price, no quantity is read from it.
 *   - WHETHER it can be sold: a product whose Price ID or credit quantity is not
 *     configured is refused before Stripe is ever called, and so is a scan pack
 *     while the credit ledger is off (scanPackSaleBlocked).
 *   - ON WHAT TERMS: the price and, for a scan pack, the number of credits are
 *     stamped into the Checkout Session's metadata now. Fulfilment grants exactly
 *     what was sold, even if the configured quantity changes before the webhook
 *     arrives.
 *
 * Nothing is granted here, and nothing is granted by the browser landing on the
 * success page. Credits arrive only from a verified webhook for a paid session.
 */

type Env = Record<string, string | undefined>

export type CheckoutDeps = {
  /** Null when Stripe is not configured; the configuration check answers before it is used. */
  stripe: Pick<Stripe, 'checkout' | 'customers'> | null
  customers: CustomerStore
  env?: Env
}

export type CheckoutErrorCode =
  | 'unauthorized'
  | 'invalid_product'
  | 'stripe_not_configured'
  | 'app_origin_not_configured'
  | 'product_not_configured'
  | 'scan_packs_unavailable'
  | 'checkout_failed'

export type CheckoutResult =
  | { ok: true; url: string; sessionId: string }
  | { ok: false; status: number; code: CheckoutErrorCode }

/** The metadata every ABC Checkout Session carries. Read back by the webhook. */
export type AbcCheckoutMetadata = {
  abc_user_id: string
  product_key: ProductKey
  catalog_price_id: string
  credits?: string
  pass_days?: string
}

/**
 * Release blocker B6: a Smart Scan pack is sold only while the credit ledger is
 * authoritative. With SMART_SCAN_LEDGER off — or unset, or anything but "on" —
 * scans still count against the legacy allowance, so a paid pack would add
 * credits that no scan ever spends.
 *
 * Decided by the catalogue kind of a key the server has already validated;
 * nothing else in the request takes part. Billing status reports the same
 * answer, so no screen can offer a pack that checkout refuses.
 */
export function scanPackSaleBlocked(key: ProductKey, env: Env = process.env): boolean {
  return PRODUCTS[key].kind === 'scan_pack' && !ledgerEnabled(env)
}

export async function createCheckoutSession(
  deps: CheckoutDeps,
  identity: CustomerIdentity | null,
  requestedProduct: unknown
): Promise<CheckoutResult> {
  if (!identity?.id) return { ok: false, status: 401, code: 'unauthorized' }
  if (!isProductKey(requestedProduct)) return { ok: false, status: 400, code: 'invalid_product' }

  const env = deps.env ?? process.env

  const stripeConfig = readStripeConfig(env)
  if (!stripeConfig.ok || !deps.stripe) return { ok: false, status: 503, code: 'stripe_not_configured' }
  const stripe = deps.stripe
  if (!stripeConfig.config.appOrigin) return { ok: false, status: 503, code: 'app_origin_not_configured' }

  // Before the customer lookup and the session, both of which reach Stripe.
  if (scanPackSaleBlocked(requestedProduct, env)) {
    console.warn('[billing/checkout] scan pack refused: the credit ledger is off', { product: requestedProduct })
    return { ok: false, status: 409, code: 'scan_packs_unavailable' }
  }

  const product = resolveProduct(requestedProduct, env)
  if (!product.configured) {
    // Env names are logged for the operator; the browser gets only the code.
    console.warn('[billing/checkout] product not configured', {
      product: requestedProduct,
      missing: product.missing,
    })
    return { ok: false, status: 409, code: 'product_not_configured' }
  }

  const origin = stripeConfig.config.appOrigin

  try {
    const customer = await ensureStripeCustomer(stripe, deps.customers, identity)

    const metadata: AbcCheckoutMetadata = {
      abc_user_id: identity.id,
      product_key: requestedProduct,
      catalog_price_id: product.priceId,
      ...(product.credits ? { credits: String(product.credits) } : {}),
      ...(product.passDays ? { pass_days: String(product.passDays) } : {}),
    }

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: product.definition.mode,
      customer,
      client_reference_id: identity.id,
      line_items: [{ price: product.priceId, quantity: 1 }],
      metadata,
      success_url: `${origin}/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/settings/billing?checkout=cancelled`,
      ...(product.definition.mode === 'subscription'
        ? { subscription_data: { metadata } }
        : { payment_intent_data: { metadata } }),
    }

    const session = await stripe.checkout.sessions.create(params)
    if (!session.url) return { ok: false, status: 502, code: 'checkout_failed' }

    return { ok: true, url: session.url, sessionId: session.id }
  } catch (err) {
    const stripeError = err as { type?: string; code?: string }
    console.error('[billing/checkout] session creation failed', {
      product: requestedProduct,
      type: stripeError?.type ?? 'unknown',
      code: stripeError?.code ?? null,
    })
    return { ok: false, status: 502, code: 'checkout_failed' }
  }
}
