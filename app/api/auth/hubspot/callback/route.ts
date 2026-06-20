import { NextRequest, NextResponse } from 'next/server'
import {
  exchangeHubSpotCode,
  getHubSpotPortalId,
  saveHubSpotOAuthTokens,
} from '@/lib/hubspot'

function settingsUrl(request: NextRequest, query?: string) {
  const origin = request.nextUrl.origin
  return new URL(`/settings${query ? `?${query}` : ''}`, origin)
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const error = request.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(settingsUrl(request, 'crm=hubspot-error'))
  }

  if (!code || !state) {
    return NextResponse.redirect(settingsUrl(request, 'crm=hubspot-error'))
  }

  try {
    const tokens = await exchangeHubSpotCode(code)
    const portalId = await getHubSpotPortalId(tokens.access_token)
    await saveHubSpotOAuthTokens(state, tokens, portalId)

    return NextResponse.redirect(settingsUrl(request, 'crm=hubspot-connected'))
  } catch (err) {
    console.error('HubSpot OAuth callback error:', err)
    return NextResponse.redirect(settingsUrl(request, 'crm=hubspot-error'))
  }
}
