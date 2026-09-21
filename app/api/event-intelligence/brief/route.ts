import { NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/api/errors'
import { loadBrief } from '@/lib/event-intelligence/data'
import { briefStatusFor, parseBrief } from '@/lib/event-intelligence/profile'
import { readJson, requireEventIntelligence } from '@/lib/event-intelligence/route-guard'

/**
 * The meeting brief: what I want to discuss, what I will show, and the note I
 * would send with it.
 *
 * Two things this route will not do, both by construction rather than by
 * convention:
 *
 *   **It does not send anything.** There is no transport here — no mail, no
 *   message, no webhook, no third party. Sharing is an act the owner performs
 *   with their own device, and all ABC records is that they did it.
 *
 *   **It cannot say a meeting happened.** `status` accepts draft, ready and
 *   shared. There is no 'accepted' or 'confirmed', because nobody replies to
 *   anything inside ABC and a status implying otherwise would be the product
 *   asserting a relationship that may not exist. Marking a target *met* is a
 *   different action entirely, on a different table, and needs an encounter
 *   the owner actually recorded.
 */
export async function POST(request: Request) {
  const guard = await requireEventIntelligence()
  if (!guard.ok) return guard.response
  const { supabase, ownerId } = guard.context

  const body = await readJson(request)
  const targetId = typeof body?.targetId === 'string' ? body.targetId.trim() : ''
  if (!targetId) return NextResponse.json({ error: 'Which target?' }, { status: 400 })

  const parsed = parseBrief(body ?? {})
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    /*
      The target is read through the owner's own client, so row-level security
      decides whether it exists for them. Somebody else's target is not
      "forbidden" here — it is not found, which is the same answer an id that
      never existed gives.
    */
    const { data: target, error: targetError } = await supabase
      .from('intel_meeting_targets')
      .select('id')
      .eq('user_id', ownerId)
      .eq('id', targetId)
      .maybeSingle()

    if (targetError) throw targetError
    if (!target) return NextResponse.json({ error: 'No such target.' }, { status: 404 })

    const { error } = await supabase.from('intel_meeting_briefs').upsert(
      {
        user_id: ownerId,
        target_id: targetId,
        product_id: parsed.value.productId,
        topic: parsed.value.topic,
        message: parsed.value.message,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,target_id' }
    )

    if (error) throw error
    return NextResponse.json({ brief: await loadBrief(supabase, ownerId, targetId) })
  } catch (err) {
    if ((err as { code?: string })?.code === '23503') {
      return NextResponse.json({ error: 'ABC cannot find that product.' }, { status: 400 })
    }
    return serverErrorResponse('event-intelligence/brief', err)
  }
}

/**
 * Attach or detach material, or move the brief between draft, ready and shared.
 */
export async function PATCH(request: Request) {
  const guard = await requireEventIntelligence()
  if (!guard.ok) return guard.response
  const { supabase, ownerId } = guard.context

  const body = await readJson(request)
  const targetId = typeof body?.targetId === 'string' ? body.targetId.trim() : ''
  if (!targetId) return NextResponse.json({ error: 'Which target?' }, { status: 400 })

  try {
    const current = await loadBrief(supabase, ownerId, targetId)
    if (!current) return NextResponse.json({ error: 'Nothing prepared for that target yet.' }, { status: 404 })

    // ── Material ──
    if (Array.isArray(body?.materialIds)) {
      const wanted = [...new Set(body.materialIds.filter((id: unknown): id is string => typeof id === 'string'))]

      const { error: clearError } = await supabase
        .from('intel_brief_materials')
        .delete()
        .eq('user_id', ownerId)
        .eq('brief_id', current.id)
      if (clearError) throw clearError

      if (wanted.length > 0) {
        const { error: attachError } = await supabase.from('intel_brief_materials').insert(
          wanted.map((materialId, index) => ({
            brief_id: current.id,
            material_id: materialId,
            user_id: ownerId,
            sort_order: index,
          }))
        )
        if (attachError) throw attachError
      }
    }

    // ── Status ──
    if (body?.status !== undefined) {
      const after = await loadBrief(supabase, ownerId, targetId)
      const status = briefStatusFor(body.status, after ?? current)
      if (!status.ok) return NextResponse.json({ error: status.error }, { status: 400 })

      /*
        `shared_at` and the status move together, and a CHECK in the database
        insists on it: a brief is shared exactly when there is a moment it was
        shared. Going back to draft clears the timestamp, because it is no
        longer true.
      */
      const { error } = await supabase
        .from('intel_meeting_briefs')
        .update({
          status: status.value,
          shared_at: status.value === 'shared' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', ownerId)
        .eq('id', current.id)

      if (error) throw error
    }

    return NextResponse.json({ brief: await loadBrief(supabase, ownerId, targetId) })
  } catch (err) {
    if ((err as { code?: string })?.code === '23503') {
      return NextResponse.json({ error: 'ABC cannot find that material.' }, { status: 400 })
    }
    return serverErrorResponse('event-intelligence/brief', err)
  }
}
