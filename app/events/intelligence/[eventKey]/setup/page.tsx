import { notFound, redirect } from 'next/navigation'
import SetupView from '@/components/event-intelligence/SetupView'
import { loadBrainView } from '@/lib/event-intelligence/brain-data'
import { loadIntentProfile, loadObjective } from '@/lib/event-intelligence/data'
import { eventIntelligenceContext } from '@/lib/event-intelligence/page-context'

export const dynamic = 'force-dynamic'

/**
 * The two answers matching needs: who you are, and what you want here.
 *
 * One screen rather than two, because they are asked once and answered
 * together, and a wizard that makes somebody press Next to reach four more
 * inputs is a wizard nobody finishes at a trade fair.
 */
export default async function SetupPage({ params }: { params: { eventKey: string } }) {
  const result = await eventIntelligenceContext(params.eventKey)
  if (result.kind === 'login') redirect('/login')
  if (result.kind === 'absent') notFound()

  const { supabase, ownerId, event } = result.context
  const [profile, brain] = await Promise.all([loadIntentProfile(supabase, ownerId), loadBrainView(supabase, ownerId)])
  const objective = profile ? await loadObjective(supabase, ownerId, event.id) : null

  // How ABC understands the business: one card, owner-scoped, above the owner's own answers.
  return (
    <SetupView
      event={event}
      profile={profile}
      objective={objective}
      brain={{ summary: brain.summary, website: brain.website }}
    />
  )
}
