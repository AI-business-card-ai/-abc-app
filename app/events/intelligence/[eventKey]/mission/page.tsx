import { notFound, redirect } from 'next/navigation'
import MissionView from '@/components/event-intelligence/MissionView'
import { loadObjective } from '@/lib/event-intelligence/data'
import { missionSetupDefaults, missionToday } from '@/lib/event-intelligence/mission'
import { listedExhibitors, loadMissions, loadMissionSetup } from '@/lib/event-intelligence/mission-data'
import { eventIntelligenceContext } from '@/lib/event-intelligence/page-context'

export const dynamic = 'force-dynamic'

/**
 * The Expo Mission for one fair.
 *
 * Gated like every Event Intelligence page: with the feature off, or without
 * data for this fair, it is not found. The mission itself is derived here on
 * every request from rows that already exist — nothing is stored as "mission
 * state", so nothing can drift.
 */
export default async function MissionPage({ params }: { params: { eventKey: string } }) {
  const result = await eventIntelligenceContext(params.eventKey)
  if (result.kind === 'login') redirect('/login')
  if (result.kind === 'absent') notFound()

  const { supabase, ownerId, event } = result.context
  const today = missionToday()

  const { missions, profile } = await loadMissions(supabase, ownerId, today, { eventId: event.id })
  const mission = missions[0] ?? null

  const needsSetup = !mission || mission.action.stage === 'setup_required'
  const setupContext = needsSetup ? await loadMissionSetup(supabase, ownerId, today, profile) : null
  const objective = needsSetup ? mission?.objective ?? (profile ? await loadObjective(supabase, ownerId, event.id) : null) : null
  const exhibitors = mission?.facts.exhibitors ?? (await listedExhibitors(supabase, event.id))

  return (
    <MissionView
      event={event}
      facts={mission?.facts ?? null}
      action={mission?.action ?? null}
      exhibitors={exhibitors}
      setup={
        setupContext
          ? {
              // With no objective yet, the setup context's defaults also fall back on product names.
              defaults: objective ? missionSetupDefaults(profile, objective) : setupContext.defaults,
              profile,
              objective,
              companyName: setupContext.companyName,
            }
          : null
      }
    />
  )
}
