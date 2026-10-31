import { redirect } from 'next/navigation'
import PipelineBoard from '@/components/opportunities/PipelineBoard'
import { getCrmWorkspace } from '@/lib/opportunities/data'
import { joinBoard, legacyImportCandidates } from '@/lib/opportunities/model'

export const dynamic = 'force-dynamic'

export default async function CrmPipelinePage() {
  const data = await getCrmWorkspace()

  // Middleware already gates this route; this is the safety net.
  if (!data) redirect('/login')

  // The import offer is only made when the board itself loaded — otherwise
  // every deliberately-marked contact would look like it had no opportunity.
  const legacy = data.opportunitiesFailed || data.peopleFailed ? [] : legacyImportCandidates(data.people, data.opportunities)

  return (
    <PipelineBoard
      initialEntries={joinBoard(data.opportunities, data.people)}
      failed={data.opportunitiesFailed}
      hasPeople={data.people.length > 0}
      legacy={{ count: legacy.length, names: legacy.slice(0, 3).map((p) => p.name) }}
    />
  )
}
