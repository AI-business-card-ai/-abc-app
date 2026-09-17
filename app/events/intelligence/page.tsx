import { notFound, redirect } from 'next/navigation'
import EventDetailView from '@/components/events/EventDetailView'
import IntelligenceHub from '@/components/event-intelligence/IntelligenceHub'
import { loadEventWorkspace } from '@/lib/events/data'
import { createServerComponentClient } from '@/lib/supabase-server'
import { currentOwnerId, loadIntelEventSummaries, loadIntentProfile } from '@/lib/event-intelligence/data'
import { eventIntelligenceEnabled } from '@/lib/event-intelligence/flag'

export const dynamic = 'force-dynamic'

/**
 * Event Intelligence, and the one address it costs.
 *
 * A static segment beats a dynamic one in the App Router, so putting the hub at
 * /events/intelligence reserves `intelligence` as an event key — and an owner
 * who really has a fair by that name would silently lose the workspace they
 * have today. That is closed rather than accepted: the existing loader is asked
 * first, and when it finds real meetings under that key they win, with the flag
 * off or on. Nobody loses a page to a feature they cannot see.
 */
export default async function EventIntelligencePage() {
  const workspace = await loadEventWorkspace('intelligence')

  // Middleware already gates /events; this is the safety net.
  if (workspace === null) redirect('/login')

  // An owner whose fair is genuinely called "Intelligence" keeps their workspace.
  if (workspace) return <EventDetailView workspace={workspace} />

  if (!eventIntelligenceEnabled()) notFound()

  const supabase = createServerComponentClient()
  const ownerId = await currentOwnerId(supabase)
  if (!ownerId) redirect('/login')

  const [events, profile] = await Promise.all([
    loadIntelEventSummaries(supabase, ownerId),
    loadIntentProfile(supabase, ownerId),
  ])

  return <IntelligenceHub events={events} hasProfile={Boolean(profile)} />
}
