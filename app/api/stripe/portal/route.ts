import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { serverErrorResponse } from '@/lib/api/errors'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 })
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

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/profile`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    return serverErrorResponse('stripe/portal', error, 'Could not open the billing portal. Try again.')
  }
}
