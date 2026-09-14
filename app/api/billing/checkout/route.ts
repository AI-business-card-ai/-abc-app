import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'
import { createCheckoutSession } from '@/lib/billing/checkout'
import {
  NATIVE_PURCHASES_UNAVAILABLE_CODE,
  NATIVE_PURCHASES_UNAVAILABLE_MESSAGE,
  webCheckoutAvailable,
} from '@/lib/billing/commerce'
import { profileCustomerStore } from '@/lib/billing/customer'
import { readStripeConfig, stripeClient } from '@/lib/billing/stripe'
import { nativePlatformFromHeaders } from '@/lib/native/runtime'

/**
 * Start a purchase for the signed-in owner.
 *
 * The body names a product — `{ "productKey": "scan_pack_8" }` — and nothing
 * else is read from it. The buyer is the verified session user; the Stripe
 * customer, price and quantity all come from the server. Returns the Checkout
 * URL, or a code saying honestly why the product cannot be bought yet.
 *
 * Refused outright from the store apps, which do not offer the web checkout
 * (lib/billing/commerce.ts).
 */

export const dynamic = 'force-dynamic'

const MESSAGES: Record<string, string> = {
  unauthorized: 'Sign in to continue.',
  invalid_product: 'That product does not exist.',
  stripe_not_configured: 'Payments are not available yet.',
  app_origin_not_configured: 'Payments are not available yet.',
  product_not_configured: 'This product is not available yet.',
  checkout_failed: 'Could not start checkout. Try again.',
}

export async function POST(req: NextRequest) {
  if (!webCheckoutAvailable(nativePlatformFromHeaders(req.headers))) {
    return NextResponse.json({ error: NATIVE_PURCHASES_UNAVAILABLE_MESSAGE, code: NATIVE_PURCHASES_UNAVAILABLE_CODE }, { status: 403 })
  }

  const auth = createRouteHandlerClient()
  const {
    data: { user },
  } = await auth.auth.getUser()

  if (!user) return NextResponse.json({ error: MESSAGES.unauthorized, code: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { productKey?: unknown }

  const config = readStripeConfig()
  const result = await createCheckoutSession(
    {
      stripe: config.ok ? stripeClient(config.config.secretKey) : null,
      customers: profileCustomerStore(createServiceClient()),
    },
    { id: user.id, email: user.email ?? null },
    body.productKey
  )

  if (!result.ok) {
    return NextResponse.json({ error: MESSAGES[result.code], code: result.code }, { status: result.status })
  }

  return NextResponse.json({ success: true, url: result.url })
}
