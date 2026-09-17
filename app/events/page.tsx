import { redirect } from 'next/navigation'
import EventsListView from '@/components/events/EventsListView'
import { loadEventWorkspaces } from '@/lib/events/data'
import { eventIntelligenceEnabled } from '@/lib/event-intelligence/flag'

export const dynamic = 'force-dynamic'

export default async function EventsPage() {
  const events = await loadEventWorkspaces()

  // Middleware already gates this route; this is the safety net.
  if (!events) redirect('/login')

  /*
    Read on the server, passed down as a boolean. The flag itself never reaches
    the browser, and with the feature off this page renders exactly what it
    rendered before: the prop is false and there is no entry point in the
    markup to find.
  */
  return <EventsListView events={events} intelligence={eventIntelligenceEnabled()} />
}
