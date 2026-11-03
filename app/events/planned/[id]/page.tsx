import { notFound, redirect } from 'next/navigation'
import PlannedEventDetailView from '@/components/events/PlannedEventDetailView'
import { loadPlannedEventDetail } from '@/lib/events/data'

export const dynamic = 'force-dynamic'

/** One planned event. Somebody else's id is answered exactly like one that does not exist. */
export default async function PlannedEventPage({ params }: { params: { id: string } }) {
  const detail = await loadPlannedEventDetail(params.id)

  if (detail === null) redirect('/login')
  if (!detail) notFound()

  return <PlannedEventDetailView event={detail.event} workspace={detail.workspace} />
}
