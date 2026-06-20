import { createServerSupabase } from '@/lib/supabase'

const SALESFORCE_SCOPES = 'api refresh_token offline_access'

export function getSalesforceRedirectUri(): string {
  return (
    process.env.SALESFORCE_REDIRECT_URI ||
    'https://abc-app-e45x.vercel.app/api/auth/salesforce/callback'
  )
}

export function getSalesforceAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SALESFORCE_CLIENT_ID!,
    redirect_uri: getSalesforceRedirectUri(),
    scope: SALESFORCE_SCOPES,
    state,
  })
  return `https://test.salesforce.com/services/oauth2/authorize?${params.toString()}`
}

type SalesforceTokens = {
  access_token: string
  refresh_token?: string
  instance_url: string
}

async function exchangeSalesforceCode(code: string): Promise<SalesforceTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.SALESFORCE_CLIENT_ID!,
    client_secret: process.env.SALESFORCE_CLIENT_SECRET!,
    redirect_uri: getSalesforceRedirectUri(),
    code,
  })

  const res = await fetch('https://test.salesforce.com/services/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Salesforce token exchange failed: ${err}`)
  }

  return res.json() as Promise<SalesforceTokens>
}

async function refreshSalesforceToken(refreshToken: string): Promise<SalesforceTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.SALESFORCE_CLIENT_ID!,
    client_secret: process.env.SALESFORCE_CLIENT_SECRET!,
    refresh_token: refreshToken,
  })

  const res = await fetch('https://test.salesforce.com/services/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Salesforce token refresh failed: ${err}`)
  }

  return res.json() as Promise<SalesforceTokens>
}

export async function saveSalesforceOAuthTokens(
  userId: string,
  tokens: SalesforceTokens
): Promise<void> {
  const supabase = createServerSupabase()
  const update: Record<string, string | null> = {
    salesforce_access_token: tokens.access_token,
    salesforce_instance_url: tokens.instance_url,
    salesforce_connected_at: new Date().toISOString(),
  }

  if (tokens.refresh_token) {
    update.salesforce_refresh_token = tokens.refresh_token
  }

  const { error } = await supabase.from('abc_profiles').update(update).eq('id', userId)

  if (error) throw error
}

export async function disconnectSalesforce(userId: string): Promise<void> {
  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('abc_profiles')
    .update({
      salesforce_access_token: null,
      salesforce_refresh_token: null,
      salesforce_instance_url: null,
      salesforce_connected_at: null,
    })
    .eq('id', userId)

  if (error) throw error
}

async function persistRefreshedTokens(
  userId: string,
  tokens: SalesforceTokens,
  existingRefreshToken: string,
  existingInstanceUrl: string
): Promise<string> {
  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('abc_profiles')
    .update({
      salesforce_access_token: tokens.access_token,
      salesforce_refresh_token: tokens.refresh_token || existingRefreshToken,
      salesforce_instance_url: tokens.instance_url || existingInstanceUrl,
    })
    .eq('id', userId)

  if (error) throw error
  return tokens.access_token
}

async function postSalesforceContact(
  accessToken: string,
  instanceUrl: string,
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

  const res = await fetch(`${instanceUrl}/services/data/v58.0/sobjects/Contact/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      FirstName: firstname || '',
      LastName: lastname || 'Unknown',
      Email: contact.email || undefined,
      Phone: contact.phone || undefined,
      Title: contact.position || undefined,
      Department: contact.company || undefined,
    }),
  })

  return { ok: res.ok, status: res.status }
}

export async function createSalesforceContact(
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
      .select('salesforce_access_token, salesforce_refresh_token, salesforce_instance_url')
      .eq('id', userId)
      .single()

    let accessToken = profile?.salesforce_access_token as string | undefined
    const refreshToken = profile?.salesforce_refresh_token as string | undefined
    const instanceUrl = profile?.salesforce_instance_url as string | undefined

    if (!accessToken || !instanceUrl) return false

    let result = await postSalesforceContact(accessToken, instanceUrl, contact)

    if (result.status === 409) {
      console.log('Salesforce: contact already exists')
      return true
    }

    if (result.status === 401 && refreshToken) {
      const refreshed = await refreshSalesforceToken(refreshToken)
      accessToken = await persistRefreshedTokens(
        userId,
        refreshed,
        refreshToken,
        instanceUrl
      )
      const refreshedInstanceUrl = refreshed.instance_url || instanceUrl
      result = await postSalesforceContact(accessToken, refreshedInstanceUrl, contact)

      if (result.status === 409) {
        console.log('Salesforce: contact already exists')
        return true
      }
    }

    if (!result.ok) {
      console.error('Salesforce sync failed with status:', result.status)
      return false
    }

    console.log('Salesforce: contact created successfully')
    return true
  } catch (e) {
    console.error('Salesforce sync error:', e)
    return false
  }
}

export { exchangeSalesforceCode }
