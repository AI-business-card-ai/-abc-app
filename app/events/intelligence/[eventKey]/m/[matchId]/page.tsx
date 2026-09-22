import { notFound, redirect } from 'next/navigation'
import MatchDetailView from '@/components/event-intelligence/MatchDetailView'
import {
  loadLinkableEncounters,
  loadTargets,
  toCompany,
  toMatch,
  toPresence,
} from '@/lib/event-intelligence/data'
import { loadFeedbackForMatch } from '@/lib/event-intelligence/benchmark-data'
import { eventIntelligenceContext } from '@/lib/event-intelligence/page-context'

export const dynamic = 'force-dynamic'

/**
 * Why ABC suggests this company.
 *
 * The match is read through the owner's own client, so row-level security
 * decides whether it exists for them: another account's match is not
 * "forbidden" here, it is simply not found, which is the same answer an id that
 * never existed gives and tells a prober nothing.
 */
export default async function MatchDetailPage({
  params,
}: {
  params: { eventKey: string; matchId: string }
}) {
  const result = await eventIntelligenceContext(params.eventKey)
  if (result.kind === 'login') redirect('/login')
  if (result.kind === 'absent') notFound()

  const { supabase, ownerId, event } = result.context

  const { data: matchRow } = await supabase
    .from('intel_matches')
    .select('id, user_id, objective_id, presence_id, match_type, score, engine_version, reasons, evidence, warnings, matched_at')
    .eq('user_id', ownerId)
    .eq('id', params.matchId)
    .maybeSingle()

  if (!matchRow) notFound()
  const match = toMatch(matchRow as Record<string, unknown>)

  const { data: presenceRow } = await supabase
    .from('intel_company_presences')
    .select('id, event_id, company_id, exhibitor_display_name, hall, stand, event_categories, event_description, products_services, listing_url, status, first_seen_at, last_seen_at')
    .eq('id', match.presenceId)
    .maybeSingle()

  if (!presenceRow) notFound()
  const presence = toPresence(presenceRow as Record<string, unknown>)

  // A match reached through another fair's URL is not this fair's match.
  if (presence.eventId !== event.id) notFound()

  const { data: companyRow } = await supabase
    .from('intel_companies')
    .select('id, display_name, name_normalized, website_domain, country, description_public, categories, merge_candidate_of')
    .eq('id', presence.companyId)
    .maybeSingle()

  const { data: sourceRow } = await supabase
    .from('intel_source_records')
    .select('provider, source_url, fetched_at, source_updated_at')
    .eq('entity_type', 'presence')
    .eq('entity_id', presence.id)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const [targets, encounters, feedback] = await Promise.all([
    loadTargets(supabase, ownerId, event.id),
    loadLinkableEncounters(supabase, ownerId, event.eventKey),
    loadFeedbackForMatch(supabase, ownerId, match.id),
  ])

  return (
    <MatchDetailView
      event={event}
      match={match}
      presence={presence}
      company={companyRow ? toCompany(companyRow as Record<string, unknown>) : undefined}
      target={targets.find((target) => target.matchId === match.id) ?? null}
      encounters={encounters}
      feedback={feedback}
      source={
        sourceRow
          ? {
              provider: String((sourceRow as Record<string, unknown>).provider),
              sourceUrl: ((sourceRow as Record<string, unknown>).source_url as string | null) ?? null,
              fetchedAt: String((sourceRow as Record<string, unknown>).fetched_at),
            }
          : null
      }
    />
  )
}
