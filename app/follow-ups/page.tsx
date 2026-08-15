import { redirect } from 'next/navigation'
import FollowUpsView from '@/components/follow-ups/FollowUpsView'
import { getFollowUps } from '@/lib/follow-ups-data'

export const dynamic = 'force-dynamic'

export default async function FollowUpsPage() {
  const data = await getFollowUps()

  // Middleware already gates this route; this is the safety net.
  if (!data) redirect('/login')

  return <FollowUpsView data={data} />
}
