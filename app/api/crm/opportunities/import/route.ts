import { NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/api/errors'
import {
  CRM_CONTACT_COLUMNS,
  defaultOpportunityName,
  legacyImportCandidates,
  legacyImportStage,
  toCrmPerson,
  toOpportunity,
} from '@/lib/opportunities/model'
import { isMissingSchema, isUniqueViolation } from '@/lib/opportunities/store'
import { createRouteHandlerClient } from '@/lib/supabase-route'

/**
 * Bring deals over from the previous Pipeline board — only when the owner asks.
 *
 * The old board held every contact, so importing it wholesale would make every
 * person a deal. Only what the owner put there deliberately comes across: a
 * logged meeting, an opened deal, a won deal, or a deal value they typed (see
 * `legacyImportStage`). The old columns are read, never changed, and people
 * who already have an opportunity are skipped, so asking twice imports nothing
 * the second time.
 */
export async function POST() {
  try {
    const supabase = createRouteHandlerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [peopleRes, opportunityRes] = await Promise.all([
      supabase.from('scanned_contacts').select(CRM_CONTACT_COLUMNS).eq('user_id', user.id),
      supabase.from('crm_opportunities').select('*').eq('user_id', user.id),
    ])

    if (opportunityRes.error && isMissingSchema(opportunityRes.error)) {
      return serverErrorResponse('crm/import', opportunityRes.error, 'Opportunities are not available yet. Try again later.', 503)
    }
    if (peopleRes.error || opportunityRes.error) {
      return serverErrorResponse('crm/import', peopleRes.error ?? opportunityRes.error, 'Could not bring those deals over. Try again.')
    }

    const people = ((peopleRes.data as unknown as Record<string, unknown>[] | null) ?? []).map(toCrmPerson)
    const opportunities = ((opportunityRes.data as Record<string, unknown>[] | null) ?? []).map(toOpportunity)
    const candidates = legacyImportCandidates(people, opportunities)

    if (candidates.length === 0) return NextResponse.json({ success: true, imported: 0 })

    const now = new Date().toISOString()
    const rows = candidates.map((person) => ({
      user_id: user.id,
      contact_id: person.id,
      name: defaultOpportunityName(person),
      stage: legacyImportStage(person),
      value: person.legacy.value,
      currency: person.legacy.currency,
      notes: person.legacy.notes,
      created_at: now,
      updated_at: now,
    }))

    const { data, error } = await supabase.from('crm_opportunities').insert(rows).select('id')

    if (error) {
      // Another tab got there first for at least one person: go one by one, skipping those.
      if (!isUniqueViolation(error)) {
        return serverErrorResponse('crm/import', error, 'Could not bring those deals over. Try again.')
      }
      let imported = 0
      for (const row of rows) {
        const single = await supabase.from('crm_opportunities').insert(row).select('id')
        if (!single.error) imported += 1
      }
      return NextResponse.json({ success: true, imported })
    }

    return NextResponse.json({ success: true, imported: (data ?? []).length })
  } catch (err) {
    return serverErrorResponse('crm/import', err, 'Could not bring those deals over. Try again.')
  }
}
