import { createServiceClient } from '@/lib/supabase/service'
import { PROFILE_SAFE_COLUMNS } from '@/lib/profile-defaults'
import { enrichContact } from '@/lib/perplexity'
import { enrichWithApollo } from '@/lib/apollo'
import { enrichLinkedIn, findWorkEmail, resolveLinkedInProfile } from '@/lib/enrichlayer'
import { generatePersonalizedMessages } from '@/lib/ai-messages'
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

const SOURCE_TIMEOUT_MS = 12_000

export type EnrichmentOptions = {
  skipLinkedIn?: boolean
  linkedinUrlOverride?: string | null
  skipApolloLinkedIn?: boolean
  /** When true, skip Phase 3 message generation (generate on demand later). */
  skipMessages?: boolean
}

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
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

async function patchContact(
  contactId: string,
  userId: string,
  patch: Record<string, unknown>
) {
  const supabase = createServiceClient()
  await supabase
    .from('scanned_contacts')
    .update(patch)
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
    /*
      HubSpot is not pushed here any more.

      Saving a scan used to create a HubSpot contact by itself, whenever a token
      happened to be present — an external system written to as a side effect of
      an internal one, with nothing on screen to say it had happened and no way
      to decline. Sending a customer's contacts into their CRM is an action they
      should take, not one that takes itself, so export becomes an explicit
      button in Phase 7B and this path stays silent until then.

      Removed here rather than gated on a flag: the tokens this branch read are
      moving out of abc_profiles entirely, so the condition would soon have been
      false for a reason nobody could see.
    */
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
    .select(PROFILE_SAFE_COLUMNS)
    .eq('id', userId)
    .single()

  const profile = (profileRow as ABCProfile | null) ?? ({} as ABCProfile)
  let c = contact as ScannedContact
  let sourcesOk = 0

  try {
    const storedIdentity = reconcileStoredLinkedInIdentity(c)
    if (storedIdentity) {
      await patchContact(contactId, userId, storedIdentity)
      c = { ...c, ...storedIdentity } as ScannedContact
    }

    await updateEnrichmentStep(contactId, userId, 'ENRICHING', 'apollo')

    const location = [c.billing_city, c.billing_country, c.meeting_location]
      .filter(Boolean)
      .join(', ')

    // ── Parallel sources with 12s timeout each + progressive DB patches ──
    const apolloPromise = withTimeout(
      enrichWithApollo(c.name, c.company, c.email),
      SOURCE_TIMEOUT_MS,
      'Apollo'
    )
      .then(async (apolloData) => {
        if (apolloData) {
          sourcesOk += 1
          await patchContact(contactId, userId, {
            photo_url: apolloData.photo_url || undefined,
            role: apolloData.title || undefined,
            industry: apolloData.company_industry || undefined,
            company_size: apolloData.company_size || undefined,
            company_revenue: apolloData.company_revenue || undefined,
            technologies: apolloData.technologies || undefined,
            linkedin_url: apolloData.linkedin_url || undefined,
            enrichment_status: 'ENRICHING',
            enrichment_step: 'apollo',
          })
        }
        return apolloData
      })
      .catch((err) => {
        console.error('Apollo skipped:', err)
        return null
      })

    const perplexityPromise = withTimeout(
      enrichContact(c.name, c.company, profile),
      SOURCE_TIMEOUT_MS,
      'Perplexity'
    )
      .then(async (perplexityContext) => {
        if (perplexityContext) {
          sourcesOk += 1
          await patchContact(contactId, userId, {
            enriched_context: perplexityContext,
            enrichment_status: 'ENRICHING',
            enrichment_step: 'perplexity',
          })
        }
        return perplexityContext
      })
      .catch((err) => {
        console.error('Perplexity skipped:', err)
        return ''
      })

    const linkedInResolvePromise =
      !options.skipLinkedIn &&
      !options.linkedinUrlOverride &&
      c.name &&
      c.company
        ? withTimeout(
            resolveLinkedInProfile({
              name: c.name,
              company: c.company,
              role: c.role,
              location: location || null,
            }),
            SOURCE_TIMEOUT_MS,
            'LinkedIn resolve'
          ).catch((err) => {
            console.error('LinkedIn resolve skipped:', err)
            return null
          })
        : Promise.resolve(null)

    const intelligencePromise = withTimeout(
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
      SOURCE_TIMEOUT_MS,
      'Intelligence research'
    ).catch((err) => {
      console.error('Intelligence research skipped:', err)
      return null
    })

    const [apolloSettled, perplexitySettled, linkedinResolveSettled] = await Promise.allSettled([
      apolloPromise,
      perplexityPromise,
      linkedInResolvePromise,
      intelligencePromise,
    ])

    // Re-read after progressive patches so we merge latest
    const { data: midRow } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('id', contactId)
      .eq('user_id', userId)
      .single()
    if (midRow) c = midRow as ScannedContact

    const apolloData = settledValue(apolloSettled, null)
    const perplexityContext = settledValue(perplexitySettled, '') || c.enriched_context || ''
    const resolvedLinkedIn = settledValue(linkedinResolveSettled, null)

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
        ? withTimeout(enrichLinkedIn(linkedinUrl), SOURCE_TIMEOUT_MS, 'LinkedIn enrich')
        : Promise.resolve(null),
      !c.email && c.name && c.company
        ? withTimeout(findWorkEmail(c.name, c.company), SOURCE_TIMEOUT_MS, 'Email find')
        : Promise.resolve(null),
    ])

    linkedinData = settledValue(linkedinSettled, null)
    if (linkedinData) {
      sourcesOk += 1
      const identityCheck = checkLinkedInIdentity(c, linkedinData)
      identityFields = identityCheckToDbFields(identityCheck)
      // Progressive LinkedIn flush
      await patchContact(contactId, userId, {
        linkedin_url: linkedinUrl,
        linkedin_headline: linkedinData.headline || undefined,
        linkedin_summary: linkedinData.summary || undefined,
        linkedin_experience: linkedinData.experiences || undefined,
        linkedin_skills: linkedinData.skills || undefined,
        linkedin_posts: linkedinData.recentPosts || undefined,
        linkedin_education: linkedinData.education || undefined,
        ...identityFields,
        enrichment_status: 'ENRICHING',
        enrichment_step: 'linkedin',
      })
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
      sourcesOk += 1
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

    // Stage 1 flush — company/profile visible before messages
    await patchContact(contactId, userId, {
      ...baseRecord,
      ...mandatoryCompanyFields,
      enrichment_status: 'ENRICHING',
      enrichment_step: options.skipMessages ? 'done' : 'messages',
    })

    if (sourcesOk === 0 && !apolloData && !perplexityContext && !linkedinData) {
      // All external sources failed — contact stays usable from OCR
      console.warn('[enrichment] all sources failed/timed out for', contactId)
    }

    // ── Phase 3: one Claude call for LinkedIn + Email + WhatsApp ──
    let withMessages: Record<string, unknown> = {
      ...baseRecord,
      ...mandatoryCompanyFields,
    }

    if (!options.skipMessages) {
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
        withTimeout(calculateAiMatchScore(contactForScoring, profile), SOURCE_TIMEOUT_MS, 'AI score').catch(
          (err) => {
            console.error('AI match scoring skipped:', err)
            return null
          }
        ),
        withTimeout(
          generatePersonalizedMessages(
            {
              ...stripUntrustedLinkedInFields(mergedForMessages),
              meeting_context: buildMeetingContext(mergedForMessages) || undefined,
            },
            profile,
            linkedinTrustedFresh ? linkedinData : null
          ),
          SOURCE_TIMEOUT_MS,
          'AI messages'
        ).catch((err) => {
          console.error('AI message generation skipped:', err)
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

      withMessages = {
        ...baseRecord,
        ...mandatoryCompanyFields,
        ...scoreFields,
        message_linkedin: aiMessages?.message_linkedin || c.message_linkedin,
        message_email: aiMessages?.message_email || c.message_email,
        email_subject: aiMessages?.email_subject || c.email_subject,
        message_whatsapp: aiMessages?.message_whatsapp || c.message_whatsapp,
      }
    }

    await patchContact(contactId, userId, {
      ...withMessages,
      enrichment_status: 'DONE',
      enrichment_step: 'done',
      scan_status: 'enriched',
    })

    const { data: enrichedRow } = await supabase
      .from('scanned_contacts')
      .select('*')
      .eq('id', contactId)
      .single()

    if (enrichedRow) {
      const sfMapping = buildPostEnrichmentMapping(enrichedRow, true)
      await patchContact(contactId, userId, sfMapping)
    }

    const matchScore =
      (withMessages.ai_lead_score as number | undefined) ??
      (withMessages.match_score as number | undefined) ??
      c.match_score ??
      50

    await onEnrichmentCompleted(contactId, userId, Number(matchScore) || 50)
    deferCrmSync(profileRow as ABCProfile | null, userId, c, withMessages)
  } catch (error) {
    console.error('runContactEnrichment error:', error)
    // Keep OCR data usable — mark failed, don't delete
    await updateEnrichmentStep(contactId, userId, 'ERROR', 'queued')
    throw error
  }
}

/**
 * Starts enrichment without blocking the caller's response.
 *
 * This used to POST to /api/card/enrich/[id] over HTTP. That route is now
 * session-authenticated, and a server-to-server fetch carries no cookies — so
 * the call would come back 401. Worse, a 401 is a *resolved* response rather
 * than a rejection, so the inline fallback below would never have fired and
 * enrichment would have failed silently.
 *
 * The hop was never doing anything the process could not do itself: the route
 * it called simply invoked this module's own function. Calling it directly
 * removes the round trip and the failure mode together.
 *
 * Authorization is unchanged and still the caller's job — every caller derives
 * `userId` from an authenticated session before reaching here, and the pipeline
 * scopes all of its reads and writes to that owner.
 */
export function triggerBackgroundEnrichment(
  contactId: string,
  userId: string,
  options: EnrichmentOptions = {}
) {
  runContactEnrichment(contactId, userId, options).catch((err) => {
    console.error('Background enrichment failed:', err)
  })
}
