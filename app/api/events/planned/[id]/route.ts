import { NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/api/errors'
import { UUID_PATTERN, parsePlannedEventInput, updatePlannedEvent } from '@/lib/events/planned'
import { createRouteHandlerClient } from '@/lib/supabase-route'

/** Edit a planned event. Somebody else's id is answered exactly like one that does not exist. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createRouteHandlerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!UUID_PATTERN.test(params.id)) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const parsed = parsePlannedEventInput(await req.json().catch(() => null))
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const { event, error } = await updatePlannedEvent(supabase, user.id, params.id, parsed.value)
    if (error) return serverErrorResponse('events/planned', error, 'Could not save this event. Try again.')
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    return NextResponse.json({ success: true, event })
  } catch (error) {
    return serverErrorResponse('events/planned', error, 'Could not save this event. Try again.')
  }
}
