import { redirect } from 'next/navigation'
import EventsListView from '@/components/events/EventsListView'
import { loadEventWorkspaces } from '@/lib/events/data'

export const dynamic = 'force-dynamic'

export default async function EventsPage() {
  const events = await loadEventWorkspaces()

  // Middleware already gates this route; this is the safety net.
  if (!events) redirect('/login')

  return <EventsListView events={events} />
}
