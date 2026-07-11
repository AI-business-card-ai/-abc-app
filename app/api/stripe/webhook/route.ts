import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerSupabase } from '@/lib/supabase'
import { getPlanFromPriceId, type PaidPlan } from '@/lib/stripe-prices'

export const runtime = 'nodejs'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

function resolvePlanFromSession(session: Stripe.Checkout.Session): PaidPlan | null {
  const metaPlan = session.metadata?.plan
  if (metaPlan && ['starter', 'growth', 'pro', 'team'].includes(metaPlan)) {
    return metaPlan as PaidPlan
  }

  const lineItems = session.line_items?.data
  if (lineItems?.length) {
    const priceId = lineItems[0].price?.id
    if (priceId) return getPlanFromPriceId(priceId)
  }

  return null
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch {
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 })
  }

  const supabase = createServerSupabase()

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.metadata?.userId ?? session.metadata?.user_id
    let plan = resolvePlanFromSession(session)

    if (!plan && session.id) {
      const expanded = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['line_items.data.price'],
      })
      plan = resolvePlanFromSession(expanded)
    }

    if (userId && plan) {
      await supabase
        .from('abc_profiles')
        .update({
          plan,
          plan_activated_at: new Date().toISOString(),
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
        })
        .eq('id', userId)
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id

    if (customerId) {
      await supabase
        .from('abc_profiles')
        .update({
          plan: 'free',
          stripe_subscription_id: null,
        })
        .eq('stripe_customer_id', customerId)
    }
  }

  return NextResponse.json({ received: true })
}
