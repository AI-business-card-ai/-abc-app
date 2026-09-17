import { createServerComponentClient } from '@/lib/supabase-server'
import { currentOwnerId, loadEventByKey } from '@/lib/event-intelligence/data'
import { eventIntelligenceEnabled } from '@/lib/event-intelligence/flag'
import type { IntelEvent } from '@/lib/event-intelligence/types'

/**
 * What every Event Intelligence screen needs before it can render anything.
 *
 * The flag is checked first and produces `absent`, which callers turn into
 * `notFound()`. That is the truthful answer when the feature is off: not a
 * locked door with something visible behind it, but an address that is not a
 * thing. It also means a disabled deployment gives one answer to everyone and
 * cannot be probed.
 */
export type EventIntelligenceContext = {
  supabase: ReturnType<typeof createServerComponentClient>
  ownerId: string
  event: IntelEvent
}

export type ContextResult = { kind: 'ok'; context: EventIntelligenceContext } | { kind: 'login' } | { kind: 'absent' }

export async function eventIntelligenceContext(eventKey: string): Promise<ContextResult> {
  if (!eventIntelligenceEnabled()) return { kind: 'absent' }

  const supabase = createServerComponentClient()
  const ownerId = await currentOwnerId(supabase)
  if (!ownerId) return { kind: 'login' }

  const event = await loadEventByKey(supabase, eventKey)
  // No directory data for this fair is the same answer as no such fair: there
  // is nothing here to show, and saying which of the two it is would report on
  // data the owner has no relationship with.
  if (!event) return { kind: 'absent' }

  return { kind: 'ok', context: { supabase, ownerId, event } }
}
