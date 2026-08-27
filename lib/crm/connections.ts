import { createServerSupabase } from '@/lib/supabase'
import { decryptToken, encryptToken } from '@/lib/crm/encryption'

/**
 * Where CRM credentials live. Server only.
 *
 * `crm_connections` is reachable exclusively through the service role: the
 * `authenticated` role has no privileges on it at all, so a signed-in user
 * cannot read their own tokens through PostgREST the way they can read every
 * other column of their profile. That is deliberate. Row-level security decides
 * which rows a role may see; it does not stop a role from selecting a column it
 * has been granted, and OAuth tokens should not depend on the frontend
 * remembering not to ask.
 *
 * Nothing in this file returns a token to a caller that has not asked for one
 * explicitly, and nothing in it is importable from a browser bundle without the
 * service key, which does not exist there.
 */

export type CrmProvider = 'hubspot' | 'pipedrive'

export type CrmConnection = {
  id: string
  userId: string
  provider: CrmProvider
  remoteAccountId: string | null
  accessToken: string
  refreshToken: string | null
  expiresAt: string | null
  scopes: string[]
  connectedAt: string | null
  needsReconnect: boolean
  /**
   * The API origin for this connection, when the provider gives each account
   * its own. Pipedrive does; HubSpot serves everybody from one host and leaves
   * this null rather than inventing a value.
   */
  apiBaseUrl: string | null
}

/** Everything a browser is allowed to know about a connection. */
export type CrmConnectionStatus = {
  provider: CrmProvider
  connected: boolean
  remoteAccountId: string | null
  connectedAt: string | null
  needsReconnect: boolean
}

type Row = {
  id: string
  user_id: string
  provider: string
  remote_account_id: string | null
  access_token_encrypted: string
  refresh_token_encrypted: string | null
  token_expires_at: string | null
  scopes: string[] | null
  connected_at: string | null
  needs_reconnect: boolean | null
  remote_api_base_url: string | null
}

/**
 * The connection with its tokens decrypted, or null.
 *
 * Owner-scoped in the query even though the service role bypasses RLS —
 * precisely because it bypasses RLS. The filter is the only thing standing
 * between this call and another customer's CRM.
 */
export async function getCrmConnection(
  ownerId: string,
  provider: CrmProvider
): Promise<CrmConnection | null> {
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('crm_connections')
    .select('*')
    .eq('user_id', ownerId)
    .eq('provider', provider)
    .maybeSingle()

  if (error || !data) return null

  const row = data as Row
  const accessToken = decryptToken(row.access_token_encrypted)

  // A token that will not decrypt is a token we do not have: wrong key, rotated
  // secret, altered row. Reconnecting is the only honest answer.
  if (!accessToken) return null

  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider as CrmProvider,
    remoteAccountId: row.remote_account_id,
    accessToken,
    refreshToken: decryptToken(row.refresh_token_encrypted),
    expiresAt: row.token_expires_at,
    scopes: row.scopes ?? [],
    connectedAt: row.connected_at,
    needsReconnect: Boolean(row.needs_reconnect),
    apiBaseUrl: row.remote_api_base_url,
  }
}

/**
 * Connection state for a screen.
 *
 * Reads the same row but returns none of its secrets — not the tokens, not the
 * ciphertext, not the expiry. A page that only needs to render "Connected"
 * should not be handed the means to act as the customer.
 */
export async function getCrmConnectionStatus(
  ownerId: string,
  provider: CrmProvider
): Promise<CrmConnectionStatus> {
  const supabase = createServerSupabase()

  const { data } = await supabase
    .from('crm_connections')
    .select('remote_account_id, connected_at, needs_reconnect')
    .eq('user_id', ownerId)
    .eq('provider', provider)
    .maybeSingle()

  if (!data) {
    return { provider, connected: false, remoteAccountId: null, connectedAt: null, needsReconnect: false }
  }

  return {
    provider,
    connected: true,
    remoteAccountId: (data.remote_account_id as string | null) ?? null,
    connectedAt: (data.connected_at as string | null) ?? null,
    needsReconnect: Boolean(data.needs_reconnect),
  }
}

