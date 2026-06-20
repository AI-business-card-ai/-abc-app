import { createServerSupabase } from '@/lib/supabase'

const HUBSPOT_SCOPES = 'crm.objects.contacts.write crm.objects.contacts.read'

export function getHubSpotRedirectUri(): string {
  return (
    process.env.HUBSPOT_REDIRECT_URI ||
    'https://abc-app-e45x.vercel.app/api/auth/hubspot/callback'
  )
}

export function getHubSpotAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.HUBSPOT_CLIENT_ID!,
    redirect_uri: getHubSpotRedirectUri(),
    scope: HUBSPOT_SCOPES,
    response_type: 'code',
    state,
  })
  return `https://app.hubspot.com/oauth/authorize?${params.toString()}`
}

type HubSpotTokens = {
  access_token: string
  refresh_token: string
  expires_in?: number
}

async function exchangeHubSpotCode(code: string): Promise<HubSpotTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.HUBSPOT_CLIENT_ID!,
    client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
    redirect_uri: getHubSpotRedirectUri(),
    code,
  })

  const res = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`HubSpot token exchange failed: ${err}`)
  }

  return res.json() as Promise<HubSpotTokens>
}

async function refreshHubSpotToken(refreshToken: string): Promise<HubSpotTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.HUBSPOT_CLIENT_ID!,
    client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
    refresh_token: refreshToken,
  })

  const res = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`HubSpot token refresh failed: ${err}`)
  }

  return res.json() as Promise<HubSpotTokens>
}

export async function getHubSpotPortalId(accessToken: string): Promise<string | null> {
  const res = await fetch(
    `https://api.hubapi.com/oauth/v1/access-tokens/${accessToken}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!res.ok) return null

  const data = (await res.json()) as { hub_id?: number }
  return data.hub_id != null ? String(data.hub_id) : null
}

export async function saveHubSpotOAuthTokens(
  userId: string,
  tokens: HubSpotTokens,
  portalId: string | null
): Promise<void> {
  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('abc_profiles')
    .update({
      hubspot_access_token: tokens.access_token,
      hubspot_refresh_token: tokens.refresh_token,
      hubspot_portal_id: portalId,
      hubspot_connected_at: new Date().toISOString(),
      hubspot_api_key: null,
    })
    .eq('id', userId)

  if (error) throw error
}

export async function disconnectHubSpot(userId: string): Promise<void> {
  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('abc_profiles')
    .update({
      hubspot_access_token: null,
      hubspot_refresh_token: null,
      hubspot_portal_id: null,
      hubspot_connected_at: null,
      hubspot_api_key: null,
    })
    .eq('id', userId)

  if (error) throw error
}

async function persistRefreshedTokens(
  userId: string,
  tokens: HubSpotTokens,
  existingRefreshToken: string
): Promise<string> {
  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('abc_profiles')
    .update({
      hubspot_access_token: tokens.access_token,
      hubspot_refresh_token: tokens.refresh_token || existingRefreshToken,
    })
    .eq('id', userId)

  if (error) throw error
  return tokens.access_token
}

async function postHubSpotContact(
  accessToken: string,
  contact: {
    name: string
    email?: string
    phone?: string
    company?: string
    position?: string
  }
): Promise<{ ok: boolean; status: number }> {
  const [firstname, ...rest] = (contact.name || '').split(' ')
  const lastname = rest.join(' ') || ''

  const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      properties: {
        firstname: firstname || '',
        lastname: lastname || '',
        email: contact.email || '',
        phone: contact.phone || '',
        company: contact.company || '',
        jobtitle: contact.position || '',
      },
    }),
  })

  return { ok: res.ok, status: res.status }
}

export async function createHubSpotContact(
  contact: {
    name: string
    email?: string
    phone?: string
    company?: string
    position?: string
  },
  userId: string
): Promise<boolean> {
  try {
    const supabase = createServerSupabase()
    const { data: profile } = await supabase
      .from('abc_profiles')
      .select('hubspot_access_token, hubspot_refresh_token')
      .eq('id', userId)
      .single()

    let accessToken = profile?.hubspot_access_token as string | undefined
    const refreshToken = profile?.hubspot_refresh_token as string | undefined

    if (!accessToken) return false

    let result = await postHubSpotContact(accessToken, contact)

    if (result.status === 409) {
      console.log('HubSpot: contact already exists')
      return true
    }

    if (result.status === 401 && refreshToken) {
      const refreshed = await refreshHubSpotToken(refreshToken)
      accessToken = await persistRefreshedTokens(userId, refreshed, refreshToken)
      result = await postHubSpotContact(accessToken, contact)

      if (result.status === 409) {
        console.log('HubSpot: contact already exists')
        return true
      }
    }

    if (!result.ok) {
      console.error('HubSpot sync failed with status:', result.status)
      return false
    }

    console.log('HubSpot: contact created successfully')
    return true
  } catch (e) {
    console.error('HubSpot sync error:', e)
    return false
  }
}

export { exchangeHubSpotCode }
