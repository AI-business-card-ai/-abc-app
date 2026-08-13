import { redirect } from 'next/navigation'
import Dashboard from '@/components/dashboard/Dashboard'
import { getDashboardData } from '@/lib/dashboard-data'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const data = await getDashboardData()

  // Middleware already gates this route; this is the safety net.
  if (!data) redirect('/login')

  return <Dashboard data={data} />
}
