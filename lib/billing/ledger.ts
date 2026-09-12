import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The Smart Scan credit ledger, from the application's side.
 *
 * Every economic decision is made inside Postgres (see the
 * `20260912120000_smart_scan_credit_ledger` migration): the balance check, the
 * write, the idempotency and the no-negative guarantee all happen in one locked
 * statement per call. This file only names things — which key a card spends
 * under, which key a purchase grants under — and translates the answers.
 *
 * Only the server calls any of this, with the service-role client. The functions
 * are not executable by `authenticated`, so a browser cannot reach them even by
 * speaking to PostgREST directly.
 */

type Env = Record<string, string | undefined>

/**
 * Whether the ledger is authoritative.
 *
 * Off by default, and that is the transition plan rather than a hedge: the code
 * can ship before the migration is applied without any production behaviour
 * changing, the migration can be applied and verified with the legacy counters
 * still serving, and switching this on is the single, reversible step that makes
 * the ledger the source of truth.
 */
export function ledgerEnabled(env: Env = process.env): boolean {
  return (env.SMART_SCAN_LEDGER || '').trim().toLowerCase() === 'on'
}

export type LedgerSource = 'stripe_checkout' | 'legacy_bridge' | 'single_scan' | 'batch_item' | 'manual'

/**
 * The idempotency keys. One place, so two callers can never spell the same fact
 * two different ways and charge it twice.
 */
export const ledgerKeys = {
  /** A paid Checkout Session grants once, whichever event reports it. */
  checkout: (sessionId: string) => `stripe:checkout:${sessionId}`,
  /** A physical card in a Multi-Card batch spends once, however often it is saved. */
  batchItem: (itemId: string) => `batch_item:${itemId}`,
  /** A single-card read spends once per image, however often the upload is retried. */
  singleScan: (digest: string) => `single_scan:${digest}`,
  /** The legacy counters are carried across once per owner. */
  legacyOpening: (userId: string) => `legacy_opening:${userId}`,
}

/**
 * The identity of a single-card read, derived on the server from what was read.
 *
 * Single-card scanning persists nothing at read time — the contact exists only
 * after review — so there is no row id to key on at the moment the credit is
 * spent. The image itself is stable across a retried upload (the client sends
 * the same compressed bytes), so its digest, bound to the owner, is. A new photo
 * is a new read and a new credit, which is what it costs.
 *
 * Hashes only. Neither the image nor anything derived from its content that could
 * identify the person on the card is stored.
 */
export function singleScanDigest(ownerId: string, image: Uint8Array): string {
  const imageHash = createHash('sha256').update(image).digest('hex')
  return createHash('sha256').update(`${ownerId}:${imageHash}`).digest('hex')
}

type RpcRow<T> = T[] | T | null

function firstRow<T>(data: RpcRow<T>): T | null {
  if (Array.isArray(data)) return data[0] ?? null
  return data ?? null
}

/** The owner's balance, or null when the ledger could not be read. */
export async function getScanCreditBalance(db: SupabaseClient, userId: string): Promise<number | null> {
  const { data, error } = await db.rpc('scan_credit_balance', { p_user_id: userId })
  if (error) {
    console.error('[billing/ledger] balance unavailable:', error.code ?? 'unknown')
    return null
  }
  const value = typeof data === 'number' ? data : Number(data)
  return Number.isFinite(value) ? value : null
}

export type GrantArgs = {
  userId: string
  amount: number
  kind: 'grant' | 'opening_balance'
  source: LedgerSource
  sourceRef: string | null
  productKey: string | null
  idempotencyKey: string
  metadata?: Record<string, unknown>
}

/**
 * Add credits. Throws when the ledger cannot be written, because every caller of
 * a grant is a webhook or a bridge that must be retried rather than told "done".
 */
export async function grantScanCredits(
  db: SupabaseClient,
  args: GrantArgs
): Promise<{ granted: boolean; balance: number }> {
  const { data, error } = await db.rpc('grant_scan_credits', {
    p_user_id: args.userId,
    p_amount: args.amount,
    p_kind: args.kind,
    p_source: args.source,
    p_source_ref: args.sourceRef,
    p_product_key: args.productKey,
    p_idempotency_key: args.idempotencyKey,
    p_metadata: args.metadata ?? {},
  })

  if (error) {
    throw new Error(`ledger_grant_failed:${error.code ?? 'unknown'}`)
  }

  const row = firstRow(data as RpcRow<{ granted: boolean; balance: number }>)
  if (!row) throw new Error('ledger_grant_failed:no_row')
  return { granted: Boolean(row.granted), balance: Number(row.balance) }
}

export type ConsumeOutcome = 'consumed' | 'already_consumed' | 'insufficient' | 'error'

export type ConsumeArgs = {
  userId: string
  source: 'single_scan' | 'batch_item'
  sourceRef: string
  idempotencyKey: string
  metadata?: Record<string, unknown>
}

/** Spend one credit for one accepted card, at most once per key. */
export async function consumeScanCredit(
  db: SupabaseClient,
  args: ConsumeArgs
): Promise<{ outcome: ConsumeOutcome; balance: number | null }> {
  const { data, error } = await db.rpc('consume_scan_credit', {
    p_user_id: args.userId,
    p_source: args.source,
    p_source_ref: args.sourceRef,
    p_idempotency_key: args.idempotencyKey,
    p_metadata: args.metadata ?? {},
  })

  if (error) {
    console.error('[billing/ledger] consume failed:', error.code ?? 'unknown')
    return { outcome: 'error', balance: null }
  }

  const row = firstRow(data as RpcRow<{ outcome: string; balance: number }>)
  const outcome = row?.outcome
  if (outcome === 'consumed' || outcome === 'already_consumed' || outcome === 'insufficient') {
    return { outcome, balance: Number(row?.balance) }
  }
  return { outcome: 'error', balance: null }
}

/**
 * Carry the legacy plan counters into the ledger, exactly once per owner.
 *
 * Deterministic and lazy: the amount is what the legacy counters say remains at
 * the moment the ledger first answers for this owner, written under one key per
 * owner, so running it twice — or from two requests at once — records it once.
 * Zero is recorded too, because "this owner had nothing left" is the fact that
 * stops the bridge from ever running again with different numbers.
 *
 * Unmetered owners never come here: the founder and exempt accounts do not have
 * a balance to carry.
 */
export async function ensureLegacyOpeningBalance(
  db: SupabaseClient,
  userId: string,
  legacyRemaining: number
): Promise<void> {
  const amount = Number.isFinite(legacyRemaining) ? Math.max(0, Math.floor(legacyRemaining)) : 0
  await grantScanCredits(db, {
    userId,
    amount,
    kind: 'opening_balance',
    source: 'legacy_bridge',
    sourceRef: null,
    productKey: null,
    idempotencyKey: ledgerKeys.legacyOpening(userId),
    metadata: { bridged_from: 'abc_profiles.scans_used' },
  })
}
