import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { createServerClient } from '@/lib/supabase'
import { analyzeBusinessCard, extractBusinessCardFromImage } from '@/lib/claude'
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

    const userProfile: ABCProfile = JSON.parse(userProfileRaw)
    const arrayBuffer = await image.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const mediaType = image.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

    const extracted = await extractBusinessCardFromImage(base64, mediaType)

    const supabase = createServerClient()
    const { data: profile } = await supabase
      .from('abc_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    const profileForPrompt = (profile as ABCProfile | null) ?? userProfile

    const enrichedContext = await enrichContact(
      extracted.name,
      extracted.company,
      profile || EMPTY_PROFILE
    )

    const result = await analyzeBusinessCard(
      base64,
      profileForPrompt,
      mediaType,
      enrichedContext
    )

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('scanned_contacts')
      .insert({
        user_id: userId,
        ...result,
        status: 'pending',
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, contact: data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
