import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase'
import {
  analyzeBusinessCard,
  ClaudeVisionError,
  ClaudeAnalysisError,
} from '@/lib/claude'
import { enrichContact } from '@/lib/perplexity'
import { enrichWithApollo } from '@/lib/apollo'
import { enrichLinkedIn, findWorkEmail } from '@/lib/enrichlayer'
import { generatePersonalizedMessages } from '@/lib/ai-messages'
import { createHubSpotContact } from '@/lib/hubspot'
import { createSalesforceContact } from '@/lib/salesforce'
import { calculateLeadScore, logActivity } from '@/lib/crm'
import { ABCProfile } from '@/lib/types'

export async function POST(req: NextRequest) {
  console.log('=== SCAN START ===')
  console.log('PERPLEXITY_API_KEY exists:', !!process.env.PERPLEXITY_API_KEY)
  console.log('PERPLEXITY_API_KEY prefix:', process.env.PERPLEXITY_API_KEY?.substring(0, 10))

  try {
    const formData = await req.formData()
    const image = formData.get('image') as File
    const userId = formData.get('userId') as string
    const userProfileRaw = formData.get('userProfile') as string
    const note = (formData.get('note') as string) || null
    const eventName = (formData.get('eventName') as string) || null

    if (!image) return NextResponse.json({ error: 'No image' }, { status: 400 })
    if (!userId) return NextResponse.json({ error: 'No userId' }, { status: 401 })

    let userProfile: ABCProfile
    try {
      userProfile = JSON.parse(userProfileRaw)
    } catch {
      return NextResponse.json({ error: 'Invalid userProfile JSON' }, { status: 400 })
    }

    const arrayBuffer = await image.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    let mediaType = image.type || 'image/jpeg'
    const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!supportedTypes.includes(mediaType)) {
      mediaType = 'image/jpeg'
    }

    const base64 = buffer.toString('base64')
    const claudeMediaType = mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

    const supabase = createServerSupabase()

    const { data: profileRow } = await supabase
      .from('abc_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    const profile: ABCProfile = (profileRow as ABCProfile | null) ?? userProfile

    // 0. Kontrola scan limitu podle plánu
    const limits: Record<string, number> = {
      free: 3,
      basic: 20,
      pro: 100,
      team: 500,
    }
    const plan = profile?.plan || 'free'
    const limit = limits[plan] || 3
    const used = profile?.scans_used || 0

    if (used >= limit) {
      return NextResponse.json(
        { error: 'SCAN_LIMIT_REACHED', plan, used, limit },
        { status: 403 }
      )
    }

    // 1. Extrahuj kontakty z fotky (1 nebo více vizitek najednou)
    const contacts = await analyzeBusinessCard(
      base64,
      profile,
      '',
      claudeMediaType,
      note,
      eventName
    )
    console.log(`Detected ${contacts.length} business card(s)`)

    // 2. Pro každý kontakt spusť Apollo + Perplexity + Enrich Layer (odolné proti chybám)
    const enrichedContacts = await Promise.all(
      contacts.map(async (contact) => {
        const [apolloData, perplexityContext] = await Promise.all([
          enrichWithApollo(contact.name, contact.company, contact.email).catch((err) => {
            console.error('Apollo enrichment skipped:', err)
            return null
          }),
          enrichContact(contact.name, contact.company, profile).catch((err) => {
            console.error('Perplexity enrichment skipped:', err)
            return ''
          }),
        ])

        const linkedinUrl = apolloData?.linkedin_url || contact.linkedin_url
        let linkedinData = null
        if (linkedinUrl) {
          linkedinData = await enrichLinkedIn(linkedinUrl).catch((err) => {
            console.error('EnrichLayer LinkedIn skipped:', err)
            return null
          })
        }

        let resolvedEmail = contact.email
        if (!resolvedEmail && contact.name && contact.company) {
          const emailData = await findWorkEmail(contact.name, contact.company).catch((err) => {
            console.error('EnrichLayer email lookup skipped:', err)
            return null
          })
          if (emailData && emailData.confidence > 0.7) {
            resolvedEmail = emailData.email
          }
        }

        const baseRecord = {
          ...contact,
          email: resolvedEmail,
          photo_url: apolloData?.photo_url || null,
          linkedin_url: linkedinUrl || null,
          company_size: apolloData?.company_size || contact.company_size,
          company_revenue: apolloData?.company_revenue || null,
          technologies: apolloData?.technologies || null,
          enriched_context: perplexityContext || '',
          linkedin_headline: linkedinData?.headline || null,
          linkedin_summary: linkedinData?.summary || null,
          linkedin_experience: linkedinData?.experiences || null,
          linkedin_skills: linkedinData?.skills || null,
          linkedin_posts: linkedinData?.recentPosts || null,
          linkedin_education: linkedinData?.education || null,
          user_id: userId,
          status: 'pending' as const,
          event_name: eventName || null,
          notes: note || null,
        }

        const aiMessages = await generatePersonalizedMessages(
          {
            ...baseRecord,
            meeting_context: eventName || note,
          },
          profile,
          linkedinData
        ).catch((err) => {
          console.error('AI message regeneration skipped:', err)
          return null
        })

        const withMessages = {
          ...baseRecord,
          message_linkedin: aiMessages?.message_linkedin || contact.message_linkedin,
          message_email: aiMessages?.message_email || contact.message_email,
          email_subject: aiMessages?.email_subject || contact.email_subject,
          message_whatsapp: aiMessages?.message_whatsapp || contact.message_whatsapp,
        }

        return {
          ...withMessages,
          ai_lead_score: calculateLeadScore(withMessages),
        }
      })
    )

    // 3. Ulož všechny kontakty do Supabase
    const { data, error } = await supabase
      .from('scanned_contacts')
      .insert(enrichedContacts)
      .select()

    if (error) throw error

    // 4. Increment scan counter po úspěšném scanu
    await supabase
      .from('abc_profiles')
      .update({ scans_used: used + 1 })
      .eq('id', userId)

    // 5. HubSpot auto-sync (nesmí zastavit scan při chybě)
    try {
      const hubspotToken = (profileRow as { hubspot_access_token?: string } | null)?.hubspot_access_token
      if (hubspotToken && data) {
        for (const c of data) {
          await createHubSpotContact(
            {
              name: c.name || '',
              email: c.email || undefined,
              phone: c.phone || undefined,
              company: c.company || undefined,
              position: c.role || undefined,
            },
            userId
          )
        }
      }
    } catch (e) {
      console.error('HubSpot sync error:', e)
    }

    // 6. Salesforce auto-sync (nesmí zastavit scan při chybě)
    try {
      const salesforceToken = (profileRow as { salesforce_access_token?: string } | null)
        ?.salesforce_access_token
      if (salesforceToken && data) {
        for (const c of data) {
          await createSalesforceContact(
            {
              name: c.name || '',
              email: c.email || undefined,
              phone: c.phone || undefined,
              company: c.company || undefined,
              position: c.role || undefined,
            },
            userId
          )
        }
      }
    } catch (e) {
      console.error('Salesforce sync error:', e)
    }

    // 7. CRM activity log (non-blocking)
    try {
      if (data) {
        for (const c of data) {
          logActivity({
            contactId: c.id,
            userId,
            activityType: 'CARD_SCANNED',
            activityDetail: `Business card scanned: ${c.name || 'Unknown'}`,
            metadata: { eventName, company: c.company },
          }).catch(console.error)

          logActivity({
            contactId: c.id,
            userId,
            activityType: 'AI_ENRICHED',
            activityDetail: `AI enrichment completed for ${c.name || 'Unknown'}`,
          }).catch(console.error)
        }
      }
    } catch (e) {
      console.error('CRM activity log error:', e)
    }

    return NextResponse.json({
      success: true,
      contacts: data,
      count: data?.length || 0,
    })
  } catch (err) {
    console.error('Scan error:', err)
    console.error('Scan error details:', JSON.stringify(err))

    if (err instanceof ClaudeVisionError || err instanceof ClaudeAnalysisError) {
      return NextResponse.json(
        {
          error:
            'Could not read the business card. Please try again with better lighting.',
        },
        { status: 502 }
      )
    }

    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : JSON.stringify(err),
      },
      { status: 500 }
    )
  }
}
