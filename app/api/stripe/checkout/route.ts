import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { getStripePriceId, getPlanFromPriceId, type PaidPlan } from '@/lib/stripe-prices'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const PAID_PLANS = new Set<PaidPlan>(['starter', 'growth', 'pro', 'team'])

export async function POST(req: NextRequest) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 })
    }

    const { plan } = (await req.json()) as { plan?: string }
    if (!plan || !PAID_PLANS.has(plan as PaidPlan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const supabase = createRouteHandlerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const paidPlan = plan as PaidPlan
    const priceId = getStripePriceId(paidPlan)

    if (!getPlanFromPriceId(priceId)) {
      return NextResponse.json({ error: 'Price ID does not map to a known plan' }, { status: 500 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing/cancel`,
      customer_email: user.email,
      metadata: {
        userId: user.id,
        plan: paidPlan,
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Checkout failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
