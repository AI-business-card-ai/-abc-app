import { redirect } from 'next/navigation'
import MyCardView from '@/components/my-card/MyCardView'
import { getMyCard } from '@/lib/my-card-data'
import { walletAvailability } from '@/lib/card/wallet'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'My Card — ABC',
}

export default async function MyCardPage() {
  const data = await getMyCard()

  // Middleware already gates this route; this is the safety net.
  if (!data) redirect('/login')

  /*
    Two booleans, resolved on the server. `walletAvailability` deliberately
    returns nothing but the answer — the variable names behind it stay here.
  */
  return <MyCardView data={data} wallet={walletAvailability()} />
}
