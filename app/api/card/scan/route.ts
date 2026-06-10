import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase'
import {
  analyzeBusinessCard,
  extractBusinessCardFromImage,
  ClaudeVisionError,
  ClaudeAnalysisError,
} from '@/lib/claude'
import { enrichContact } from '@/lib/perplexity'
import { ABCProfile } from '@/lib/types'

const EMPTY_PROFILE = {} as ABCProfile

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const image = formData.get('image') as File
    const userId = formData.get('userId') as string
    const userProfileRaw = formData.get('userProfile') as string

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

    const extracted = await extractBusinessCardFromImage(base64, claudeMediaType)

    const supabase = createServerSupabase()

    const { data: profile } = await supabase
      .from('abc_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    const profileForPrompt = (profile as ABCProfile | null) ?? userProfile

    let enrichedContext = ''
    try {
      enrichedContext = await enrichContact(
        extracted.name,
        extracted.company,
        profile || EMPTY_PROFILE
      )
    } catch (err) {
      console.error('Perplexity enrichment skipped:', err)
      enrichedContext = ''
    }

    const result = await analyzeBusinessCard(
      base64,
      profileForPrompt,
      enrichedContext,
      claudeMediaType
    )

    const { data, error } = await supabase
      .from('scanned_contacts')
      .insert({
        user_id: userId,
        ...result,
        enriched_context: enrichedContext || null,
        status: 'pending',
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, contact: data })
  } catch (err) {
    console.error('Scan error details:', JSON.stringify(err))

    if (err instanceof ClaudeVisionError || err instanceof ClaudeAnalysisError) {
      return NextResponse.json({ error: err.message }, { status: 502 })
    }

    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : JSON.stringify(err),
      },
      { status: 500 }
    )
  }
}
