import { randomBytes, createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { getSalesforceAuthorizeUrl } from '@/lib/salesforce'

const PKCE_COOKIE = 'salesforce_code_verifier'

export async function GET(request: NextRequest) {
  const supabase = createRouteHandlerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (!process.env.SALESFORCE_CLIENT_ID || !process.env.SALESFORCE_CLIENT_SECRET) {
    return NextResponse.json({ error: 'Salesforce OAuth not configured' }, { status: 500 })
  }

  const codeVerifier = randomBytes(64).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')

  const authorizeUrl = getSalesforceAuthorizeUrl(user.id, codeChallenge)
  const response = NextResponse.redirect(authorizeUrl)

  response.cookies.set(PKCE_COOKIE, codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return response
}
