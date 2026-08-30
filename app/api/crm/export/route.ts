import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { pushContactEncounterToCrm } from '@/lib/crm/export'
import { logActivity } from '@/lib/crm'

/**
 * Push one contact and one meeting into the owner's CRM.
 *
 * The only route that talks to a CRM on purpose, and it only ever runs because
 * somebody pressed a button. The browser sends three things — a provider, a
 * contact id and a meeting id — and every fact that reaches HubSpot is read
 * back from the database under the owner's own id. Nothing about the person or
 * the meeting is taken from the request, so a tampered payload changes which
 * records are exported, never what they say.
 */

/**
 * The owner chooses one. Connecting both does not mean pushing to both — that
 * would be the app deciding where somebody's contacts go.
 */
const PROVIDERS = ['hubspot', 'pipedrive', 'salesforce'] as const
type Provider = (typeof PROVIDERS)[number]

type Body = {
  provider?: string
  contactId?: string
  /** The meeting being exported — the one the contact screen is showing. */
  encounterId?: string
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as Body
    const provider = (body.provider || 'hubspot') as Provider

    if (!PROVIDERS.includes(provider)) {
      // An unknown provider is rejected rather than defaulted: silently sending
      // a customer's contact to a CRM they did not name is worse than an error.
      return NextResponse.json({ error: 'Unsupported CRM.' }, { status: 400 })
    }
    if (!body.contactId || !body.encounterId) {
      return NextResponse.json({ error: 'Missing contact or meeting.' }, { status: 400 })
    }

    /*
      The owner comes from the session and from nowhere else. A `userId` in the
      body would be a request to act as somebody — the export helper is given
      user.id, and its queries filter on it, so a forged contact or meeting id
      simply finds nothing.
    */
    const result = await pushContactEncounterToCrm({
      ownerId: user.id,
      provider,
      contactId: body.contactId,
      encounterId: body.encounterId,
    })

    /*
      Recorded after the fact, and only when something actually reached the
      CRM. Writing "synced" before the provider agrees is how an activity log
      starts lying about work that never happened.
    */
    if (result.ok) {
      logActivity({
        contactId: body.contactId,
        userId: user.id,
        activityType: 'CRM_EXPORT',
        activityDetail: `Pushed to ${provider}`,
        metadata: {
          provider,
          encounter_id: body.encounterId,
          contact: result.contact.state,
          company: result.company.state,
          meeting: result.meeting.state,
          task: result.task.state,
        },
      }).catch((err) => console.error('[crm/export] activity log failed:', err))
    }

    // Always 200: a partial export is a real outcome the screen has to render
    // step by step, not an error with one message.
    return NextResponse.json({ success: result.ok, result })
  } catch (err) {
    console.error('[crm/export] failed:', err instanceof Error ? err.message : 'unknown')
    return NextResponse.json({ error: 'Could not push to your CRM.' }, { status: 500 })
  }
}
