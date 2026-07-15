import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { handleQrConnect } from '@/lib/qr-connect'

/** Runs the "Join ABC" connect flow for email logins (no OAuth callback). */
export async function POST(req: NextRequest) {
  const authClient = createRouteHandlerClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const ownerUserId = typeof body.ownerUserId === 'string' ? body.ownerUserId : ''

    const newUserName =
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      user.email ||
      null

    await handleQrConnect(user.id, newUserName, ownerUserId)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[card/connect] error:', err)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
