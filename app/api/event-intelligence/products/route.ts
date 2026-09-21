import { NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/api/errors'
import { loadProducts, toProduct } from '@/lib/event-intelligence/data'
import { parseProduct } from '@/lib/event-intelligence/profile'
import { readJson, requireEventIntelligence } from '@/lib/event-intelligence/route-guard'

/**
 * What the owner sells, in their own words.
 *
 * First-party content: ABC stores it and shows it and never checks it. It is
 * deliberately not the same thing as `intel_company_profiles.what_we_sell`,
 * which is the list the matching engine reads — that answers "what should ABC
 * look for", this answers "what am I going to talk about", and the second
 * needs an identity because material and meeting briefs point at it.
 *
 * Written by the owner's own client: RLS insists the row names the caller, and
 * the column grants withhold `user_id` so ownership cannot be edited after the
 * fact.
 */
const PRODUCT_COLUMNS =
  'id, user_id, name, description, product_tags, industry_tags, use_case_tags, sort_order'

export async function POST(request: Request) {
  const guard = await requireEventIntelligence()
  if (!guard.ok) return guard.response
  const { supabase, ownerId } = guard.context

  const body = await readJson(request)
  if (!body) return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })

  const parsed = parseProduct(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const existing = await loadProducts(supabase, ownerId)
    const { data, error } = await supabase
      .from('intel_products')
      .insert({
        user_id: ownerId,
        name: parsed.value.name,
        description: parsed.value.description,
        product_tags: parsed.value.productTags,
        industry_tags: parsed.value.industryTags,
        use_case_tags: parsed.value.useCaseTags,
        sort_order: existing.length,
      })
      .select(PRODUCT_COLUMNS)
      .single()

    if (error) throw error
    return NextResponse.json({ product: toProduct(data as Record<string, unknown>) })
  } catch (err) {
    return serverErrorResponse('event-intelligence/products', err)
  }
}

export async function PATCH(request: Request) {
  const guard = await requireEventIntelligence()
  if (!guard.ok) return guard.response
  const { supabase, ownerId } = guard.context

  const body = await readJson(request)
  const productId = typeof body?.productId === 'string' ? body.productId.trim() : ''
  if (!productId) return NextResponse.json({ error: 'Which product?' }, { status: 400 })

  const parsed = parseProduct(body ?? {})
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const { data, error } = await supabase
      .from('intel_products')
      .update({
        name: parsed.value.name,
        description: parsed.value.description,
        product_tags: parsed.value.productTags,
        industry_tags: parsed.value.industryTags,
        use_case_tags: parsed.value.useCaseTags,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', ownerId)
      .eq('id', productId)
      .select(PRODUCT_COLUMNS)
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ error: 'No such product.' }, { status: 404 })
    return NextResponse.json({ product: toProduct(data as Record<string, unknown>) })
  } catch (err) {
    return serverErrorResponse('event-intelligence/products', err)
  }
}

/**
 * Remove a product.
 *
 * Material and briefs that pointed at it keep existing with a null product —
 * the foreign keys say `ON DELETE SET NULL` — because a brochure does not stop
 * being a brochure when the product line it was filed under is renamed away.
 */
export async function DELETE(request: Request) {
  const guard = await requireEventIntelligence()
  if (!guard.ok) return guard.response
  const { supabase, ownerId } = guard.context

  const productId = new URL(request.url).searchParams.get('id')?.trim() ?? ''
  if (!productId) return NextResponse.json({ error: 'Which product?' }, { status: 400 })

  try {
    const { error } = await supabase
      .from('intel_products')
      .delete()
      .eq('user_id', ownerId)
      .eq('id', productId)

    if (error) throw error
    return NextResponse.json({ removed: true })
  } catch (err) {
    return serverErrorResponse('event-intelligence/products', err)
  }
}
