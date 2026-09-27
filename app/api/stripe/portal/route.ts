import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { serverErrorResponse } from '@/lib/api/errors'
import { readStripeConfig, stripeClient } from '@/lib/billing/stripe'

/**
 * The billing portal, for an account that already has a subscription.
 *
 * Stripe is created when a request asks for it, never at import. A client
 * built at module scope from `STRIPE_SECRET_KEY!` throws the moment the module
 * is loaded with no key — including while Next collects page data during a
 * build — so an unconfigured Stripe stopped the whole app from deploying
 * rather than making this one route unavailable. Configuration is read here
 * through the same helper the rest of billing uses, and a missing or malformed
 * key is an honest 503 from this route alone.
 */
export async function POST(req: NextRequest) {
  try {
    const stripeConfig = readStripeConfig()
    if (!stripeConfig.ok) {
      return NextResponse.json(
        { error: 'Stripe is not configured' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const supabase = createRouteHandlerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('abc_profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle()

    const customerId = profile?.stripe_customer_id
    if (!customerId) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin

    const session = await stripeClient(stripeConfig.config.secretKey).billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/profile`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    return serverErrorResponse('stripe/portal', error, 'Could not open the billing portal. Try again.')
  }
}
