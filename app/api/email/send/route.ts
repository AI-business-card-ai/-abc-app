import { NextRequest, NextResponse } from 'next/server'
import { consumeRateLimit } from '@/lib/rate-limit'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'
import {
  WELCOME_RATE_SCOPE,
  WELCOME_WINDOW_SECONDS,
  sendWelcomeForIdentity,
} from '@/lib/welcome-email'

/**
 * Send the signed-in person their own welcome email. Nothing else.
 *
 * Every rule lives in `sendWelcomeForIdentity`: a verified, confirmed session,
 * the account's own address as the only recipient, one welcome per account,
 * and generic errors. This route only supplies the verified user and the real
 * provider. The request body is read for its `type` and nothing more.
 */
export async function POST(req: NextRequest) {
  const auth = createRouteHandlerClient()
  const {
    data: { user },
  } = await auth.auth.getUser()

  const body = user ? await req.json().catch(() => null) : null

  const result = await sendWelcomeForIdentity(
    {
      configured: Boolean(process.env.RESEND_API_KEY),
      claim: async (userId) => {
        try {
          const outcome = await consumeRateLimit(createServiceClient(), {
            scope: WELCOME_RATE_SCOPE,
            subject: userId,
            target: userId,
            windowSeconds: WELCOME_WINDOW_SECONDS,
            maxHits: 1,
          })
          return outcome.allowed ? 'allowed' : outcome.reason
        } catch {
          return 'unavailable'
        }
      },
      // Loaded only once a request has passed every check, so a refusal never reaches the provider.
      send: async (to, name) => (await import('@/lib/email')).sendWelcomeEmail(to, name),
    },
    user
      ? {
          id: user.id,
          email: user.email,
          email_confirmed_at: user.email_confirmed_at,
          confirmed_at: user.confirmed_at,
          fullName: user.user_metadata?.full_name,
        }
      : null,
    body
  )

  return NextResponse.json(result.body, { status: result.status })
}
