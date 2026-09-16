import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Disconnect the Gmail connector for one owner.
 *
 * This is the mailbox grant ("send from this Gmail"), and nothing else. Signing
 * in with Google is an identity on the auth user and is not touched here: no
 * auth call is made, no session is ended, the account's own email is left alone.
 *
 * Order is the point:
 *
 *   1. Read the stored token, so revocation has something to send.
 *   2. Clear the grant locally — flag, mailbox address, both tokens, expiry — in
 *      one owner-scoped update. If this fails, nothing else happens and the
 *      caller is told so.
 *   3. Ask Google to revoke the token, best effort, with the value read in step
 *      1. Google being slow, down or refusing cannot put the token back: it is
 *      already gone from ABC. A token Google did not revoke still stops working
 *      for ABC, which no longer holds it, and the owner can remove the grant at
 *      myaccount.google.com/permissions.
 *
 * No Pro check: taking access away must work for everyone, including after Pro
 * has lapsed. Reconnecting goes through the normal connector again.
 */

export const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'
const REVOKE_TIMEOUT_MS = 5_000

export type GmailRevoker = (token: string) => Promise<boolean>

/**
 * Google's OAuth 2.0 revocation endpoint. The token goes in the POST body, never
 * the URL, so it cannot land in a request log. Revoking a refresh token revokes
 * the grant, access tokens included.
 */
export const revokeGoogleToken: GmailRevoker = async (token) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REVOKE_TIMEOUT_MS)
  try {
    const res = await fetch(GOOGLE_REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
      signal: controller.signal,
      cache: 'no-store',
    })
    return res.ok
  } finally {
    clearTimeout(timer)
  }
}

export type GmailDisconnectResult =
  | { ok: true; revoked: boolean }
  | { ok: false; code: 'disconnect_failed' }

export async function disconnectGmail(
  deps: { db: SupabaseClient; revoke?: GmailRevoker },
  ownerId: string
): Promise<GmailDisconnectResult> {
  const { data, error: readError } = await deps.db
    .from('abc_profiles')
    .select('google_refresh_token, google_access_token')
    .eq('id', ownerId)
    .maybeSingle()
  if (readError) {
    console.error('[gmail/disconnect] read failed:', readError.code ?? 'unknown')
    return { ok: false, code: 'disconnect_failed' }
  }

  const stored = data as { google_refresh_token?: string | null; google_access_token?: string | null } | null
  const token = stored?.google_refresh_token || stored?.google_access_token || null

  const { error: clearError } = await deps.db
    .from('abc_profiles')
    .update({
      google_connected: false,
      google_email: null,
      google_refresh_token: null,
      google_access_token: null,
      google_token_expires_at: null,
    })
    .eq('id', ownerId)
  if (clearError) {
    console.error('[gmail/disconnect] clear failed:', clearError.code ?? 'unknown')
    return { ok: false, code: 'disconnect_failed' }
  }

  if (!token) return { ok: true, revoked: false }

  let revoked = false
  try {
    revoked = await (deps.revoke ?? revokeGoogleToken)(token)
  } catch (err) {
    console.error('[gmail/disconnect] revoke failed:', err instanceof Error ? err.name : 'unknown')
  }
  return { ok: true, revoked }
}
