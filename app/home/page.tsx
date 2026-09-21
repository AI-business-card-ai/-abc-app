import { redirect } from 'next/navigation'
import Dashboard from '@/components/dashboard/Dashboard'
import { getDashboardData } from '@/lib/dashboard-data'
import { eventIntelligenceEnabled } from '@/lib/event-intelligence/flag'
import { missionToday } from '@/lib/event-intelligence/mission'
import { loadHomeMission } from '@/lib/event-intelligence/mission-data'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  // Expo Mission is read only when Event Intelligence is switched on. Off, no
  // query runs and Home renders exactly as it did before the feature existed.
  const [data, mission] = await Promise.all([
    getDashboardData(),
    eventIntelligenceEnabled() ? loadHomeMission(missionToday()) : Promise.resolve(null),
  ])

  // Middleware already gates this route; this is the safety net.
  if (!data) redirect('/login')

  return <Dashboard data={data} mission={mission ?? undefined} />
}
