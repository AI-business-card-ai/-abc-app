import { redirect } from 'next/navigation'
import MyCardView from '@/components/my-card/MyCardView'
import { getMyCard } from '@/lib/my-card-data'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'My Card — ABC',
}

export default async function MyCardPage() {
  const data = await getMyCard()

  // Middleware already gates this route; this is the safety net.
  if (!data) redirect('/login')

  return <MyCardView data={data} />
}
