import { createHmac } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Rate limiting for endpoints anyone on the internet can call.
 *
 * The previous implementation was a `Map` in module scope. That works on one
 * long-lived server and not at all on Vercel, where each request may land on a
 * different instance and every instance forgets on cold start — so the limit it
 * advertised was never the limit it enforced. The counter now lives in Postgres,
 * which is the only thing all the instances share.
 *
 * The key never contains an address. An IP is personal data and a rate-limit
 * table is not the place for a log of who visited whose card, so the caller's
 * identity is HMAC'd with a server-side secret before it leaves this file. The
 * hash is one-way and salted per deployment: it can tell two requests apart
 * without saying who either of them was.
 */

/** Server-only. Absent means this file cannot do its job — see `consumeRateLimit`. */
const SECRET_ENV = 'EXCHANGE_RATE_LIMIT_SALT'

export type RateLimitOutcome =
  /** Inside the limit; the hit was recorded. */
  | { allowed: true }
  /** Over the limit. */
  | { allowed: false; reason: 'limited' }
  /**
   * The limiter could not run — no secret, or the counter is unreachable.
   *
   * Deliberately distinct from `limited`, and deliberately not `allowed`. A
   * limiter that fails open is a limiter that an attacker only has to break
   * once; the caller refuses the request instead, loudly enough to be noticed
   * in logs rather than silently serving an unprotected endpoint.
   */
  | { allowed: false; reason: 'unavailable' }

/**
 * A stable, opaque key for one caller against one target.
 *
 * Both halves matter. Keying on the subject alone would let one visitor at a
 * busy stand exhaust the quota for a card they are not using; keying on the
 * target alone would let a single script lock every visitor out of a card by
 * spending its budget. Together, the limit is "this subject, against this card".
 *
 * `scope` separates the namespaces. Without it an address and an IP address
 * that happened to serialise identically would share a counter, and a layer
 * meant to bound one thing would silently bound another.
 */
export function rateLimitBucket(scope: string, subject: string, target: string): string | null {
  const secret = process.env[SECRET_ENV]
  if (!secret) return null

  return createHmac('sha256', secret)
    .update(`${scope}:${subject}:${target}`)
    .digest('hex')
    .slice(0, 48)
}

/** One band of the policy: what is being counted, and how much of it is allowed. */
export type RateLimitLayer = {
  /** Namespace. Two layers must never share one. */
  scope: string
  /** Whatever this layer counts — an address, an IP, or nothing for a global cap. */
  subject: string
  windowSeconds: number
  maxHits: number
}

/**
 * Claim one unit of quota.
 *
 * The counting, the window reset and the comparison all happen inside the
 * database function, in one statement, so two simultaneous requests cannot both
 * observe the same count and both be allowed.
 */
export async function consumeRateLimit(
  supabase: SupabaseClient,
  args: RateLimitLayer & { target: string }
): Promise<RateLimitOutcome> {
  const bucket = rateLimitBucket(args.scope, args.subject, args.target)

  if (!bucket) {
    console.error(`[rate-limit] ${SECRET_ENV} is not set; refusing to serve unprotected`)
    return { allowed: false, reason: 'unavailable' }
  }

  const { data, error } = await supabase.rpc('consume_public_rate_limit', {
    p_bucket: bucket,
    p_window_seconds: args.windowSeconds,
    p_max_hits: args.maxHits,
  })

  if (error) {
    // The code, never the message: a database error can quote the statement.
    console.error('[rate-limit] counter unavailable:', error.code ?? 'unknown')
    return { allowed: false, reason: 'unavailable' }
  }

  return data === true ? { allowed: true } : { allowed: false, reason: 'limited' }
}

/**
 * Every layer of the policy, in order, stopping at the first refusal.
 *
 * Layers exist because one number cannot describe this traffic. A trade-show
 * hall puts a whole floor behind one public address — venue Wi-Fi, corporate
 * Wi-Fi and carrier CGNAT all collapse many real people into one IP — so a tight
 * per-IP cap does not stop an attacker, it stops the sixth genuine visitor to a
 * stand. So the per-IP band is loose enough to survive a shared address, a tight
 * band keyed on the receiver's own email stops the same person submitting over
 * and over, and a high per-card ceiling bounds a distributed flood that neither
 * of the first two would see.
 *
 * Order is deterministic and chosen: the narrowest, cheapest signal first, the
 * card-wide ceiling last. A request refused at the email band therefore never
 * spends the card's global budget, so one replaying visitor cannot walk a card
 * towards its ceiling and lock out everybody else.
 *
 * Each layer is its own atomic statement. A refusal partway through leaves the
 * earlier counters incremented, which is intended — the attempt happened.
 */
export async function consumeRateLimits(
  supabase: SupabaseClient,
  target: string,
  layers: RateLimitLayer[]
): Promise<RateLimitOutcome> {
  for (const layer of layers) {
    const outcome = await consumeRateLimit(supabase, { ...layer, target })
    if (!outcome.allowed) return outcome
  }
  return { allowed: true }
}
