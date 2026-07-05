import { createServiceClient } from '@/lib/supabase/service'
import { enrichContact } from '@/lib/perplexity'
import { enrichWithApollo } from '@/lib/apollo'
import { enrichLinkedIn, findWorkEmail } from '@/lib/enrichlayer'
import { generatePersonalizedMessages } from '@/lib/ai-messages'
import { createHubSpotContact } from '@/lib/hubspot'
import { createSalesforceContact } from '@/lib/salesforce'
import { calculateLeadScore } from '@/lib/crm'
import { calculateAiMatchScore, aiScoreToDbFields, applyPersonalMeetingBonus } from '@/lib/ai-scoring'
import { contactHasEventTag } from '@/lib/event-tag'
import { onEnrichmentCompleted } from '@/lib/crm-engine'
import { runIntelligenceResearch } from '@/lib/research'
import { buildPostEnrichmentMapping } from '@/lib/data-model'
import { ensureMandatoryCompanyFields } from '@/lib/company-field-estimator'
import type { ABCProfile, ScannedContact } from '@/lib/types'
import type { EnrichmentStepId } from '@/lib/enrichment-steps'

async function updateEnrichmentStep(
  contactId: string,
  userId: string,
  status: 'PENDING' | 'ENRICHING' | 'DONE' | 'ERROR',
  step: EnrichmentStepId
) {
  const supabase = createServiceClient()
  await supabase
    .from('scanned_contacts')
    .update({
      enrichment_status: status,
      enrichment_step: step,
    })
    .eq('id', contactId)
    .eq('user_id', userId)
}

