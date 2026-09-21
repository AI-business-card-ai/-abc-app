import { notFound, redirect } from 'next/navigation'
import PrepareMeetingView from '@/components/event-intelligence/PrepareMeetingView'
import {
  loadBrief,
  loadMaterials,
  loadProducts,
  loadTargets,
  toCompany,
  toMatch,
  toPresence,
} from '@/lib/event-intelligence/data'
import { eventIntelligenceContext } from '@/lib/event-intelligence/page-context'
import { publicCardUrl } from '@/lib/my-card-data'
import { eventPhaseOn, materialVisible } from '@/lib/event-intelligence/profile'

export const dynamic = 'force-dynamic'

/**
 * Preparing for one meeting: what to discuss, what to show, what to say.
 *
 * Reachable only from a target the owner saved, because preparing a meeting
 * with a company you have not decided to meet is a form nobody needs. The
 * brief hangs off the target, and the target is still not a meeting.
 */
export default async function PrepareMeetingPage({
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
  if (presence.eventId !== event.id) notFound()

  const { data: companyRow } = await supabase
    .from('intel_companies')
    .select('id, display_name, name_normalized, website_domain, country, description_public, categories, merge_candidate_of')
    .eq('id', presence.companyId)
    .maybeSingle()

  const targets = await loadTargets(supabase, ownerId, event.id)
  const target = targets.find((entry) => entry.matchId === match.id) ?? null

  // Preparing a meeting is something you do with a company you chose to meet.
  if (!target) redirect(`/events/intelligence/${event.eventKey}/m/${match.id}`)

  const [products, materials, brief] = await Promise.all([
    loadProducts(supabase, ownerId),
    loadMaterials(supabase, ownerId, event.id),
    loadBrief(supabase, ownerId, target.id),
  ])

  const { data: profileRow } = await supabase
    .from('abc_profiles')
    .select('full_name, company, card_slug, card_published')
    .eq('id', ownerId)
    .maybeSingle()

  /*
    The owner's own timing, applied: material pinned to after the fair, or
    given a window that has not opened, is still listed — it is theirs, and
    they may want it anyway — but it is labelled and goes after what is for now.
  */
  const now = new Date()
  const phase = eventPhaseOn(event, now)
  const visibleNow = materials.filter((material) => materialVisible(material, now, phase)).map((material) => material.id)

  const profile = (profileRow ?? {}) as Record<string, unknown>
  const slug = typeof profile.card_slug === 'string' ? profile.card_slug : null

  return (
    <PrepareMeetingView
      event={event}
      match={match}
      presence={presence}
      company={companyRow ? toCompany(companyRow as Record<string, unknown>) : undefined}
      target={target}
      products={products}
      materials={materials}
      visibleNow={visibleNow}
      brief={brief}
      me={{
        name: typeof profile.full_name === 'string' ? profile.full_name : null,
        company: typeof profile.company === 'string' ? profile.company : null,
        // Only a published card has a link worth sharing.
        cardUrl: profile.card_published === true && slug ? publicCardUrl(slug) : null,
      }}
    />
  )
}
