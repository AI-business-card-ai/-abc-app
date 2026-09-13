import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServerSupabase } from '@/lib/supabase'
import { pushContactEncounterToCrm } from '@/lib/crm/export'
import { logActivity } from '@/lib/crm'
import { batchExportTargets } from '@/lib/scan/batch-store'
import { requirePro } from '@/lib/entitlements'

/**
 * Push every contact this batch produced into the owner's CRM.
 *
 * Deliberately a loop over the existing single-contact export rather than a
 * bulk path of its own. `pushContactEncounterToCrm` already knows how to find
 * or create a company, associate it, log the meeting and open the follow-up
 * task, and it already keeps `crm_object_mappings` so a second push updates
 * rather than duplicates. A batch-shaped copy of that would be a second answer
 * to the same question, and the two would drift.
 *
 * Sequential, not parallel: CRMs rate-limit, and ten simultaneous pushes from
 * one owner is the request pattern most likely to be throttled.
 */

export const runtime = 'nodejs'
export const maxDuration = 300

const PROVIDERS = ['hubspot', 'pipedrive', 'salesforce'] as const
type Provider = (typeof PROVIDERS)[number]

type Body = {
  provider?: string
  /** A subset, when the owner ticked only some. Omitted means the whole batch. */
  contactIds?: string[]
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = createRouteHandlerClient()
    const {
      data: { user },
    } = await auth.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // CRM sync is ABC Pro. The batch and its contacts stay available either way.
    const gate = await requirePro(createServerSupabase(), user, 'crm')
    if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status })

    const body = (await req.json().catch(() => ({}))) as Body
    const provider = (body.provider || 'hubspot') as Provider

    if (!PROVIDERS.includes(provider)) {
      return NextResponse.json({ error: 'Unsupported CRM.' }, { status: 400 })
    }

    const supabase = createServerSupabase()
    let targets = await batchExportTargets(supabase, user.id, params.id)

    /*
      The subset is applied by filtering what the batch already owns, never by
      trusting the ids as a list to export. A contact id from another owner
      simply matches nothing.
    */
    if (Array.isArray(body.contactIds) && body.contactIds.length > 0) {
      const wanted = new Set(body.contactIds)
      targets = targets.filter((target) => wanted.has(target.contactId))
    }

    if (targets.length === 0) {
      return NextResponse.json(
        { error: 'Nothing in this batch to export yet.', reason: 'no_targets' },
        { status: 400 }
      )
    }

    const results: {
      contactId: string
      name: string
      ok: boolean
      needsReconnect?: boolean
      message?: string
    }[] = []

    for (const target of targets) {
      const result = await pushContactEncounterToCrm({
        ownerId: user.id,
        provider,
        contactId: target.contactId,
        encounterId: target.encounterId,
      })

      results.push({
        contactId: target.contactId,
        name: target.name,
        ok: result.ok,
        needsReconnect: result.needsReconnect,
        message: result.ok ? undefined : result.contact.message || 'Could not push this contact.',
      })

      if (result.ok) {
        logActivity({
          contactId: target.contactId,
          userId: user.id,
          activityType: 'CRM_EXPORT',
          activityDetail: `Pushed to ${provider} from batch`,
          metadata: {
            provider,
            scan_batch_id: params.id,
            encounter_id: target.encounterId,
          },
        }).catch((err) => console.error('[scan/batch/export] activity log failed:', err))
      }

      /*
        A disconnected CRM fails identically for every remaining contact, and
        nine more round trips would only produce nine more copies of the same
        message. Stop and say so once.
      */
      if (result.needsReconnect) break
    }

    const exported = results.filter((r) => r.ok).length

    return NextResponse.json({
      success: exported > 0,
      provider,
      exported,
      total: targets.length,
      results,
    })
  } catch (err) {
    console.error('[scan/batch/export] failed:', err)
    return NextResponse.json({ error: 'Could not push this batch to your CRM.' }, { status: 500 })
  }
}
