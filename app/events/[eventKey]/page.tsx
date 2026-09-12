import { notFound, redirect } from 'next/navigation'
import EventDetailView from '@/components/events/EventDetailView'
import { loadEventWorkspace } from '@/lib/events/data'

export const dynamic = 'force-dynamic'

/**
 * One event workspace.
 *
 * The key in the URL only ever selects among events built from this owner's own
 * encounters, so a key belonging to somebody else's fair finds nothing here and
 * is answered exactly like a key that never existed.
 */
export default async function EventPage({ params }: { params: { eventKey: string } }) {
  const workspace = await loadEventWorkspace(params.eventKey)

  if (workspace === null) redirect('/login')
  if (!workspace) notFound()

  return <EventDetailView workspace={workspace} />
}
