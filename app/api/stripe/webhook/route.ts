import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { readStripeConfig, stripeClient } from '@/lib/billing/stripe'
import { handleStripeWebhook, supabaseWebhookStore } from '@/lib/billing/webhook'

/**
 * Stripe webhook endpoint.
 *
 * All behaviour lives in `lib/billing/webhook.ts`; this route only hands it the
 * raw body and the signature header. The body is read as text and never parsed
 * first, because signature verification is over the exact bytes Stripe sent.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('stripe-signature')

  const config = readStripeConfig()
  if (!config.ok || !config.config.webhookSecret) {
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 503 })
  }

  let store
  try {
    store = supabaseWebhookStore(createServiceClient())
  } catch {
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 503 })
  }

  const result = await handleStripeWebhook(
    { stripe: stripeClient(config.config.secretKey), store },
    rawBody,
    signature
  )
  return NextResponse.json(result.body, { status: result.status })
}
