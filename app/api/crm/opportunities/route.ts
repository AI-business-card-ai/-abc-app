import { NextRequest, NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/api/errors'
import { logActivity } from '@/lib/crm'
import {
  LIMITS,
  UUID_PATTERN,
  defaultOpportunityName,
  normalizeCurrency,
  positiveAmount,
  trimTo,
} from '@/lib/opportunities/model'
import { createOpportunity, isMissingSchema, parseNextAction } from '@/lib/opportunities/store'
import { createRouteHandlerClient } from '@/lib/supabase-route'

/**
 * Create an opportunity for a person the owner already has.
 *
 * A contact is never turned into a deal by anything but this request. It
 * starts in NEW, and asking twice returns the opportunity that exists rather
 * than a second one.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>
    const contactId = typeof body.contactId === 'string' ? body.contactId : ''
    if (!UUID_PATTERN.test(contactId)) {
      return NextResponse.json({ error: 'Missing contact.' }, { status: 400 })
    }

    // The person must be this owner's. RLS would hide anyone else's; the
    // explicit filter makes a stranger's id a plain "not found".
    const { data: contact } = await supabase
      .from('scanned_contacts')
      .select('id, name, first_name, last_name, company')
      .eq('id', contactId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

    const personName =
      trimTo(contact.name, LIMITS.name) ??
      trimTo([contact.first_name, contact.last_name].filter(Boolean).join(' '), LIMITS.name) ??
      'Contact'

    const result = await createOpportunity(supabase, {
      userId: user.id,
      contactId,
      name:
        trimTo(body.name, LIMITS.name) ??
        defaultOpportunityName({ name: personName, company: trimTo(contact.company, LIMITS.name) }),
      stage: 'new',
      value: positiveAmount(body.value),
      currency: normalizeCurrency(body.currency),
      note: trimTo(body.note, LIMITS.note),
      nextAction: parseNextAction(body.nextAction),
    })

    if (!result.ok) {
      if (isMissingSchema(result.error)) {
        return serverErrorResponse('crm/opportunities', result.error, 'Opportunities are not available yet. Try again later.', 503)
      }
      return serverErrorResponse('crm/opportunities', result.error, 'Could not create this opportunity. Try again.')
    }

    if (result.created) {
      logActivity({
        contactId,
        userId: user.id,
        activityType: 'STAGE_CHANGED',
        activityDetail: 'Opportunity created · New',
        metadata: { opportunity_id: result.opportunity.id, to: 'new' },
      }).catch((err) => console.error('[crm/opportunities] log failed:', err))
    }

    return NextResponse.json(
      {
        success: true,
        created: result.created,
        opportunity: result.opportunity,
        nextActionSaved: result.nextActionSaved,
      },
      { status: result.created ? 201 : 200 }
    )
  } catch (err) {
    return serverErrorResponse('crm/opportunities', err, 'Could not create this opportunity. Try again.')
  }
}
