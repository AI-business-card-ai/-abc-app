import { createServiceClient } from '@/lib/supabase/service'
import { enrichContact } from '@/lib/perplexity'
import { enrichWithApollo } from '@/lib/apollo'
import { enrichLinkedIn, findWorkEmail, resolveLinkedInProfile } from '@/lib/enrichlayer'
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
import {
  checkLinkedInIdentity,
  identityCheckToDbFields,
  isLinkedInDataTrusted,
  reconcileStoredLinkedInIdentity,
  stripUntrustedLinkedInFields,
} from '@/lib/linkedin-identity'
import type { ABCProfile, ScannedContact } from '@/lib/types'
import { buildMeetingContext } from '@/lib/contact-enrichment-ui'
import type { EnrichmentStepId } from '@/lib/enrichment-steps'
import type { EnrichedLinkedInProfile, ResolvedLinkedInProfile } from '@/lib/enrichlayer'

export type EnrichmentOptions = {
  skipLinkedIn?: boolean
  linkedinUrlOverride?: string | null
  skipApolloLinkedIn?: boolean
}

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback
}

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

function pickLinkedInUrl(
  contact: ScannedContact,
  apolloLinkedInUrl: string | null | undefined,
  resolvedLinkedIn: ResolvedLinkedInProfile | null,
  options: EnrichmentOptions
): string | null {
  if (options.skipLinkedIn) return null
  if (options.linkedinUrlOverride) return options.linkedinUrlOverride

  const cardLinkedInUrl = contact.linkedin_url
  let resolvedUrl: string | null = null
  if (
    resolvedLinkedIn?.url &&
    (resolvedLinkedIn.similarityScore == null || resolvedLinkedIn.similarityScore >= 0.55)
  ) {
    resolvedUrl = resolvedLinkedIn.url
  }

  if (cardLinkedInUrl && !options.skipApolloLinkedIn) {
    return cardLinkedInUrl
  }

  if (resolvedUrl) return resolvedUrl

  if (!options.skipApolloLinkedIn && apolloLinkedInUrl) {
    return apolloLinkedInUrl
  }

  return cardLinkedInUrl || null
}

function deferCrmSync(
  profileRow: ABCProfile | null,
  userId: string,
  contact: ScannedContact,
  withMessages: Record<string, unknown>
) {
  void (async () => {
    try {
      const hubspotToken = (profileRow as { hubspot_access_token?: string } | null)?.hubspot_access_token
      if (hubspotToken) {
        await createHubSpotContact(
          {
            name: contact.name || '',
            email: (withMessages.email as string | undefined) || undefined,
            phone: contact.phone || undefined,
            company: contact.company || undefined,
            position: contact.role || undefined,
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
            name: contact.name || '',
            email: (withMessages.email as string | undefined) || undefined,
            phone: contact.phone || undefined,
            company: contact.company || undefined,
            position: contact.role || undefined,
          },
          userId
        )
      }
    } catch (e) {
      console.error('Salesforce sync error:', e)
    }
  })()
}

