import { notFound, redirect } from 'next/navigation'
import ImportFlow from '@/components/event-intelligence/ImportFlow'
import { createServerComponentClient } from '@/lib/supabase-server'
import { currentOwnerId, loadIntelEventSummaries } from '@/lib/event-intelligence/data'
import { eventIntelligenceEnabled } from '@/lib/event-intelligence/flag'

export const dynamic = 'force-dynamic'

/**
 * Bringing an exhibitor list into ABC.
 *
 * A reserved segment under /events/intelligence — see RESERVED_EVENT_KEYS — so
 * `import` is a screen rather than a fair, and the dynamic event route never
 * sees it.
 */
export default async function ImportPage() {
  if (!eventIntelligenceEnabled()) notFound()

  const supabase = createServerComponentClient()
  const ownerId = await currentOwnerId(supabase)
  if (!ownerId) redirect('/login')

  const events = await loadIntelEventSummaries(supabase, ownerId)

  return (
    <ImportFlow
      events={events.map(({ event, exhibitors }) => ({
        eventKey: event.eventKey,
        name: event.name,
        editionYear: event.editionYear,
        city: event.city,
        country: event.country,
        exhibitors,
      }))}
    />
  )
}
