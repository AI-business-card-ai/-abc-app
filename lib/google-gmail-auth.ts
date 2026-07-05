import { createServiceClient } from '@/lib/supabase/service'
import { formatSupabaseError, toThrownError } from '@/lib/supabase-errors'

export const GOOGLE_RECONNECT_CODE = 'RECONNECT_GOOGLE'

export class GoogleReconnectRequiredError extends Error {
  code = GOOGLE_RECONNECT_CODE

  constructor(message = 'Email session expired. Please reconnect your email account in Settings.') {
    super(message)
    this.name = 'GoogleReconnectRequiredError'
  }
}

type GoogleTokenResponse = {
  access_token: string
  expires_in?: number
  refresh_token?: string
  error?: string
  error_description?: string
}

function getGoogleOAuthCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials are not configured')
  }
  return { clientId, clientSecret }
}

async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = getGoogleOAuthCredentials()

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  const data = (await res.json()) as GoogleTokenResponse

  if (!res.ok) {
    if (data.error === 'invalid_grant') {
      throw new GoogleReconnectRequiredError()
    }
    throw new Error(data.error_description || data.error || 'Failed to refresh Google token')
  }

  return data
}

async function clearGoogleConnection(userId: string) {
  const supabase = createServiceClient()
  await supabase
    .from('abc_profiles')
    .update({
      google_connected: false,
      google_refresh_token: null,
      google_access_token: null,
      google_token_expires_at: null,
    })
    .eq('id', userId)
}

async function persistGoogleTokens(
  userId: string,
  accessToken: string,
  expiresIn: number | undefined,
  refreshToken?: string
) {
  const supabase = createServiceClient()
  const expiresAt =
    expiresIn != null
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null

  const updates: Record<string, unknown> = {
    google_access_token: accessToken,
    google_token_expires_at: expiresAt,
    google_connected: true,
  }

  if (refreshToken) {
    updates.google_refresh_token = refreshToken
  }

  const { error } = await supabase.from('abc_profiles').update(updates).eq('id', userId)
  if (error) throw error
}

export async function saveGoogleOAuthTokens(
  userId: string,
  tokens: {
    accessToken?: string | null
    refreshToken?: string | null
    expiresIn?: number | null
    email?: string | null
  }
) {
  const supabase = createServiceClient()
  const updates: Record<string, unknown> = {
    google_connected: true,
  }

  if (tokens.email) updates.google_email = tokens.email
  if (tokens.accessToken) updates.google_access_token = tokens.accessToken
  if (tokens.refreshToken) updates.google_refresh_token = tokens.refreshToken
  if (tokens.expiresIn != null) {
    updates.google_token_expires_at = new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
  }

  const { error } = await supabase.from('abc_profiles').update(updates).eq('id', userId)
  if (error) {
    console.error('[saveGoogleOAuthTokens] update failed', {
      userId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    })
    throw toThrownError(error)
  }
}

export async function getGoogleAccessTokenForUser(userId: string): Promise<string> {
  const supabase = createServiceClient()
  const { data: profile, error } = await supabase
    .from('abc_profiles')
    .select('google_connected, google_refresh_token, google_access_token, google_token_expires_at')
    .eq('id', userId)
    .single()

  if (error) throw error

  if (!profile?.google_connected) {
    throw new GoogleReconnectRequiredError('Connect your email account in Settings to send via Email.')
  }

  const refreshToken = profile.google_refresh_token as string | null
  if (!refreshToken) {
    throw new GoogleReconnectRequiredError('Email refresh token missing. Please reconnect your email account.')
  }

  const expiresAt = profile.google_token_expires_at
    ? new Date(profile.google_token_expires_at as string).getTime()
    : 0
  const cachedToken = profile.google_access_token as string | null
  const bufferMs = 60_000

  if (cachedToken && expiresAt > Date.now() + bufferMs) {
    return cachedToken
  }

  try {
    const tokens = await refreshGoogleAccessToken(refreshToken)
    await persistGoogleTokens(
      userId,
      tokens.access_token,
      tokens.expires_in,
      tokens.refresh_token
    )
    return tokens.access_token
  } catch (err) {
    if (err instanceof GoogleReconnectRequiredError) {
      await clearGoogleConnection(userId)
    }
    throw err
  }
}
