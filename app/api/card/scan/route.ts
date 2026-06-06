import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { analyzeBusinessCard, extractBusinessCardFromImage } from '@/lib/claude'
import { enrichContact } from '@/lib/perplexity'
import { ABCProfile } from '@/lib/types'

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

    let enrichedData = ''
    if (process.env.PERPLEXITY_API_KEY && (extracted.name || extracted.company)) {
      try {
        enrichedData = await enrichContact(
          extracted.name ?? '',
          extracted.company ?? '',
          userProfile
        )
      } catch (err) {
        console.warn('[scan] Perplexity enrichment failed:', err)
      }
    }

    const result = await analyzeBusinessCard(base64, userProfile, mediaType, enrichedData)

    const supabase = createAdminClient()
    const { data, error } = await supabase
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
