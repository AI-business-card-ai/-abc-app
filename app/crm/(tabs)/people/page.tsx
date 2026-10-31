import { redirect } from 'next/navigation'
import PeopleView from '@/components/opportunities/PeopleView'
import { getCrmWorkspace } from '@/lib/opportunities/data'
import { buildPeopleRows } from '@/lib/opportunities/model'

export const dynamic = 'force-dynamic'

export default async function CrmPeoplePage() {
  const data = await getCrmWorkspace()

  // Middleware already gates this route; this is the safety net.
  if (!data) redirect('/login')

  return <PeopleView rows={buildPeopleRows(data.people, data.opportunities)} failed={data.peopleFailed} />
}
