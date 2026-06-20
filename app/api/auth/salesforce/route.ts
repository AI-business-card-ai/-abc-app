import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { getSalesforceAuthorizeUrl } from '@/lib/salesforce'

export async function GET(request: NextRequest) {
  const supabase = createRouteHandlerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (!process.env.SALESFORCE_CLIENT_ID || !process.env.SALESFORCE_CLIENT_SECRET) {
    return NextResponse.json({ error: 'Salesforce OAuth not configured' }, { status: 500 })
  }

  const authorizeUrl = getSalesforceAuthorizeUrl(user.id)
  return NextResponse.redirect(authorizeUrl)
}
