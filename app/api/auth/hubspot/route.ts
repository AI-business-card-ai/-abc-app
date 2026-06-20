import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { getHubSpotAuthorizeUrl } from '@/lib/hubspot'

export async function GET(request: NextRequest) {
  const supabase = createRouteHandlerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (!process.env.HUBSPOT_CLIENT_ID || !process.env.HUBSPOT_CLIENT_SECRET) {
    return NextResponse.json({ error: 'HubSpot OAuth not configured' }, { status: 500 })
  }

  const authorizeUrl = getHubSpotAuthorizeUrl(user.id)
  return NextResponse.redirect(authorizeUrl)
}
