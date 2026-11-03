import { NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/api/errors'
import { createPlannedEvent, listPlannedEvents, parsePlannedEventInput } from '@/lib/events/planned'
import { isMissingSchema } from '@/lib/opportunities/store'
import { createRouteHandlerClient } from '@/lib/supabase-route'

/** The owner's planned events, for the "Associate with planned event" choice. */
export async function GET() {
  try {
    const supabase = createRouteHandlerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { available, events } = await listPlannedEvents(supabase, user.id)
    return NextResponse.json({
      available,
      events: events.map(({ id, name, startsOn, endsOn }) => ({ id, name, startsOn, endsOn })),
    })
  } catch (error) {
    return serverErrorResponse('events/planned', error, 'Could not load your events.')
  }
}

/** Plan an event. This request is the only thing in ABC that creates one. */
export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = parsePlannedEventInput(await req.json().catch(() => null))
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const { event, error } = await createPlannedEvent(supabase, user.id, parsed.value)
    if (!event) {
      if (isMissingSchema(error as { code?: string })) {
        return serverErrorResponse('events/planned', error, 'Event planning is not available yet. Try again later.', 503)
      }
      return serverErrorResponse('events/planned', error, 'Could not save this event. Try again.')
    }

    return NextResponse.json({ success: true, event }, { status: 201 })
  } catch (error) {
    return serverErrorResponse('events/planned', error, 'Could not save this event. Try again.')
  }
}
