import { notFound, redirect } from 'next/navigation'
import PlannedEventForm from '@/components/events/PlannedEventForm'
import { loadPlannedEventDetail } from '@/lib/events/data'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Edit event — ABC',
}

export default async function EditPlannedEventPage({ params }: { params: { id: string } }) {
  const detail = await loadPlannedEventDetail(params.id)

  if (detail === null) redirect('/login')
  if (!detail) notFound()

  return <PlannedEventForm event={detail.event} />
}
