import Stripe from 'stripe'

/**
 * Stripe, server side, created only when something needs it.
 *
 * The legacy routes build a client at import time from `STRIPE_SECRET_KEY!`,
 * which turns a missing key into a crash at the first import rather than an
 * answer. Nothing in the billing layer does that: configuration is read when a
 * request asks for it, and a missing value is returned as a named reason the
 * caller can turn into an honest response.
 *
 * Free ABC never reaches this file. Cards, sharing, scanning with credits and
 * the founder all work with Stripe entirely unconfigured.
 */

type Env = Record<string, string | undefined>

export type StripeConfig = {
  secretKey: string
  webhookSecret: string | null
  /** The canonical app origin, for Checkout redirects. Never a request header. */
  appOrigin: string | null
}

export type StripeConfigResult =
  | { ok: true; config: StripeConfig }
  /** Names of what is missing. Never values. */
  | { ok: false; missing: string[] }

export function readStripeConfig(env: Env = process.env): StripeConfigResult {
  const secretKey = (env.STRIPE_SECRET_KEY || '').trim()
  if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(secretKey)) {
    return { ok: false, missing: ['STRIPE_SECRET_KEY'] }
  }

  const webhookSecret = (env.STRIPE_WEBHOOK_SECRET || '').trim()
  const origin = (env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '')

  return {
    ok: true,
    config: {
      secretKey,
      webhookSecret: /^whsec_[A-Za-z0-9]+$/.test(webhookSecret) ? webhookSecret : null,
      appOrigin: /^https?:\/\/[^/\s]+$/.test(origin) ? origin : null,
    },
  }
}

const clients = new Map<string, Stripe>()

/** One client per key for the life of the instance. */
export function stripeClient(secretKey: string): Stripe {
  let client = clients.get(secretKey)
  if (!client) {
    client = new Stripe(secretKey, {
      // Pinned to the version the installed SDK was generated against, so an
      // account-level API upgrade in the Dashboard cannot change these payloads.
      apiVersion: '2025-02-24.acacia',
      appInfo: { name: 'ABC Card' },
    })
    clients.set(secretKey, client)
  }
  return client
}