/**
 * Store or replace a connection.
 *
 * Tokens are encrypted here rather than by the caller, so there is one place
 * where a plaintext credential can reach the database and it is this function
 * choosing not to. Upserted on (user_id, provider): reconnecting replaces the
 * credentials instead of accumulating rows.
 */
export async function saveCrmConnection(args: {
  ownerId: string
  provider: CrmProvider
  accessToken: string
  refreshToken?: string | null
  expiresAt?: string | null
  remoteAccountId?: string | null
  scopes?: string[]
  /** Pipedrive's per-account API origin. Omitted by providers that have one host. */
  apiBaseUrl?: string | null
}): Promise<boolean> {
  const supabase = createServerSupabase()

  const { error } = await supabase.from('crm_connections').upsert(
    {
      user_id: args.ownerId,
      provider: args.provider,
      remote_account_id: args.remoteAccountId ?? null,
      access_token_encrypted: encryptToken(args.accessToken),
      refresh_token_encrypted: args.refreshToken ? encryptToken(args.refreshToken) : null,
      token_expires_at: args.expiresAt ?? null,
      scopes: args.scopes ?? [],
      remote_api_base_url: args.apiBaseUrl ?? null,
      connected_at: new Date().toISOString(),
      needs_reconnect: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider' }
  )

  if (error) {
    // The error may quote the row. Log that it failed, never what was in it.
    console.error('[crm] connection save failed:', error.code ?? 'unknown')
    return false
  }
  return true
}

/**
 * Update the credentials after a refresh, leaving the rest of the row alone.
 */
export async function updateCrmTokens(args: {
  ownerId: string
  provider: CrmProvider
  accessToken: string
  refreshToken?: string | null
  expiresAt?: string | null
  apiBaseUrl?: string | null
}): Promise<boolean> {
  const supabase = createServerSupabase()

  const payload: Record<string, unknown> = {
    access_token_encrypted: encryptToken(args.accessToken),
    token_expires_at: args.expiresAt ?? null,
    needs_reconnect: false,
    updated_at: new Date().toISOString(),
  }

  // Pipedrive returns the account's API domain on every refresh, because it can
  // change. Taking the new one is the whole point of it being sent again.
  if (args.apiBaseUrl) payload.remote_api_base_url = args.apiBaseUrl

  // Providers may hand back a new refresh token; assuming otherwise is how an
  // integration silently dies weeks later.
  if (args.refreshToken) payload.refresh_token_encrypted = encryptToken(args.refreshToken)

  const { error } = await supabase
    .from('crm_connections')
    .update(payload)
    .eq('user_id', args.ownerId)
    .eq('provider', args.provider)

  if (error) {
    console.error('[crm] token update failed:', error.code ?? 'unknown')
    return false
  }
  return true
}

/**
 * Say the connection is broken rather than pretending it works.
 *
 * The row is kept so the UI can explain what happened and offer a reconnect;
 * the tokens are cleared because a refresh token that no longer refreshes is a
 * secret with no remaining purpose.
 */
export async function markConnectionNeedsReconnect(
  ownerId: string,
  provider: CrmProvider
): Promise<void> {
  const supabase = createServerSupabase()
  await supabase
    .from('crm_connections')
    .update({
      needs_reconnect: true,
      access_token_encrypted: '',
      refresh_token_encrypted: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', ownerId)
    .eq('provider', provider)
}

/** Forget the connection locally. Nothing is deleted in the provider's account. */
export async function deleteCrmConnection(ownerId: string, provider: CrmProvider): Promise<void> {
  const supabase = createServerSupabase()
  await supabase.from('crm_connections').delete().eq('user_id', ownerId).eq('provider', provider)
}
