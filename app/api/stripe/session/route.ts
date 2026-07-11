import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { getPlanFromPriceId, type PaidPlan } from '@/lib/stripe-prices'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function GET(req: NextRequest) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 })
    }

    const sessionId = req.nextUrl.searchParams.get('session_id')
    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
    }

    const supabase = createRouteHandlerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items.data.price'],
    })

    const sessionUserId = session.metadata?.userId ?? session.metadata?.user_id
    if (sessionUserId !== user.id) {
      return NextResponse.json({ error: 'Session does not belong to this user' }, { status: 403 })
    }

    let plan: PaidPlan | null = null
    const metaPlan = session.metadata?.plan
    if (metaPlan && ['starter', 'growth', 'pro', 'team'].includes(metaPlan)) {
      plan = metaPlan as PaidPlan
    } else {
      const priceId = session.line_items?.data?.[0]?.price?.id
      if (priceId) plan = getPlanFromPriceId(priceId)
    }

    if (!plan) {
      return NextResponse.json({ error: 'Could not resolve plan' }, { status: 404 })
    }

    return NextResponse.json({ plan })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load session'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
