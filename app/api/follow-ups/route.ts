import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { logActivity } from '@/lib/crm'
import { recomputeContactFollowUpProjection } from '@/lib/encounters'

/**
 * Completing and snoozing a follow-up.
 *
 * A follow-up belongs to a meeting. `contact_encounters.follow_up_at` is where
 * it lives, one per meeting, and both actions here change exactly one of them:
 *
 *   complete → clear that meeting's follow_up_at, log FOLLOWUP_COMPLETED
 *   snooze   → move that meeting's follow_up_at, log FOLLOWUP_SNOOZED
 *
 * `scanned_contacts.next_action_date` is a projection the inbox, the dashboard
 * counts and the header badge read. It holds one date while a contact may have
 * several meetings awaiting replies, so neither action writes it directly —
 * both recompute it from what genuinely remains outstanding. One rule, one
 * helper, so the reminder cannot drift from the meetings it describes.
 *
 * Contacts saved before meetings had rows of their own keep the old
 * contact-level behaviour, in an explicit branch. A contact that *has* meetings
 * never takes it.
 */

type Body = {
  contactId?: string
  /**
   * The meeting being acted on. The contact screen knows it; the inbox lists
   * contacts and does not, so it stays optional and is resolved server-side.
   */
  encounterId?: string
  action?: 'complete' | 'snooze'
  /** ISO date the follow-up moves to. Snooze only. */
  until?: string
}

type PendingEncounter = {
  id: string
  follow_up_at: string
  met_at: string
  created_at: string
}

function formatDue(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * The one meeting an action applies to, or null for a contact with none.
 *
 * Named explicitly, it must match meeting, contact and owner together — owner
 * alone would let a stale client move a reminder on a different person's
 * meeting, which is their own data and still the wrong meeting.
 *
 * Unnamed, it is the meeting the contact row is displaying: the one whose date
 * equals the projection. Since the projection is the soonest outstanding, that
 * identifies it. Ties are broken newest-meeting-first and then by id, so the
 * choice is deterministic and exactly one row is ever touched.
 */
async function resolveTarget(
  supabase: ReturnType<typeof createRouteHandlerClient>,
  args: { contactId: string; ownerId: string; encounterId?: string; projectedDue: string | null }
): Promise<{ ok: true; target: PendingEncounter | null } | { ok: false }> {
  if (args.encounterId) {
    const { data } = await supabase
      .from('contact_encounters')
      .select('id, follow_up_at, met_at, created_at')
      .eq('id', args.encounterId)
      .eq('contact_id', args.contactId)
      .eq('user_id', args.ownerId)
      .maybeSingle()

    if (!data) return { ok: false }
    return { ok: true, target: data as PendingEncounter }
  }

  const { data } = await supabase
    .from('contact_encounters')
    .select('id, follow_up_at, met_at, created_at')
    .eq('contact_id', args.contactId)
    .eq('user_id', args.ownerId)
    .not('follow_up_at', 'is', null)
    .order('follow_up_at', { ascending: true })
    .order('met_at', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })

  const pending = (data || []) as PendingEncounter[]
  if (pending.length === 0) return { ok: true, target: null }

  const showing = pending.find((row) => row.follow_up_at === args.projectedDue)
  return { ok: true, target: showing ?? pending[0] }
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

    let snoozeUntil: string | null = null
    if (body.action === 'snooze') {
      const until = (body.until || '').trim()
      const parsed = until ? new Date(until) : null
      if (!parsed || Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'Invalid snooze date.' }, { status: 400 })
      }
      snoozeUntil = parsed.toISOString()
    }

    /*
      Everything is validated before anything is written. A wrong or stale
      meeting id must not move a date, finish a different meeting, or log an
      action that did not happen.
    */
    const resolved = await resolveTarget(supabase, {
      contactId: contact.id,
      ownerId: user.id,
      encounterId: body.encounterId,
      projectedDue: contact.next_action_date,
    })

    if (!resolved.ok) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    const target = resolved.target

    if (target) {
      const { error: writeError } = await supabase
        .from('contact_encounters')
        .update({ follow_up_at: body.action === 'snooze' ? snoozeUntil : null })
        .eq('id', target.id)
        .eq('contact_id', contact.id)
        .eq('user_id', user.id)

      if (writeError) throw writeError
    }

    /*
      The contact-level reminder, derived rather than assigned. With no meetings
      to derive it from, the old contact-level behaviour stands: clear on
      completion, move on snooze.
    */
    let nextDue: string | null
    if (target) {
      nextDue = await recomputeContactFollowUpProjection(supabase, {
        ownerId: user.id,
        contactId: contact.id,
      })
    } else {
      nextDue = body.action === 'snooze' ? snoozeUntil : null
      const { error } = await supabase
        .from('scanned_contacts')
        .update({ next_action_date: nextDue })
        .eq('id', contact.id)
        .eq('user_id', user.id)

      if (error) throw error
    }

    if (body.action === 'snooze') {
      await logActivity({
        contactId: contact.id,
        userId: user.id,
        activityType: 'FOLLOWUP_SNOOZED',
        activityDetail: `Follow-up moved to ${formatDue(snoozeUntil)}`,
        metadata: {
          previous_due: contact.next_action_date,
          next_due: snoozeUntil,
          encounter_id: target?.id ?? null,
        },
      }).catch((err) => console.error('[follow-ups] snooze log failed:', err))

      return NextResponse.json({ success: true, nextActionDate: nextDue })
    }

    await logActivity({
      contactId: contact.id,
      userId: user.id,
      activityType: 'FOLLOWUP_COMPLETED',
      activityDetail: step
        ? `Followed up: ${step}`
        : wasDue
          ? `Follow-up completed (was due ${wasDue})`
          : 'Follow-up completed',
      // jsonb, so the meeting is recorded without a schema change. Null for a
      // contact that predates meetings having rows — absent, not guessed at.
      metadata: { was_due: contact.next_action_date, encounter_id: target?.id ?? null },
    }).catch((err) => console.error('[follow-ups] complete log failed:', err))

    return NextResponse.json({ success: true, nextActionDate: nextDue })
  } catch (err) {
    console.error('[follow-ups] action failed:', err)
    return NextResponse.json({ error: 'Could not update this follow-up.' }, { status: 500 })
  }
}
