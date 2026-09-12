import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * One Stripe Customer per ABC owner.
 *
 * The mapping lives in `abc_profiles.stripe_customer_id`, which already exists,
 * is already written only by the server (it is not in the authenticated column
 * grant) and already holds the customer of anybody who paid under the legacy
 * plans — so reusing it keeps those people attached to the customer Stripe
 * already knows, and adds no table.
 *
 * The owner is always the verified session user. Nothing a client sends — a
 * user id, a customer id, an email — decides which customer is used.
 *
 * Idempotent twice over:
 *   - Stripe's own idempotency key makes a repeated create within Stripe's
 *     window return the same customer rather than a second one;
 *   - the database write only fills an empty column, and the value read back
 *     afterwards is the one that is used, so two simultaneous first purchases
 *     settle on one customer.
 *
 * Keyed by owner, never by email, so changing an email address can never mint a
 * second identity for the same person.
 */

export type CustomerStore = {
  readCustomerId(userId: string): Promise<string | null>
  /** Set the id only if none is set; return whichever id is now stored. */
  claimCustomerId(userId: string, customerId: string): Promise<string>
}

export type CustomerIdentity = { id: string; email?: string | null }

export async function ensureStripeCustomer(
  stripe: Pick<Stripe, 'customers'>,
  store: CustomerStore,
  identity: CustomerIdentity
): Promise<string> {
  const existing = await store.readCustomerId(identity.id)
  if (existing) return existing

  const customer = await stripe.customers.create(
    {
      email: identity.email || undefined,
      metadata: { abc_user_id: identity.id },
    },
    { idempotencyKey: `abc-customer-${identity.id}` }
  )

  return store.claimCustomerId(identity.id, customer.id)
}

/** The production store, over the service-role client. */
export function profileCustomerStore(db: SupabaseClient): CustomerStore {
  return {
    async readCustomerId(userId) {
      const { data, error } = await db
        .from('abc_profiles')
        .select('stripe_customer_id')
        .eq('id', userId)
        .maybeSingle()
      if (error) throw new Error(`customer_read_failed:${error.code ?? 'unknown'}`)
      const value = (data as { stripe_customer_id?: string | null } | null)?.stripe_customer_id
      return value && value.trim() ? value : null
    },

    async claimCustomerId(userId, customerId) {
      const { error } = await db
        .from('abc_profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId)
        .is('stripe_customer_id', null)
      if (error) throw new Error(`customer_claim_failed:${error.code ?? 'unknown'}`)

      const stored = await this.readCustomerId(userId)
      if (!stored) throw new Error('customer_claim_failed:no_profile')
      return stored
    },
  }
}
