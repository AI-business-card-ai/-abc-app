import { notFound, redirect } from 'next/navigation'
import BenchmarkView from '@/components/event-intelligence/BenchmarkView'
import { buildBenchmark, type RankedRecommendation } from '@/lib/event-intelligence/benchmark'
import { loadFeedbackForOwner, loadMissedOpportunities } from '@/lib/event-intelligence/benchmark-data'
import {
  loadEventGraph,
  loadMatches,
  loadObjective,
  toPresence,
} from '@/lib/event-intelligence/data'
import { eventIntelligenceContext } from '@/lib/event-intelligence/page-context'
import { locationLabel } from '@/lib/event-intelligence/view'

export const dynamic = 'force-dynamic'

/**
 * Is ABC recommending the right companies?
 *
 * An owner-only screen, reached from a quiet link on the fair's overview and
 * from nowhere else. It is not in the navigation and it is not a module: Expo
 * Mission stays one card with one action, and this sits behind it for the
 * owner who wants to check ABC's work rather than use it.
 *
 * The ranking reviewed here is the ranking that was shown — `loadMatches`
 * returns score first, then id, the same order the list renders in. A benchmark
 * that re-sorted would be grading a list nobody saw.
 */
export default async function BenchmarkPage({
  params,
  searchParams,
}: {
  params: { eventKey: string }
  searchParams?: { q?: string }
}) {
  const result = await eventIntelligenceContext(params.eventKey)
  if (result.kind === 'login') redirect('/login')
  if (result.kind === 'absent') notFound()

  const { supabase, ownerId, event } = result.context

  const objective = await loadObjective(supabase, ownerId, event.id)
  if (!objective) {
    return (
      <BenchmarkView
        event={event}
        ready={false}
        benchmark={buildBenchmark([], [], [])}
        queue={[]}
        feedback={[]}
        missed={[]}
        search={{ term: '', results: [] }}
      />
    )
  }

  const [matches, graph, feedback, missed] = await Promise.all([
    loadMatches(supabase, ownerId, objective.id),
    loadEventGraph(supabase, event.id),
    loadFeedbackForOwner(supabase, ownerId, objective.id),
    loadMissedOpportunities(supabase, ownerId, objective.id),
  ])

  const presenceById = new Map(graph.presences.map((presence) => [presence.id, presence]))
  const nameOf = (presenceId: string): string => {
    const presence = presenceById.get(presenceId)
    if (!presence) return 'Unknown company'
    return presence.exhibitorDisplayName ?? graph.companies.get(presence.companyId)?.displayName ?? 'Unnamed exhibitor'
  }

  const ranked: RankedRecommendation[] = matches.map((match) => ({
    matchId: match.id,
    matchType: match.matchType,
    score: match.score,
  }))

  /*
    The review queue carries just enough to judge one suggestion: who, where,
    which direction, and ABC's strongest reason. Anything more and this becomes
    a second detail screen; anything less and the owner is guessing.
  */
  const queue = matches.map((match) => {
    const presence = presenceById.get(match.presenceId)
    return {
      matchId: match.id,
      name: nameOf(match.presenceId),
      matchType: match.matchType,
      score: match.score,
      headline: match.reasons[0]?.statement ?? null,
      location: presence ? locationLabel(presence) : '',
      categories: presence ? presence.eventCategories.slice(0, 4) : [],
    }
  })

  /*
    Searching for a company ABC missed runs on the server, one query, capped.
    A fair can hold five thousand stands; shipping them all to the browser to
    filter would be a megabyte of payload to find one name.
  */
  const term = (searchParams?.q ?? '').trim()
  let results: { presenceId: string; name: string; location: string }[] = []
  if (term.length >= 2) {
    const { data } = await supabase
      .from('intel_company_presences')
      .select('id, event_id, company_id, exhibitor_display_name, hall, stand, event_categories, event_description, products_services, listing_url, status, first_seen_at, last_seen_at')
      .eq('event_id', event.id)
      .ilike('exhibitor_display_name', `%${term.replace(/[%_]/g, '')}%`)
      .order('exhibitor_display_name', { ascending: true })
      .limit(20)

    results = ((data ?? []) as Record<string, unknown>[]).map(toPresence).map((presence) => ({
      presenceId: presence.id,
      name: presence.exhibitorDisplayName ?? graph.companies.get(presence.companyId)?.displayName ?? 'Unnamed exhibitor',
      location: locationLabel(presence),
    }))
  }

  return (
    <BenchmarkView
      event={event}
      ready
      benchmark={buildBenchmark(ranked, feedback, missed)}
      queue={queue}
      feedback={feedback}
      missed={missed.map((entry) => ({ ...entry, name: nameOf(entry.presenceId) }))}
      search={{ term, results }}
    />
  )
}
