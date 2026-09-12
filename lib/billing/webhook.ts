import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  MAX_CREDITS_PER_PACK,
  MAX_PASS_DAYS,
  PRODUCTS,
  isProductKey,
  type ProKey,
} from '@/lib/billing/catalog'
import { grantScanCredits, ledgerKeys, type GrantArgs } from '@/lib/billing/ledger'
import { readStripeConfig } from '@/lib/billing/stripe'
import { getPlanFromPriceId, type PaidPlan } from '@/lib/stripe-prices'

/**
 * Stripe webhooks: the only place a payment becomes something.
 *
 * Order of operations, and why:
 *
 *   1. Configuration. No webhook secret, no processing — an honest 503.
 *   2. Signature, against the raw body. Anything unsigned or altered is 400.
 *   3. Claim the event id. A delivery already processed or deliberately ignored
 *      is acknowledged and nothing else happens.
 *   4. Act — but only on event types this code understands, and only for money
 *      that has actually arrived.
 *   5. Record the outcome.
 *
 * Idempotency is layered. The event claim stops duplicate deliveries early; the
 * ledger key `stripe:checkout:<session>` is what actually guarantees one grant
 * per paid session, so the two events that can both describe a paid session
 * (`completed`, then `async_payment_succeeded`) still grant once between them,
 * and an event reprocessed after a crash grants nothing new.
 *
 * Failures come in two kinds. A transient one — the database is unreachable —
 * returns 500 so Stripe retries. A permanent one — metadata that can never be
 * valid — is recorded as failed and acknowledged, so it is visible without
 * Stripe retrying it for three days. Logs carry the event id, type and a short
 * code; never a payload, an email or a card detail.
 */

type Env = Record<string, string | undefined>

export type EntitlementUpdate = {
  userId: string
  productKey: ProKey
  status: 'active' | 'trialing' | 'past_due' | 'unpaid' | 'incomplete' | 'paused' | 'canceled' | 'expired'
  stripeSubscriptionId: string | null
  stripeCheckoutSessionId: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  eventAt: string
}

export type WebhookStore = {
  claimEvent(event: {
    id: string
    type: string
    livemode: boolean
    createdAt: string
  }): Promise<'new' | 'retry' | 'duplicate'>
  finishEvent(id: string, status: 'processed' | 'ignored' | 'failed', errorCode?: string): Promise<void>
  grantCredits(args: GrantArgs): Promise<{ granted: boolean; balance: number }>
  applyEntitlement(update: EntitlementUpdate): Promise<'applied' | 'stale'>
  /** Legacy plan subscriptions, handled exactly as before this foundation. */
  legacyPlanActivated(args: {
    userId: string
    plan: PaidPlan
    customerId: string | null
    subscriptionId: string | null
  }): Promise<void>
  legacyPlanCanceled(customerId: string): Promise<void>
}

export type WebhookDeps = {
  stripe: Pick<Stripe, 'webhooks' | 'checkout' | 'subscriptions'>
  store: WebhookStore
  env?: Env
}

export type WebhookResponse = {
  status: number
  body: { received?: boolean; duplicate?: boolean; error?: string }
}

/** Data that can never become valid. Recorded and acknowledged, not retried. */
class PermanentWebhookError extends Error {
  constructor(public readonly code: string) {
    super(code)
  }
}

type Outcome = 'processed' | 'ignored'

const LEGACY_PLANS: readonly string[] = ['starter', 'growth', 'pro', 'team']

function toIso(unixSeconds: number | null | undefined): string | null {
  return typeof unixSeconds === 'number' && Number.isFinite(unixSeconds)
    ? new Date(unixSeconds * 1000).toISOString()
    : null
}

function wholeNumber(raw: string | undefined, max: number): number | null {
  if (!raw || !/^[0-9]+$/.test(raw)) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) && value >= 1 && value <= max ? value : null
}

function subscriptionStatus(status: Stripe.Subscription.Status): EntitlementUpdate['status'] {
  switch (status) {
    case 'incomplete_expired':
      return 'expired'
    case 'active':
    case 'trialing':
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
    case 'paused':
    case 'canceled':
      return status
    default:
      return 'incomplete'
  }
}

