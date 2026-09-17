import { NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/api/errors'
import { loadIntentProfile } from '@/lib/event-intelligence/data'
import { parseIntentProfile } from '@/lib/event-intelligence/intent'
import { readJson, requireEventIntelligence } from '@/lib/event-intelligence/route-guard'

/**
 * The owner's company intent profile — what they do, sell and need.
 *
 * One profile per account, so this is an upsert on `user_id` rather than a
 * create-or-update dance in the client. The owner id is stamped from the
 * session; the body is only ever read for the answers themselves.
 */
export async function POST(request: Request) {
  const guard = await requireEventIntelligence()
  if (!guard.ok) return guard.response
  const { supabase, ownerId } = guard.context

  const body = await readJson(request)
  if (!body) return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })

  const parsed = parseIntentProfile(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const value = parsed.value

  try {
    const { error } = await supabase.from('intel_company_profiles').upsert(
      {
        user_id: ownerId,
        company_name: value.companyName,
        what_we_do: value.whatWeDo,
        what_we_sell: value.whatWeSell,
        what_we_buy: value.whatWeBuy,
        who_we_want_to_meet: value.whoWeWantToMeet,
        target_industries: value.targetIndustries,
        target_company_types: value.targetCompanyTypes,
        capabilities: value.capabilities,
        technologies: value.technologies,
        materials: value.materials,
        certifications: value.certifications,
        geographies: value.geographies,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

    if (error) throw error

    const profile = await loadIntentProfile(supabase, ownerId)
    return NextResponse.json({ profile })
  } catch (err) {
    return serverErrorResponse('event-intelligence/profile', err)
  }
}
