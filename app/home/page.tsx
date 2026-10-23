import { redirect } from 'next/navigation'
import Dashboard from '@/components/dashboard/Dashboard'
import { getDashboardData } from '@/lib/dashboard-data'
import { getMyCard } from '@/lib/my-card-data'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  /*
    The owner's card comes from the same loader /my-card uses, so My ABC on
    Home is drawn from exactly the data the card page draws. It loads beside
    the dashboard rather than after it; if it fails, Home still renders and the
    tile points at /my-card instead.
  */
  const [data, myCard] = await Promise.all([
    getDashboardData(),
    getMyCard().catch((err) => {
      console.error('[home] card load failed:', err)
      return null
    }),
  ])

  // Middleware already gates this route; this is the safety net.
  if (!data) redirect('/login')

  return <Dashboard data={data} myCard={myCard} />
}
