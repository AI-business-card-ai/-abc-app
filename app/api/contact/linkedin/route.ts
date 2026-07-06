import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { triggerBackgroundEnrichment, type EnrichmentOptions } from '@/lib/enrichment'
import { LINKEDIN_FIELDS_TO_CLEAR } from '@/lib/linkedin-identity'
import type { ScannedContact } from '@/lib/types'

function linkedinClearPayload(status: 'rejected' | null) {
  const payload: Record<string, null | string> = {
    linkedin_match_status: status,
    linkedin_match_confidence: null,
    linkedin_mismatch_reason: status === 'rejected' ? 'LinkedIn profile rejected by user' : null,
  }
  for (const field of LINKEDIN_FIELDS_TO_CLEAR) {
    payload[field] = null
  }
  return payload
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

    const body = (await req.json()) as {
      contactId?: string
      action?: 'reject' | 'set_url'
      linkedinUrl?: string
    }

    if (!body.contactId || !body.action) {
      return NextResponse.json({ error: 'Missing contactId or action' }, { status: 400 })
    }

    const { data: existing, error: fetchError } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('id', body.contactId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    let enrichmentOptions: EnrichmentOptions = {}

    if (body.action === 'reject') {
      await supabase
        .from('scanned_contacts')
        .update({
          ...linkedinClearPayload('rejected'),
          enrichment_status: 'PENDING',
          enrichment_step: 'queued',
        })
        .eq('id', body.contactId)
        .eq('user_id', user.id)

      enrichmentOptions = { skipLinkedIn: true }
    } else if (body.action === 'set_url') {
      const linkedinUrl = body.linkedinUrl?.trim()
      if (!linkedinUrl || !linkedinUrl.includes('linkedin.com')) {
        return NextResponse.json({ error: 'Valid LinkedIn URL required' }, { status: 400 })
      }

      await supabase
        .from('scanned_contacts')
        .update({
          linkedin_url: linkedinUrl,
          linkedin_match_status: null,
          linkedin_match_confidence: null,
          linkedin_profile_name: null,
          linkedin_profile_company: null,
          linkedin_mismatch_reason: null,
          linkedin_headline: null,
          linkedin_summary: null,
          linkedin_experience: null,
          linkedin_skills: null,
          linkedin_posts: null,
          linkedin_education: null,
          enrichment_status: 'PENDING',
          enrichment_step: 'queued',
        })
        .eq('id', body.contactId)
        .eq('user_id', user.id)

      enrichmentOptions = { linkedinUrlOverride: linkedinUrl, skipApolloLinkedIn: true }
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    triggerBackgroundEnrichment(body.contactId, user.id, enrichmentOptions)

    const { data: updated } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('id', body.contactId)
      .eq('user_id', user.id)
      .single()

    return NextResponse.json({ success: true, contact: updated as ScannedContact })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'LinkedIn action failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
