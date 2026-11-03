import { redirect } from 'next/navigation'
import EventsListView from '@/components/events/EventsListView'
import { loadEventsOverview } from '@/lib/events/data'

export const dynamic = 'force-dynamic'

export default async function EventsPage() {
  const overview = await loadEventsOverview()

  // Middleware already gates this route; this is the safety net.
  if (!overview) redirect('/login')

  return <EventsListView available={overview.available} planned={overview.planned} notes={overview.notes} />
}
