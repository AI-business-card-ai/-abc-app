import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase'
import {
  analyzeBusinessCard,
  ClaudeVisionError,
  ClaudeAnalysisError,
} from '@/lib/claude'
import { enrichContact } from '@/lib/perplexity'
import { enrichWithApollo } from '@/lib/apollo'
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

    // 1. Extrahuj data z vizitky
    const claudeResult = await analyzeBusinessCard(base64, profile, '', claudeMediaType)

    // 2. Apollo + Perplexity PARALELNĚ (rychlost + odolnost proti chybám)
    console.log('Calling Apollo + Perplexity in parallel:', claudeResult.name, claudeResult.company)
    const [apolloData, perplexityContext] = await Promise.all([
      enrichWithApollo(
        claudeResult.name,
        claudeResult.company,
        claudeResult.email
      ).catch((err) => {
        console.error('Apollo enrichment skipped:', err)
        return null
      }),
      enrichContact(
        claudeResult.name,
        claudeResult.company,
        profile
      ).catch((err) => {
        console.error('Perplexity enrichment skipped:', err)
        return ''
      }),
    ])

    let enrichedContext = perplexityContext || ''
    if (apolloData) {
      enrichedContext = enrichedContext + '\nApollo data: ' + JSON.stringify(apolloData)
    }

    console.log('Perplexity result:', enrichedContext?.substring(0, 200))
    console.log('Enriched context length:', enrichedContext?.length)
    console.log('Enriched context preview:', enrichedContext?.substring(0, 200))

    // 3. Přegeneruj zprávy s Perplexity kontextem + poznámkami uživatele
    const finalResult = await analyzeBusinessCard(
      base64,
      profile,
      enrichedContext,
      claudeMediaType,
      note,
      eventName
    )

    // 4. Ulož do Supabase včetně enriched_context
    const { data, error } = await supabase
      .from('scanned_contacts')
      .insert({
        user_id: userId,
        ...finalResult,
        photo_url: apolloData?.photo_url || null,
        linkedin_url: apolloData?.linkedin_url || finalResult.linkedin_url,
        company_size: apolloData?.company_size || finalResult.company_size,
        company_revenue: apolloData?.company_revenue || null,
        technologies: apolloData?.technologies || null,
        notes: note,
        event_name: eventName,
        enriched_context: enrichedContext,
        status: 'pending',
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, contact: data })
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
