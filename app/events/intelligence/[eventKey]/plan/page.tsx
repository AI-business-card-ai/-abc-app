import { notFound, redirect } from 'next/navigation'
import PlanView from '@/components/event-intelligence/PlanView'
import { loadEventGraph, loadObjective, loadMatches, loadTargets } from '@/lib/event-intelligence/data'
import { eventIntelligenceContext } from '@/lib/event-intelligence/page-context'
import { buildPlan } from '@/lib/event-intelligence/plan'
import { loadIntentProfile } from '@/lib/event-intelligence/data'

export const dynamic = 'force-dynamic'

/**
 * The plan to walk the fair with.
 *
 * Built from the targets this owner saved, never stored as its own thing, so it
 * cannot drift out of step with the decisions it describes.
 */
export default async function PlanPage({ params }: { params: { eventKey: string } }) {
  const result = await eventIntelligenceContext(params.eventKey)
  if (result.kind === 'login') redirect('/login')
  if (result.kind === 'absent') notFound()

  const { supabase, ownerId, event } = result.context

  const [targets, graph, profile] = await Promise.all([
    loadTargets(supabase, ownerId, event.id),
    loadEventGraph(supabase, event.id),
    loadIntentProfile(supabase, ownerId),
  ])

  const objective = profile ? await loadObjective(supabase, ownerId, event.id) : null
  const matches = objective ? await loadMatches(supabase, ownerId, objective.id) : []

  const plan = buildPlan(
    targets,
    new Map(graph.presences.map((presence) => [presence.id, presence])),
    graph.companies,
    new Map(matches.map((match) => [match.id, match]))
  )

  return <PlanView event={event} plan={plan} />
}
