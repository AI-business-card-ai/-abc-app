import { NextRequest, NextResponse } from 'next/server'
import { exchangeSalesforceCode, saveSalesforceOAuthTokens } from '@/lib/salesforce'

const PKCE_COOKIE = 'salesforce_code_verifier'

function settingsUrl(request: NextRequest, query?: string) {
  const origin = request.nextUrl.origin
  return new URL(`/settings${query ? `?${query}` : ''}`, origin)
}

function redirectWithCookieClear(request: NextRequest, query?: string) {
  const response = NextResponse.redirect(settingsUrl(request, query))
  response.cookies.delete(PKCE_COOKIE)
  return response
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const error = request.nextUrl.searchParams.get('error')
  const codeVerifier = request.cookies.get(PKCE_COOKIE)?.value

  if (error) {
    return redirectWithCookieClear(request, 'crm=salesforce-error')
  }

  if (!code || !state || !codeVerifier) {
    return redirectWithCookieClear(request, 'crm=salesforce-error')
  }

  try {
    const tokens = await exchangeSalesforceCode(code, codeVerifier)
    await saveSalesforceOAuthTokens(state, tokens)

    return redirectWithCookieClear(request, 'crm=salesforce-connected')
  } catch (err) {
    console.error('Salesforce OAuth callback error:', err)
    return redirectWithCookieClear(request, 'crm=salesforce-error')
  }
}
