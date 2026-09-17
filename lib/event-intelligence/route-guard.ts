import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import {
  EVENT_INTELLIGENCE_DISABLED,
  eventIntelligenceEnabled,
} from '@/lib/event-intelligence/flag'

/**
 * The two things every Event Intelligence route checks, in one place.
 *
 * The order matters. The flag is consulted *before* the session, so a disabled
 * deployment answers 404 to everyone identically and cannot be probed for
 * whether an account exists. And it gates the route itself, not just what the
 * route renders: with the feature off there is no path through which any of
 * this data can be read or written, which is what "off by default" has to mean
 * if it is to mean anything.
 */
export type RouteContext = {
  supabase: ReturnType<typeof createRouteHandlerClient>
  ownerId: string
}

export async function requireEventIntelligence(): Promise<
  { ok: true; context: RouteContext } | { ok: false; response: NextResponse }
> {
  if (!eventIntelligenceEnabled()) {
    return { ok: false, response: NextResponse.json(EVENT_INTELLIGENCE_DISABLED, { status: 404 }) }
  }

  const supabase = createRouteHandlerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  }

  /*
    `user.id` from getUser(), and never an id from the request body. Every write
    below stamps this value onto the row, so a client that sends somebody else's
    owner id is not refused — it is simply not listened to.
  */
  return { ok: true, context: { supabase, ownerId: user.id } }
}

/** A request body, or null when it was not JSON. */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}
