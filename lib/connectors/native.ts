import { createHash, createHmac, randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { proRequiredPath, type ProFeature } from '@/lib/billing/pro-features'
import { decryptToken, encryptToken, isTokenEncryptionConfigured, KEY_ENV, safeEquals } from '@/lib/crm/encryption'
import { requirePro } from '@/lib/entitlements'
import { NATIVE_NONCE_PATTERN, hashNativeNonce } from '@/lib/native/auth-flow'
import type { AuthIdentity } from '@/lib/scan/entitlement'
import {
  NATIVE_CONNECT_ATTEMPT_PATTERN,
  NATIVE_CONNECT_CALLBACK_URL,
  NATIVE_CONNECT_HANDOFF_PATTERN,
  isNativeConnectorProvider,
  nativeConnectDestination,
  safeLocalPath,
  type NativeConnectorProvider,
  type NativeCrmProvider,
} from '@/lib/connectors/native-shared'

/**
 * Connecting Gmail or a CRM from inside the native app.
 *
 * On the web, a connection's callback proves who started it with a signed state
 * cookie and a live session in the same browser. In the app, consent happens in
 * the system browser, which has neither, so the proof moves to the server and
 * the finish moves back into the app:
 *
 *   1. start   The app, signed in inside its WebView, sends the provider and the
 *              SHA-256 of a nonce it keeps. The owner comes from the session and
 *              ABC Pro is checked. An attempt row binds owner, provider and nonce
 *              hash to the hash of a signed, opaque state; the answer is the
 *              provider's authorize URL for the system browser.
 *   2. callback The provider returns to the same callback the web flow uses.
 *              A state of this shape is taken off its attempt in one statement
 *              (so it works once), the code is exchanged, and the result is
 *              stored encrypted with the hash of a fresh handoff value. The
 *              browser is handed back to the app with the attempt id and that
 *              handoff — no token, no verifier, no owner.
 *   3. claim   The app posts attempt id, handoff and its nonce, from its
 *              signed-in WebView. Pro is checked again, then one statement
 *              releases the encrypted result only to the session owner holding
 *              both values, marks it claimed and wipes it. The connection is
 *              saved through the same functions the web callbacks use.
 *
 * What each value defends is in 20260917120000_native_connector_attempts. In
 * short: the nonce means an intercepted deep link is useless to anybody but the
 * app that started; the handoff means an attempt started by one person and
 * consented to by another can never be collected by the first; the session
 * means no other ABC account can take it; single-use statements mean neither a
 * callback nor a claim can be replayed.
 */

export const NATIVE_CONNECT_TTL_SECONDS = 10 * 60

const STATE_PREFIX = 'abcn'
const STATE_PATTERN = /^abcn\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/

export type NativeConnectorResult =
  | {
      kind: 'crm'
      provider: NativeCrmProvider
      accessToken: string
      refreshToken: string | null
      expiresAt: string | null
      remoteAccountId: string | null
      apiBaseUrl: string | null
    }
  | {
      kind: 'gmail'
      accessToken: string
      refreshToken: string
      /** Absolute, taken at the exchange: the claim can come minutes later. */
      expiresAt: string | null
      email: string | null
    }

export function proFeatureFor(provider: NativeConnectorProvider): ProFeature {
  return provider === 'google-gmail' ? 'gmail' : 'crm'
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64url')
}

function stateSignature(random: string): string {
  const key = process.env[KEY_ENV]
  if (!key) throw new Error(`${KEY_ENV} is not configured`)
  return createHmac('sha256', key).update(`native-connector-state:${random}`).digest('base64url')
}

/** Whether a callback's state belongs to the native flow. Shape only; the signature and the row decide the rest. */
export function isNativeConnectorState(state: string | null | undefined): boolean {
  return typeof state === 'string' && STATE_PATTERN.test(state)
}

function mintState(): string {
  const random = randomBytes(32).toString('base64url')
  return `${STATE_PREFIX}.${random}.${stateSignature(random)}`
}

function stateIsSigned(state: string): boolean {
  const match = STATE_PATTERN.exec(state)
  if (!match) return false
  try {
    return safeEquals(match[2], stateSignature(match[1]))
  } catch {
    return false
  }
}

type RpcRow<T> = T[] | T | null
function firstRow<T>(data: RpcRow<T>): T | null {
  if (Array.isArray(data)) return data[0] ?? null
  return data ?? null
}

// ───────────────────────────── start ─────────────────────────────

export type AuthorizeUrlBuilder = (
  provider: NativeConnectorProvider,
  state: string,
  pkceChallenge: string | null
) => string | null

export type StartDeps = {
  db: SupabaseClient
  /** Null when the provider is not configured on this server. */
  authorizeUrl: AuthorizeUrlBuilder
  /** Salesforce requires PKCE; the others return null. */
  pkceFor: (provider: NativeConnectorProvider) => { verifier: string; challenge: string } | null
}

export type StartOutcome =
  | { ok: true; attemptId: string; authorizeUrl: string }
  | { ok: false; status: number; code: string; redirect?: string }

export async function startNativeConnector(
  deps: StartDeps,
  args: { identity: AuthIdentity | null; provider: unknown; nonceHash: unknown; returnTo: unknown }
): Promise<StartOutcome> {
  if (!args.identity?.id) return { ok: false, status: 401, code: 'unauthorized' }
  if (!isNativeConnectorProvider(args.provider)) return { ok: false, status: 400, code: 'invalid_request' }
  if (typeof args.nonceHash !== 'string' || !NATIVE_NONCE_PATTERN.test(args.nonceHash)) {
    return { ok: false, status: 400, code: 'invalid_request' }
  }
  const provider = args.provider

  // Pro before any provider is asked for anything, exactly as the web start routes do.
  const feature = proFeatureFor(provider)
  const gate = await requirePro(deps.db, args.identity, feature)
  if (!gate.ok) {
    return gate.status === 401
      ? { ok: false, status: 401, code: 'unauthorized' }
      : { ok: false, status: 403, code: 'pro_required', redirect: proRequiredPath(feature) }
  }

  // The state is signed and the result encrypted with the token key; no key, no flow.
  if (!isTokenEncryptionConfigured()) return { ok: false, status: 503, code: 'connector_unavailable' }

  const pkce = deps.pkceFor(provider)
  const state = mintState()
  const authorizeUrl = deps.authorizeUrl(provider, state, pkce?.challenge ?? null)
  if (!authorizeUrl) return { ok: false, status: 503, code: 'connector_unavailable' }

  const { data, error } = await deps.db.rpc('create_native_connector_attempt', {
    p_user_id: args.identity.id,
    p_provider: provider,
    p_state_hash: sha256(state),
    p_nonce_hash: args.nonceHash,
    p_pkce_verifier_encrypted: pkce ? encryptToken(pkce.verifier) : null,
    p_return_to: provider === 'google-gmail' ? safeLocalPath(args.returnTo) : null,
    p_ttl_seconds: NATIVE_CONNECT_TTL_SECONDS,
  })
  const attemptId = typeof data === 'string' ? data : null
  if (error || !attemptId) {
    console.error('[connectors/native] attempt not recorded:', error?.code ?? 'no_id')
    return { ok: false, status: 500, code: 'connector_unavailable' }
  }

  return { ok: true, attemptId, authorizeUrl }
}

// ───────────────────────────── callback ─────────────────────────────

export type ExchangeOutcome =
  | { ok: true; result: NativeConnectorResult }
  | { ok: false; code: string }

export type CallbackDeps = {
  db: SupabaseClient
  exchange: (provider: NativeConnectorProvider, code: string, verifier: string | null) => Promise<ExchangeOutcome>
}

export type HandbackTarget =
  | { kind: 'authorized'; attemptId: string; handoff: string }
  | { kind: 'cancelled' | 'failed'; attemptId: string | null }

/** The app URL the system browser opens. Never a token, a verifier, an owner or a nonce. */
export function nativeConnectHandbackUrl(target: HandbackTarget): string {
  const url = new URL(NATIVE_CONNECT_CALLBACK_URL)
  if (target.attemptId) url.searchParams.set('attempt', target.attemptId)
  if (target.kind === 'authorized') url.searchParams.set('handoff', target.handoff)
  else url.searchParams.set('result', target.kind)
  return url.toString()
}

/** Fixed vocabulary only, as the web callbacks log. */
function logStage(provider: NativeConnectorProvider, stage: string) {
  console.error(`[connectors/native/callback] provider=${provider} stage=${stage}`)
}

async function fail(db: SupabaseClient, attemptId: string, code: string) {
  const { error } = await db.rpc('fail_native_connector_attempt', { p_attempt_id: attemptId, p_failure_code: code })
  if (error) console.error('[connectors/native] failure not recorded:', error.code ?? 'unknown')
}

/**
 * The native half of a connector callback. Returns where to hand the app back
 * to; the route renders it.
 */
export async function finishNativeConnectorCallback(
  deps: CallbackDeps,
  provider: NativeConnectorProvider,
  params: { code: string | null; state: string | null; error: string | null }
): Promise<HandbackTarget> {
  if (!params.state || !stateIsSigned(params.state)) {
    logStage(provider, 'state_signature_invalid')
    return { kind: 'failed', attemptId: null }
  }

  const { data, error } = await deps.db.rpc('begin_native_connector_callback', {
    p_state_hash: sha256(params.state),
    p_provider: provider,
  })
  const attempt = firstRow(data as RpcRow<{ attempt_id: string; pkce_verifier_encrypted: string | null }>)
  if (error || !attempt?.attempt_id) {
    // Unknown, expired, already used, or issued for another provider. All the same to the browser.
    logStage(provider, error ? 'attempt_lookup_failed' : 'attempt_not_pending')
    return { kind: 'failed', attemptId: null }
  }
  const attemptId = attempt.attempt_id

  try {
    if (params.error) {
      const cancelled = params.error === 'access_denied'
      logStage(provider, cancelled ? 'provider_cancelled' : 'provider_returned_error')
      await fail(deps.db, attemptId, cancelled ? 'provider_cancelled' : 'provider_error')
      return { kind: cancelled ? 'cancelled' : 'failed', attemptId }
    }
    if (!params.code) {
      logStage(provider, 'missing_code')
      await fail(deps.db, attemptId, 'missing_code')
      return { kind: 'failed', attemptId }
    }

    const verifier = attempt.pkce_verifier_encrypted ? decryptToken(attempt.pkce_verifier_encrypted) : null
    const exchanged = await deps.exchange(provider, params.code, verifier)
    if (!exchanged.ok) {
      logStage(provider, exchanged.code)
      await fail(deps.db, attemptId, exchanged.code)
      return { kind: 'failed', attemptId }
    }

    const handoff = randomBytes(32).toString('base64url')
    const { data: stored, error: storeError } = await deps.db.rpc('complete_native_connector_callback', {
      p_attempt_id: attemptId,
      p_result_encrypted: encryptToken(JSON.stringify(exchanged.result)),
      p_handoff_hash: sha256(handoff),
    })
    if (storeError || stored !== true) {
      logStage(provider, 'result_not_stored')
      await fail(deps.db, attemptId, 'result_not_stored')
      return { kind: 'failed', attemptId }
    }

    return { kind: 'authorized', attemptId, handoff }
  } catch (err) {
    logStage(provider, `unexpected_${err instanceof Error ? err.constructor.name : 'error'}`)
    await fail(deps.db, attemptId, 'unexpected_error').catch(() => undefined)
    return { kind: 'failed', attemptId }
  }
}

// ───────────────────────────── claim ─────────────────────────────

export type PersistDeps = {
  saveCrm: (args: {
    ownerId: string
    provider: NativeCrmProvider
    accessToken: string
    refreshToken: string | null
    expiresAt: string | null
    remoteAccountId: string | null
    apiBaseUrl: string | null
  }) => Promise<boolean>
  saveGmail: (
    ownerId: string,
    tokens: { accessToken: string; refreshToken: string; expiresIn: number | null; email: string | null }
  ) => Promise<void>
}

export type ClaimOutcome =
  | { ok: true; provider: NativeConnectorProvider; redirect: string }
  | { ok: false; status: number; code: string; redirect?: string }

function parseResult(provider: NativeConnectorProvider, plaintext: string | null): NativeConnectorResult | null {
  if (!plaintext) return null
  try {
    const value = JSON.parse(plaintext) as NativeConnectorResult
    if (provider === 'google-gmail') {
      return value?.kind === 'gmail' && typeof value.accessToken === 'string' && typeof value.refreshToken === 'string' ? value : null
    }
    return value?.kind === 'crm' && value.provider === provider && typeof value.accessToken === 'string' ? value : null
  } catch {
    return null
  }
}

export async function claimNativeConnector(
  deps: { db: SupabaseClient; persist: PersistDeps; now?: () => number },
  args: { identity: AuthIdentity | null; attemptId: unknown; nonce: unknown; handoff: unknown }
): Promise<ClaimOutcome> {
  if (!args.identity?.id) return { ok: false, status: 401, code: 'unauthorized' }
  if (
    typeof args.attemptId !== 'string' ||
    !NATIVE_CONNECT_ATTEMPT_PATTERN.test(args.attemptId) ||
    typeof args.nonce !== 'string' ||
    !NATIVE_NONCE_PATTERN.test(args.nonce) ||
    typeof args.handoff !== 'string' ||
    !NATIVE_CONNECT_HANDOFF_PATTERN.test(args.handoff)
  ) {
    return { ok: false, status: 400, code: 'invalid_request' }
  }
  const ownerId = args.identity.id

  // Which provider, so Pro can be checked before anything is released. Scoped
  // to the session owner: another account's attempt reads as no attempt.
  const { data: rows, error: readError } = await deps.db
    .from('native_connector_attempts')
    .select('provider')
    .eq('id', args.attemptId)
    .eq('user_id', ownerId)
  const provider = (rows as { provider?: string }[] | null)?.[0]?.provider
  if (readError || !isNativeConnectorProvider(provider)) return { ok: false, status: 400, code: 'claim_failed' }

  const feature = proFeatureFor(provider)
  const gate = await requirePro(deps.db, args.identity, feature)
  if (!gate.ok) return { ok: false, status: 403, code: 'pro_required', redirect: proRequiredPath(feature) }

  if (!isTokenEncryptionConfigured()) {
    return { ok: false, status: 503, code: 'connector_unavailable', redirect: nativeConnectDestination(provider, null, 'error') }
  }

  const { data, error } = await deps.db.rpc('claim_native_connector_attempt', {
    p_attempt_id: args.attemptId,
    p_user_id: ownerId,
    p_nonce_hash: hashNativeNonce(args.nonce),
    p_handoff_hash: sha256(args.handoff),
  })
  const claimed = firstRow(data as RpcRow<{ provider: string; result_encrypted: string | null; return_to: string | null }>)
  if (error || !claimed || claimed.provider !== provider) {
    return { ok: false, status: 400, code: 'claim_failed', redirect: nativeConnectDestination(provider, null, 'error') }
  }

  const returnTo = claimed.return_to
  const result = parseResult(provider, decryptToken(claimed.result_encrypted))
  if (!result) {
    console.error('[connectors/native/claim] result unreadable:', provider)
    return { ok: false, status: 500, code: 'connect_failed', redirect: nativeConnectDestination(provider, returnTo, 'error') }
  }

  try {
    if (result.kind === 'crm') {
      const saved = await deps.persist.saveCrm({
        ownerId,
        provider: result.provider,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: result.expiresAt,
        remoteAccountId: result.remoteAccountId,
        apiBaseUrl: result.apiBaseUrl,
      })
      if (!saved) throw new Error('connection_save_failed')
    } else {
      const now = deps.now ? deps.now() : Date.now()
      const expiresIn = result.expiresAt ? Math.max(0, Math.floor((Date.parse(result.expiresAt) - now) / 1000)) : null
      await deps.persist.saveGmail(ownerId, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: Number.isFinite(expiresIn) ? expiresIn : null,
        email: result.email,
      })
    }
  } catch (err) {
    console.error('[connectors/native/claim] save failed:', provider, err instanceof Error ? err.constructor.name : 'unknown')
    return { ok: false, status: 500, code: 'connect_failed', redirect: nativeConnectDestination(provider, returnTo, 'error') }
  }

  return { ok: true, provider, redirect: nativeConnectDestination(provider, returnTo, 'connected') }
}