export async function runContactEnrichment(
  contactId: string,
  userId: string,
  options: EnrichmentOptions = {}
): Promise<void> {
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
  let c = contact as ScannedContact

  try {
    const storedIdentity = reconcileStoredLinkedInIdentity(c)
    if (storedIdentity) {
      await supabase
        .from('scanned_contacts')
        .update(storedIdentity)
        .eq('id', contactId)
        .eq('user_id', userId)
      c = { ...c, ...storedIdentity } as ScannedContact
    }

    await updateEnrichmentStep(contactId, userId, 'ENRICHING', 'apollo')

    const location = [c.billing_city, c.billing_country, c.meeting_location]
      .filter(Boolean)
      .join(', ')

    const linkedInResolvePromise =
      !options.skipLinkedIn &&
      !options.linkedinUrlOverride &&
      c.name &&
      c.company
        ? resolveLinkedInProfile({
            name: c.name,
            company: c.company,
            role: c.role,
            location: location || null,
          }).catch((err) => {
            console.error('LinkedIn resolve skipped:', err)
            return null
          })
        : Promise.resolve(null)

    const [apolloSettled, perplexitySettled, linkedinResolveSettled, intelligenceSettled] =
      await Promise.allSettled([
        enrichWithApollo(c.name, c.company, c.email),
        enrichContact(c.name, c.company, profile),
        linkedInResolvePromise,
        runIntelligenceResearch(
          {
            id: contactId,
            name: c.name,
            company: c.company,
            role: c.role,
            industry: c.industry,
          },
          supabase,
          profile
        ),
      ])

    const apolloData = settledValue(apolloSettled, null)
    const perplexityContext = settledValue(perplexitySettled, '')
    const resolvedLinkedIn = settledValue(linkedinResolveSettled, null)
    if (intelligenceSettled.status === 'rejected') {
      console.error('Intelligence research skipped:', intelligenceSettled.reason)
    }

    await updateEnrichmentStep(contactId, userId, 'ENRICHING', 'linkedin')

    const linkedinUrl = pickLinkedInUrl(c, apolloData?.linkedin_url, resolvedLinkedIn, options)
    let linkedinData: EnrichedLinkedInProfile | null = null
    let identityFields: Record<string, string | null> = storedIdentity ?? {
      linkedin_match_status: null,
      linkedin_match_confidence: null,
      linkedin_profile_name: null,
      linkedin_profile_company: null,
      linkedin_mismatch_reason: null,
    }

    const [linkedinSettled, emailSettled] = await Promise.allSettled([
      linkedinUrl
        ? enrichLinkedIn(linkedinUrl)
        : Promise.resolve(null),
      !c.email && c.name && c.company
        ? findWorkEmail(c.name, c.company)
        : Promise.resolve(null),
    ])

    linkedinData = settledValue(linkedinSettled, null)
    if (linkedinData) {
      const identityCheck = checkLinkedInIdentity(c, linkedinData)
      identityFields = identityCheckToDbFields(identityCheck)
    } else if (options.skipLinkedIn) {
      identityFields = {
        linkedin_match_status: 'rejected',
        linkedin_match_confidence: null,
        linkedin_profile_name: null,
        linkedin_profile_company: null,
        linkedin_mismatch_reason: 'LinkedIn enrichment skipped after profile rejection',
      }
    }

    let resolvedEmail = c.email
    const emailData = settledValue(emailSettled, null)
    if (!resolvedEmail && emailData && emailData.confidence > 0.7) {
      resolvedEmail = emailData.email
    }

    const baseRecord = {
      email: resolvedEmail,
      photo_url: apolloData?.photo_url || c.photo_url,
      linkedin_url: linkedinUrl || (options.skipLinkedIn ? null : c.linkedin_url),
      role: apolloData?.title || c.role,
      industry: apolloData?.company_industry || c.industry,
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
      ...identityFields,
    }

    const contactWithIdentity = {
      ...c,
      ...baseRecord,
    } as ScannedContact

    const contactForMandatoryEstimate = stripUntrustedLinkedInFields(contactWithIdentity)

    const mandatoryCompanyFields = await ensureMandatoryCompanyFields(contactForMandatoryEstimate).catch((err) => {
      console.error('Mandatory company field estimation skipped:', err)
      return {}
    })

    // Stage 1: flush company/profile data early so Contacts UI updates before messages
    await supabase
      .from('scanned_contacts')
      .update({
        ...baseRecord,
        ...mandatoryCompanyFields,
        enrichment_status: 'ENRICHING',
        enrichment_step: 'messages',
      })
      .eq('id', contactId)
      .eq('user_id', userId)

    await updateEnrichmentStep(contactId, userId, 'ENRICHING', 'messages')

    const { data: freshContactRow } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('id', contactId)
      .eq('user_id', userId)
      .single()

    const freshContact = (freshContactRow as ScannedContact | null) ?? contactWithIdentity
    const mergedForMessages = {
      ...freshContact,
      ...baseRecord,
      ...mandatoryCompanyFields,
    } as ScannedContact

    const contactForScoring = stripUntrustedLinkedInFields(mergedForMessages)
    const linkedinTrustedFresh = isLinkedInDataTrusted(mergedForMessages)

    const [aiScoreResult, aiMessages] = await Promise.all([
      calculateAiMatchScore(contactForScoring, profile).catch((err) => {
        console.error('AI match scoring skipped:', err)
        return null
      }),
      generatePersonalizedMessages(
        {
          ...stripUntrustedLinkedInFields(mergedForMessages),
          meeting_context: buildMeetingContext(mergedForMessages) || undefined,
        },
        profile,
        linkedinTrustedFresh ? linkedinData : null
      ).catch((err) => {
        console.error('AI message regeneration skipped:', err)
        return null
      }),
    ])

    const scoreFields = aiScoreResult
      ? aiScoreToDbFields(
          contactHasEventTag(contactForScoring)
            ? applyPersonalMeetingBonus(aiScoreResult)
            : aiScoreResult
        )
      : {
          ai_lead_score: calculateLeadScore({ ...contactForScoring, ...baseRecord }),
          match_score: calculateLeadScore({ ...contactForScoring, ...baseRecord }),
        }

    const withMessages = {
      ...baseRecord,
      ...mandatoryCompanyFields,
      ...scoreFields,
      message_linkedin: aiMessages?.message_linkedin || c.message_linkedin,
      message_email: aiMessages?.message_email || c.message_email,
      email_subject: aiMessages?.email_subject || c.email_subject,
      message_whatsapp: aiMessages?.message_whatsapp || c.message_whatsapp,
      enrichment_status: 'DONE' as const,
      enrichment_step: 'done' as const,
      scan_status: 'enriched' as const,
    }

    // Stage 2: messages, scores, and completion
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

    const matchScore =
      withMessages.ai_lead_score ?? withMessages.match_score ?? c.match_score ?? 50

    await onEnrichmentCompleted(contactId, userId, Number(matchScore) || 50)

    // CRM sync off critical path — user already sees DONE
    deferCrmSync(profileRow as ABCProfile | null, userId, c, withMessages)
  } catch (error) {
    console.error('runContactEnrichment error:', error)
    await updateEnrichmentStep(contactId, userId, 'ERROR', 'queued')
    throw error
  }
}

export function triggerBackgroundEnrichment(
  contactId: string,
  userId: string,
  options: EnrichmentOptions = {}
) {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  fetch(`${baseUrl}/api/enrich/run/${contactId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ...options }),
  }).catch((err) => {
    console.error('Background enrichment trigger failed, running inline:', err)
    runContactEnrichment(contactId, userId, options).catch(console.error)
  })
}
