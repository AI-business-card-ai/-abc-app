import { NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/api/errors'
import { loadEventByKey, toMaterial } from '@/lib/event-intelligence/data'
import { parseMaterial } from '@/lib/event-intelligence/profile'
import { readJson, requireEventIntelligence } from '@/lib/event-intelligence/route-guard'

/**
 * Event material — what the owner will show, at one edition of one fair.
 *
 * The event is named by its key and resolved here, and `event_id` is not
 * optional. A teaser made for Ambiente 2026 is not material for Ambiente 2027
 * until somebody deliberately creates a row for 2027: nothing carries forward,
 * because "we showed this last year" is a decision rather than a default.
 *
 * `url` is a reference. ABC's image bucket takes images only, so a video or a
 * PDF is a link to wherever the company already hosts it — and the screens say
 * so rather than offering an upload control that would fail.
 */
const MATERIAL_COLUMNS =
  'id, user_id, event_id, product_id, title, description, media_kind, url, phase, visible_from, visible_until, priority, product_tags, industry_tags'

export async function POST(request: Request) {
  const guard = await requireEventIntelligence()
  if (!guard.ok) return guard.response
  const { supabase, ownerId } = guard.context

  const body = await readJson(request)
  if (!body) return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })

  const eventKey = typeof body.eventKey === 'string' ? body.eventKey.trim() : ''
  if (!eventKey) return NextResponse.json({ error: 'Which event?' }, { status: 400 })

  const parsed = parseMaterial(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const event = await loadEventByKey(supabase, eventKey)
    if (!event) return NextResponse.json({ error: 'No event data for that key.' }, { status: 404 })

    const { data, error } = await supabase
      .from('intel_event_materials')
      .insert({
        user_id: ownerId,
        event_id: event.id,
        product_id: parsed.value.productId,
        title: parsed.value.title,
        description: parsed.value.description,
        media_kind: parsed.value.mediaKind,
        url: parsed.value.url,
        phase: parsed.value.phase,
        visible_from: parsed.value.visibleFrom,
        visible_until: parsed.value.visibleUntil,
        priority: parsed.value.priority,
        product_tags: parsed.value.productTags,
        industry_tags: parsed.value.industryTags,
      })
      .select(MATERIAL_COLUMNS)
      .single()

    if (error) throw error
    return NextResponse.json({ material: toMaterial(data as Record<string, unknown>) })
  } catch (err) {
    /*
      A foreign key violation here means the product named is not this owner's.
      The database refused it; the honest sentence says ABC cannot find it,
      which is also all a prober learns.
    */
    if ((err as { code?: string })?.code === '23503') {
      return NextResponse.json({ error: 'ABC cannot find that product.' }, { status: 400 })
    }
    return serverErrorResponse('event-intelligence/materials', err)
  }
}

export async function PATCH(request: Request) {
  const guard = await requireEventIntelligence()
  if (!guard.ok) return guard.response
  const { supabase, ownerId } = guard.context

  const body = await readJson(request)
  const materialId = typeof body?.materialId === 'string' ? body.materialId.trim() : ''
  if (!materialId) return NextResponse.json({ error: 'Which material?' }, { status: 400 })

  const parsed = parseMaterial(body ?? {})
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    // `event_id` is absent on purpose: material belongs to the edition it was
    // made for, and moving it to another fair is creating a new one.
    const { data, error } = await supabase
      .from('intel_event_materials')
      .update({
        product_id: parsed.value.productId,
        title: parsed.value.title,
        description: parsed.value.description,
        media_kind: parsed.value.mediaKind,
        url: parsed.value.url,
        phase: parsed.value.phase,
        visible_from: parsed.value.visibleFrom,
        visible_until: parsed.value.visibleUntil,
        priority: parsed.value.priority,
        product_tags: parsed.value.productTags,
        industry_tags: parsed.value.industryTags,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', ownerId)
      .eq('id', materialId)
      .select(MATERIAL_COLUMNS)
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ error: 'No such material.' }, { status: 404 })
    return NextResponse.json({ material: toMaterial(data as Record<string, unknown>) })
  } catch (err) {
    return serverErrorResponse('event-intelligence/materials', err)
  }
}

export async function DELETE(request: Request) {
  const guard = await requireEventIntelligence()
  if (!guard.ok) return guard.response
  const { supabase, ownerId } = guard.context

  const materialId = new URL(request.url).searchParams.get('id')?.trim() ?? ''
  if (!materialId) return NextResponse.json({ error: 'Which material?' }, { status: 400 })

  try {
    const { error } = await supabase
      .from('intel_event_materials')
      .delete()
      .eq('user_id', ownerId)
      .eq('id', materialId)

    if (error) throw error
    return NextResponse.json({ removed: true })
  } catch (err) {
    return serverErrorResponse('event-intelligence/materials', err)
  }
}