async function handlePaidPaymentSession(
  deps: WebhookDeps,
  event: Stripe.Event,
  session: Stripe.Checkout.Session
): Promise<Outcome> {
  const metadata = session.metadata ?? {}
  const userId = metadata.abc_user_id
  const productKey = metadata.product_key

  // Both are written by our own server when the session is created; they must agree.
  if (!userId || session.client_reference_id !== userId) {
    throw new PermanentWebhookError('owner_mismatch')
  }
  if (!isProductKey(productKey)) throw new PermanentWebhookError('unknown_product')

  const definition = PRODUCTS[productKey]
  if (definition.mode !== 'payment') throw new PermanentWebhookError('mode_mismatch')

  // What was charged must be what the catalogue sold.
  const lineItems = await deps.stripe.checkout.sessions.listLineItems(session.id, { limit: 5 })
  const items = lineItems.data
  if (
    items.length !== 1 ||
    items[0].price?.id !== metadata.catalog_price_id ||
    (items[0].quantity ?? 1) !== 1
  ) {
    throw new PermanentWebhookError('line_items_mismatch')
  }

  if (definition.kind === 'scan_pack') {
    const credits = wholeNumber(metadata.credits, MAX_CREDITS_PER_PACK)
    if (credits === null) throw new PermanentWebhookError('invalid_credits')

    await deps.store.grantCredits({
      userId,
      amount: credits,
      kind: 'grant',
      source: 'stripe_checkout',
      sourceRef: session.id,
      productKey,
      idempotencyKey: ledgerKeys.checkout(session.id),
      metadata: { stripe_event_id: event.id, livemode: event.livemode },
    })
    return 'processed'
  }

  if (definition.kind === 'pro_pass') {
    const days = wholeNumber(metadata.pass_days, MAX_PASS_DAYS)
    if (days === null) throw new PermanentWebhookError('invalid_pass_days')

    const start = new Date((session.created ?? event.created) * 1000)
    const end = new Date(start.getTime() + days * 86_400_000)

    await deps.store.applyEntitlement({
      userId,
      productKey: 'pro_event',
      status: 'active',
      stripeSubscriptionId: null,
      stripeCheckoutSessionId: session.id,
      currentPeriodStart: start.toISOString(),
      currentPeriodEnd: end.toISOString(),
      cancelAtPeriodEnd: false,
      eventAt: new Date(event.created * 1000).toISOString(),
    })
    return 'processed'
  }

  throw new PermanentWebhookError('mode_mismatch')
}

async function handleSubscriptionSession(
  deps: WebhookDeps,
  event: Stripe.Event,
  session: Stripe.Checkout.Session
): Promise<Outcome> {
  const metadata = session.metadata ?? {}
  const productKey = metadata.product_key
  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null

  if (isProductKey(productKey)) {
    const definition = PRODUCTS[productKey]
    if (definition.kind !== 'pro_subscription') throw new PermanentWebhookError('mode_mismatch')

    const userId = metadata.abc_user_id
    if (!userId || session.client_reference_id !== userId) throw new PermanentWebhookError('owner_mismatch')
    if (!subscriptionId) throw new PermanentWebhookError('missing_subscription')

    const subscription = await deps.stripe.subscriptions.retrieve(subscriptionId)
    await deps.store.applyEntitlement({
      userId,
      productKey: definition.key,
      status: subscriptionStatus(subscription.status),
      stripeSubscriptionId: subscription.id,
      stripeCheckoutSessionId: session.id,
      currentPeriodStart: toIso(subscription.current_period_start),
      currentPeriodEnd: toIso(subscription.current_period_end),
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      eventAt: new Date(event.created * 1000).toISOString(),
    })
    return 'processed'
  }

  /*
    Legacy plan subscriptions (starter, growth, pro, team). Handled exactly as the
    webhook handled them before this foundation, so anybody still subscribed on a
    legacy plan is unaffected by it.
  */
  const legacyUserId = metadata.userId ?? metadata.user_id
  let plan: PaidPlan | null = LEGACY_PLANS.includes(metadata.plan ?? '') ? (metadata.plan as PaidPlan) : null
  if (!plan) {
    const lineItems = await deps.stripe.checkout.sessions.listLineItems(session.id, { limit: 5 })
    plan = getPlanFromPriceId(lineItems.data[0]?.price?.id ?? '')
  }

  if (legacyUserId && plan) {
    await deps.store.legacyPlanActivated({ userId: legacyUserId, plan, customerId, subscriptionId })
    return 'processed'
  }
  return 'ignored'
}

async function handleSubscriptionChange(deps: WebhookDeps, event: Stripe.Event): Promise<Outcome> {
  const subscription = event.data.object as Stripe.Subscription
  const metadata = subscription.metadata ?? {}
  const productKey = metadata.product_key

  if (isProductKey(productKey) && PRODUCTS[productKey].kind === 'pro_subscription') {
    const userId = metadata.abc_user_id
    if (!userId) throw new PermanentWebhookError('owner_missing')

    const outcome = await deps.store.applyEntitlement({
      userId,
      productKey: productKey as ProKey,
      status:
        event.type === 'customer.subscription.deleted' ? 'canceled' : subscriptionStatus(subscription.status),
      stripeSubscriptionId: subscription.id,
      stripeCheckoutSessionId: null,
      currentPeriodStart: toIso(subscription.current_period_start),
      currentPeriodEnd: toIso(subscription.current_period_end),
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      eventAt: new Date(event.created * 1000).toISOString(),
    })
    // An older event than the state already recorded is processed by being discarded.
    return outcome === 'applied' ? 'processed' : 'ignored'
  }

  if (event.type === 'customer.subscription.deleted') {
    const customerId =
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id
    if (customerId) {
      await deps.store.legacyPlanCanceled(customerId)
      return 'processed'
    }
  }

  return 'ignored'
}

