import { createServerComponentClient } from '@/lib/supabase-server'
import { currentOwnerId, loadEventByKey } from '@/lib/event-intelligence/data'
import { eventIntelligenceEnabled } from '@/lib/event-intelligence/flag'
import { isReservedEventKey } from '@/lib/event-intelligence/event-identity'
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

  /*
    A reserved segment is a screen, not a fair. Static routes already win over
    the dynamic one, so this changes no URL — it makes the reservation explicit,
    so an event that somehow acquired the key `import` is answered as absent
    here rather than half-resolving behind a page that is not about it.
  */
  if (isReservedEventKey(eventKey)) return { kind: 'absent' }

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
