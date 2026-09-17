import { notFound, redirect } from 'next/navigation'
import EventIntelligenceView from '@/components/event-intelligence/EventIntelligenceView'
import {
  loadEventGraph,
  loadIntentProfile,
  loadMatches,
  loadObjective,
  loadTargets,
} from '@/lib/event-intelligence/data'
import { eventIntelligenceContext } from '@/lib/event-intelligence/page-context'

export const dynamic = 'force-dynamic'

/**
 * One fair: who is worth meeting, why, and where they are.
 *
 * Everything on the screen is either a fact from a listing or something ABC
 * derived from one, and the two are loaded separately so they can be rendered
 * separately. Nothing is fetched that the owner has not earned by telling ABC
 * what they are looking for.
 */
export default async function EventIntelligencePage({
  params,
}: {
  params: { eventKey: string }
}) {
  const result = await eventIntelligenceContext(params.eventKey)
  if (result.kind === 'login') redirect('/login')
  if (result.kind === 'absent') notFound()

  const { supabase, ownerId, event } = result.context

  const [profile, graph] = await Promise.all([
    loadIntentProfile(supabase, ownerId),
    loadEventGraph(supabase, event.id),
  ])

  const objective = profile ? await loadObjective(supabase, ownerId, event.id) : null

  const [matches, targets] = objective
    ? await Promise.all([
        loadMatches(supabase, ownerId, objective.id),
        loadTargets(supabase, ownerId, event.id),
      ])
    : [[], []]

  return (
    <EventIntelligenceView
      event={event}
      exhibitorCount={graph.presences.filter((p) => p.status === 'listed').length}
      hasProfile={Boolean(profile)}
      hasObjective={Boolean(objective)}
      matches={matches}
      targets={targets}
      presences={graph.presences}
      companies={Array.from(graph.companies.values())}
    />
  )
}
