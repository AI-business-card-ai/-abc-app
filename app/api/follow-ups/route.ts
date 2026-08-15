import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { logActivity } from '@/lib/crm'

/**
 * Completing and snoozing a follow-up.
 *
 * There is no follow-up completion column, and adding one was not the smallest
 * safe change: `next_action_date` already *is* the pending follow-up, and
 * crm_activities already is the history. So:
 *
 *   complete → clear next_action_date, write a FOLLOWUP_COMPLETED activity
 *   snooze   → move next_action_date, write a FOLLOWUP_SNOOZED activity
 *
 * Clearing the date is what makes the dashboard counts and the header badge
 * update with no changes to either — they both count rows with a date set.
 * The Completed section reads back from the activity log.
 *
 * Both actions touch `next_action_date` and nothing else. /api/card/context
 * would have rewritten meeting_topic, notes and followup_note from absent
 * fields, wiping the meeting context this product exists to keep.
 */

type Body = {
  contactId?: string
  action?: 'complete' | 'snooze'
  /** ISO date the follow-up moves to. Snooze only. */
  until?: string
}

function formatDue(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json()) as Body
    if (!body.contactId || (body.action !== 'complete' && body.action !== 'snooze')) {
      return NextResponse.json({ error: 'Missing contact or action.' }, { status: 400 })
    }

    // Owner check, and we need the current due date for the history entry.
    const { data: contact } = await supabase
      .from('scanned_contacts')
      .select('id, name, next_action, next_step, next_action_date')
      .eq('id', body.contactId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

    const wasDue = formatDue(contact.next_action_date)
    const step = (contact.next_action || contact.next_step || '').trim()

    if (body.action === 'snooze') {
      const until = (body.until || '').trim()
      const parsed = until ? new Date(until) : null
      if (!parsed || Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'Invalid snooze date.' }, { status: 400 })
      }

      const { error } = await supabase
        .from('scanned_contacts')
        .update({ next_action_date: parsed.toISOString() })
        .eq('id', contact.id)
        .eq('user_id', user.id)

      if (error) throw error

      await logActivity({
        contactId: contact.id,
        userId: user.id,
        activityType: 'FOLLOWUP_SNOOZED',
        activityDetail: `Follow-up moved to ${formatDue(parsed.toISOString())}`,
        metadata: { previous_due: contact.next_action_date, next_due: parsed.toISOString() },
      }).catch((err) => console.error('[follow-ups] snooze log failed:', err))

      return NextResponse.json({ success: true, nextActionDate: parsed.toISOString() })
    }

    const { error } = await supabase
      .from('scanned_contacts')
      .update({ next_action_date: null })
      .eq('id', contact.id)
      .eq('user_id', user.id)

    if (error) throw error

    await logActivity({
      contactId: contact.id,
      userId: user.id,
      activityType: 'FOLLOWUP_COMPLETED',
      activityDetail: step
        ? `Followed up: ${step}`
        : wasDue
          ? `Follow-up completed (was due ${wasDue})`
          : 'Follow-up completed',
      metadata: { was_due: contact.next_action_date },
    }).catch((err) => console.error('[follow-ups] complete log failed:', err))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[follow-ups] action failed:', err)
    return NextResponse.json({ error: 'Could not update that follow-up.' }, { status: 500 })
  }
}
