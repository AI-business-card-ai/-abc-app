import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase'
import {
  analyzeBusinessCard,
  extractBusinessCardFromImage,
  ClaudeVisionError,
  ClaudeAnalysisError,
} from '@/lib/claude'
import { onCardScanned } from '@/lib/crm-engine'
import { triggerBackgroundEnrichment } from '@/lib/enrichment'
import { ABCProfile } from '@/lib/types'

export async function POST(req: NextRequest) {
  console.log('=== SCAN START ===')

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

    const limits: Record<string, number> = {
      free: 3,
      starter: 50,
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

    const useFastScan = formData.get('fastScan') !== 'false'

    let contacts: Awaited<ReturnType<typeof analyzeBusinessCard>>

    if (useFastScan) {
      const extracted = await extractBusinessCardFromImage(base64, claudeMediaType)
      contacts = [
        {
          ...extracted,
          industry: null,
          company_size: null,
          company_summary: extracted.company ? `${extracted.company} contact` : null,
          match_score: 0,
          match_reason: 'Scanned via ABC — AI scoring after enrichment.',
          message_linkedin: '',
          message_email: '',
          email_subject: '',
          message_whatsapp: '',
        },
      ]
    } else {
      contacts = await analyzeBusinessCard(
        base64,
        profile,
        '',
        claudeMediaType,
        note,
        eventName
      )
    }
    console.log(`Detected ${contacts.length} business card(s)`)

    const pendingContacts = contacts.map((contact) => ({
      ...contact,
      user_id: userId,
      status: 'pending' as const,
      event_name: eventName || null,
      notes: note || null,
      enrichment_status: 'PENDING' as const,
      enrichment_step: 'queued',
    }))

    const { data, error } = await supabase
      .from('scanned_contacts')
      .insert(pendingContacts)
      .select()

    if (error) throw error

    await supabase
      .from('abc_profiles')
      .update({ scans_used: used + 1 })
      .eq('id', userId)

    if (data) {
      for (const c of data) {
        onCardScanned(c.id, userId).catch(console.error)
        triggerBackgroundEnrichment(c.id, userId)
      }
    }

    return NextResponse.json({
      success: true,
      contacts: data,
      count: data?.length || 0,
    })
  } catch (err) {
    console.error('Scan error:', err)

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
