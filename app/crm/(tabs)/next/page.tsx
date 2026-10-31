import { redirect } from 'next/navigation'
import NextView from '@/components/opportunities/NextView'
import { getCrmWorkspace } from '@/lib/opportunities/data'
import { buildNextItems } from '@/lib/opportunities/model'

export const dynamic = 'force-dynamic'

export default async function CrmNextPage() {
  const data = await getCrmWorkspace()

  // Middleware already gates this route; this is the safety net.
  if (!data) redirect('/login')

  /*
    Grouped here, on the server, the way the follow-up inbox groups its own
    list — so "today" means the same thing on both screens.
  */
  return (
    <NextView
      initialItems={buildNextItems(data.people, data.opportunities)}
      failed={data.peopleFailed}
    />
  )
}
