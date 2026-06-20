import { NextRequest, NextResponse } from 'next/server'
import { exchangeSalesforceCode, saveSalesforceOAuthTokens } from '@/lib/salesforce'

function settingsUrl(request: NextRequest, query?: string) {
  const origin = request.nextUrl.origin
  return new URL(`/settings${query ? `?${query}` : ''}`, origin)
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const error = request.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(settingsUrl(request, 'crm=salesforce-error'))
  }

  if (!code || !state) {
    return NextResponse.redirect(settingsUrl(request, 'crm=salesforce-error'))
  }

  try {
    const tokens = await exchangeSalesforceCode(code)
    await saveSalesforceOAuthTokens(state, tokens)

    return NextResponse.redirect(settingsUrl(request, 'crm=salesforce-connected'))
  } catch (err) {
    console.error('Salesforce OAuth callback error:', err)
    return NextResponse.redirect(settingsUrl(request, 'crm=salesforce-error'))
  }
}