async function dispatch(deps: WebhookDeps, event: Stripe.Event): Promise<Outcome> {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object as Stripe.Checkout.Session

      if (session.mode === 'payment') {
        /*
          Paid means paid. A session that completed with a delayed payment method
          is `unpaid` until the money settles, and grants nothing now; its
          `async_payment_succeeded` event grants later, under the same session key.
        */
        const paid =
          event.type === 'checkout.session.async_payment_succeeded' || session.payment_status === 'paid'
        if (!paid) return 'ignored'
        return handlePaidPaymentSession(deps, event, session)
      }

      if (session.mode === 'subscription' && event.type === 'checkout.session.completed') {
        return handleSubscriptionSession(deps, event, session)
      }

      return 'ignored'
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return handleSubscriptionChange(deps, event)

    default:
      // Understood to be irrelevant, recorded, and acknowledged.
      return 'ignored'
  }
}

export async function handleStripeWebhook(
  deps: WebhookDeps,
  rawBody: string,
  signature: string | null
): Promise<WebhookResponse> {
  const config = readStripeConfig(deps.env ?? process.env)
  if (!config.ok || !config.config.webhookSecret) {
    return { status: 503, body: { error: 'webhook_not_configured' } }
  }

  if (!signature) return { status: 400, body: { error: 'missing_signature' } }

  let event: Stripe.Event
  try {
    event = deps.stripe.webhooks.constructEvent(rawBody, signature, config.config.webhookSecret)
  } catch {
    return { status: 400, body: { error: 'invalid_signature' } }
  }

  let claim: 'new' | 'retry' | 'duplicate'
  try {
    claim = await deps.store.claimEvent({
      id: event.id,
      type: event.type,
      livemode: event.livemode,
      createdAt: new Date(event.created * 1000).toISOString(),
    })
  } catch (err) {
    console.error('[billing/webhook] could not record event', { id: event.id, type: event.type })
    return { status: 500, body: { error: 'processing_failed' } }
  }

  if (claim === 'duplicate') {
    return { status: 200, body: { received: true, duplicate: true } }
  }

  try {
    const outcome = await dispatch(deps, event)
    await deps.store.finishEvent(event.id, outcome)
    return { status: 200, body: { received: true } }
  } catch (err) {
    if (err instanceof PermanentWebhookError) {
      console.error('[billing/webhook] event rejected', { id: event.id, type: event.type, code: err.code })
      await deps.store.finishEvent(event.id, 'failed', err.code).catch(() => undefined)
      return { status: 200, body: { received: true } }
    }

    const code = err instanceof Error ? err.message.split(':')[0].slice(0, 60) : 'unknown'
    console.error('[billing/webhook] event failed, will be retried', { id: event.id, type: event.type, code })
    await deps.store.finishEvent(event.id, 'failed', code).catch(() => undefined)
    return { status: 500, body: { error: 'processing_failed' } }
  }
}

/** The production store, over the service-role client. */
export function supabaseWebhookStore(db: SupabaseClient): WebhookStore {
  return {
    async claimEvent(event) {
      const { data, error } = await db.rpc('claim_stripe_webhook_event', {
        p_event_id: event.id,
        p_event_type: event.type,
        p_livemode: event.livemode,
        p_stripe_created_at: event.createdAt,
      })
      if (error) throw new Error(`event_claim_failed:${error.code ?? 'unknown'}`)
      if (data === 'new' || data === 'retry' || data === 'duplicate') return data
      throw new Error('event_claim_failed:unexpected')
    },

    async finishEvent(id, status, errorCode) {
      const { error } = await db
        .from('stripe_webhook_events')
        .update({ status, error_code: errorCode ?? null, processed_at: new Date().toISOString() })
        .eq('event_id', id)
      if (error) throw new Error(`event_finish_failed:${error.code ?? 'unknown'}`)
    },

    grantCredits(args) {
      return grantScanCredits(db, args)
    },

    async applyEntitlement(update) {
      const { data, error } = await db.rpc('apply_billing_entitlement', {
        p_user_id: update.userId,
        p_product_key: update.productKey,
        p_status: update.status,
        p_stripe_subscription_id: update.stripeSubscriptionId,
        p_stripe_checkout_session_id: update.stripeCheckoutSessionId,
        p_current_period_start: update.currentPeriodStart,
        p_current_period_end: update.currentPeriodEnd,
        p_cancel_at_period_end: update.cancelAtPeriodEnd,
        p_event_at: update.eventAt,
      })
      if (error) throw new Error(`entitlement_apply_failed:${error.code ?? 'unknown'}`)
      return data === 'applied' ? 'applied' : 'stale'
    },

    async legacyPlanActivated({ userId, plan, customerId, subscriptionId }) {
      const { error } = await db
        .from('abc_profiles')
        .update({
          plan,
          plan_activated_at: new Date().toISOString(),
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
        })
        .eq('id', userId)
      if (error) throw new Error(`legacy_plan_failed:${error.code ?? 'unknown'}`)
    },

    async legacyPlanCanceled(customerId) {
      const { error } = await db
        .from('abc_profiles')
        .update({ plan: 'free', stripe_subscription_id: null })
        .eq('stripe_customer_id', customerId)
      if (error) throw new Error(`legacy_plan_failed:${error.code ?? 'unknown'}`)
    },
  }
}