export async function runContactEnrichment(contactId: string, userId: string): Promise<void> {
  const supabase = createServiceClient()

  const { data: contact, error: contactError } = await supabase
    .from('scanned_contacts')
    .select('*')
    .eq('id', contactId)
    .eq('user_id', userId)
    .single()

  if (contactError || !contact) {
    throw new Error('Contact not found')
  }

  const { data: profileRow } = await supabase
    .from('abc_profiles')
    .select('*')
    .eq('id', userId)
    .single()

  const profile = (profileRow as ABCProfile | null) ?? ({} as ABCProfile)
  const c = contact as ScannedContact

  try {
    await updateEnrichmentStep(contactId, userId, 'ENRICHING', 'apollo')

    const apolloData = await enrichWithApollo(c.name, c.company, c.email).catch((err) => {
      console.error('Apollo enrichment skipped:', err)
      return null
    })

    await updateEnrichmentStep(contactId, userId, 'ENRICHING', 'perplexity')

    const perplexityContext = await enrichContact(c.name, c.company, profile).catch((err) => {
      console.error('Perplexity enrichment skipped:', err)
      return ''
    })

    await runIntelligenceResearch(
      {
        id: contactId,
        name: c.name,
        company: c.company,
        role: c.role,
        industry: c.industry,
      },
      supabase,
      profile
    ).catch((err) => {
      console.error('Intelligence research skipped:', err)
    })

    const { data: refreshedContact } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('id', contactId)
      .single()

    const latest = (refreshedContact as ScannedContact | null) ?? c

    const linkedinUrl = apolloData?.linkedin_url || c.linkedin_url
    let linkedinData = null

    await updateEnrichmentStep(contactId, userId, 'ENRICHING', 'linkedin')

    if (linkedinUrl) {
      linkedinData = await enrichLinkedIn(linkedinUrl).catch((err) => {
        console.error('EnrichLayer LinkedIn skipped:', err)
        return null
      })
    }

    let resolvedEmail = c.email
    if (!resolvedEmail && c.name && c.company) {
      const emailData = await findWorkEmail(c.name, c.company).catch((err) => {
        console.error('EnrichLayer email lookup skipped:', err)
        return null
      })
      if (emailData && emailData.confidence > 0.7) {
        resolvedEmail = emailData.email
      }
    }

    const baseRecord = {
      email: resolvedEmail,
      photo_url: apolloData?.photo_url || c.photo_url,
      linkedin_url: linkedinUrl || c.linkedin_url,
      company_size: apolloData?.company_size || c.company_size,
      company_revenue: apolloData?.company_revenue || c.company_revenue,
      technologies: apolloData?.technologies || c.technologies,
      enriched_context: perplexityContext || c.enriched_context || '',
      linkedin_headline: linkedinData?.headline || c.linkedin_headline,
      linkedin_summary: linkedinData?.summary || c.linkedin_summary,
      linkedin_experience: linkedinData?.experiences || c.linkedin_experience,
      linkedin_skills: linkedinData?.skills || c.linkedin_skills,
      linkedin_posts: linkedinData?.recentPosts || c.linkedin_posts,
      linkedin_education: linkedinData?.education || c.linkedin_education,
    }

    await updateEnrichmentStep(contactId, userId, 'ENRICHING', 'messages')

    const { data: preScoreRow } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('id', contactId)
      .single()

    const contactForScoring = (preScoreRow as ScannedContact | null) ?? {
      ...c,
      ...baseRecord,
    } as ScannedContact

    const mandatoryCompanyFields = await ensureMandatoryCompanyFields(contactForScoring).catch((err) => {
      console.error('Mandatory company field estimation skipped:', err)
      return {}
    })

    const contactWithMandatory = {
      ...contactForScoring,
      ...mandatoryCompanyFields,
    } as ScannedContact

    const aiScoreResult = await calculateAiMatchScore(contactWithMandatory, profile).catch((err) => {
      console.error('AI match scoring skipped:', err)
      return null
    })

    const scoreFields = aiScoreResult
      ? aiScoreToDbFields(
          contactHasEventTag(contactWithMandatory)
            ? applyPersonalMeetingBonus(aiScoreResult)
            : aiScoreResult
        )
      : {
          ai_lead_score: calculateLeadScore({ ...c, ...baseRecord, ...mandatoryCompanyFields }),
          match_score: calculateLeadScore({ ...c, ...baseRecord, ...mandatoryCompanyFields }),
        }

    const aiMessages = await generatePersonalizedMessages(
      {
        ...latest,
        ...baseRecord,
        meeting_context: latest.event_name || latest.notes,
      },
      profile,
      linkedinData
    ).catch((err) => {
      console.error('AI message regeneration skipped:', err)
      return null
    })

    const withMessages = {
      ...baseRecord,
      ...mandatoryCompanyFields,
      ...scoreFields,
      message_linkedin: aiMessages?.message_linkedin || c.message_linkedin,
      message_email: aiMessages?.message_email || c.message_email,
      email_subject: aiMessages?.email_subject || c.email_subject,
      message_whatsapp: aiMessages?.message_whatsapp || c.message_whatsapp,
    }

    await supabase
      .from('scanned_contacts')
      .update(withMessages)
      .eq('id', contactId)
      .eq('user_id', userId)

    const { data: enrichedRow } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('id', contactId)
      .single()

    if (enrichedRow) {
      const sfMapping = buildPostEnrichmentMapping(enrichedRow, true)
      await supabase.from('scanned_contacts').update(sfMapping).eq('id', contactId)
    }

    await updateEnrichmentStep(contactId, userId, 'ENRICHING', 'syncing')

    try {
      const hubspotToken = (profileRow as { hubspot_access_token?: string } | null)?.hubspot_access_token
      if (hubspotToken) {
        await createHubSpotContact(
          {
            name: c.name || '',
            email: withMessages.email || undefined,
            phone: c.phone || undefined,
            company: c.company || undefined,
            position: c.role || undefined,
          },
          userId
        )
      }
    } catch (e) {
      console.error('HubSpot sync error:', e)
    }

    try {
      const salesforceToken = (profileRow as { salesforce_access_token?: string } | null)
        ?.salesforce_access_token
      if (salesforceToken) {
        await createSalesforceContact(
          {
            name: c.name || '',
            email: withMessages.email || undefined,
            phone: c.phone || undefined,
            company: c.company || undefined,
            position: c.role || undefined,
          },
          userId
        )
      }
    } catch (e) {
      console.error('Salesforce sync error:', e)
    }

    await updateEnrichmentStep(contactId, userId, 'DONE', 'done')

    const { data: finalRow } = await supabase
      .from('scanned_contacts')
      .select('match_score, ai_lead_score')
      .eq('id', contactId)
      .single()

    const matchScore =
      finalRow?.ai_lead_score ?? finalRow?.match_score ?? withMessages.ai_lead_score ?? c.match_score ?? 50

    await onEnrichmentCompleted(contactId, userId, Number(matchScore) || 50)
  } catch (error) {
    console.error('runContactEnrichment error:', error)
    await updateEnrichmentStep(contactId, userId, 'ERROR', 'queued')
    throw error
  }
}

export function triggerBackgroundEnrichment(contactId: string, userId: string) {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  fetch(`${baseUrl}/api/enrich/run/${contactId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  }).catch((err) => {
    console.error('Background enrichment trigger failed, running inline:', err)
    runContactEnrichment(contactId, userId).catch(console.error)
  })
}
