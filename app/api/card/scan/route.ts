import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase'
import {
  extractBusinessCardFromImage,
  ClaudeVisionError,
  ClaudeAnalysisError,
} from '@/lib/claude'
import { onCardScanned } from '@/lib/crm-engine'
import { triggerBackgroundEnrichment } from '@/lib/enrichment'
import { contactMatchesOwnerProfile, warnIfContactMatchesOwnerProfile } from '@/lib/contact-owner-guard'
import { isScanLimitReached, getScanLimitForPlan } from '@/lib/scan-limits'
import { ABCProfile } from '@/lib/types'

export async function POST(req: NextRequest) {
  console.log('=== SCAN PHASE 1 START ===')

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

    const supabase = createServerSupabase()

    const { data: profileRow } = await supabase
      .from('abc_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    const profile: ABCProfile = (profileRow as ABCProfile | null) ?? userProfile

    const used = profile?.scans_used || 0

    if (isScanLimitReached(profile)) {
      const plan = profile?.plan || 'free'
      const limit = getScanLimitForPlan(plan)
      return NextResponse.json(
        { error: 'SCAN_LIMIT_REACHED', plan, used, limit },
        { status: 403 }
      )
    }

    const extracted = await extractBusinessCardFromImage(base64, claudeMediaType)
    console.log('Phase 1 OCR complete:', extracted.name, extracted.company)

    const ownerMatch = contactMatchesOwnerProfile(extracted, profile)
    if (ownerMatch.matches) {
      console.warn('[card/scan] blocked — OCR result matches owner abc_profiles (not a scanned contact)', {
        userId,
        matchedFields: ownerMatch.reasons,
        extracted,
      })
      return NextResponse.json(
        {
          error:
            'This looks like your own profile, not a business card contact. Complete Setup only saves your profile — scan someone else\'s card.',
          code: 'OWNER_PROFILE_MATCH',
          matchedFields: ownerMatch.reasons,
        },
        { status: 400 }
      )
    }

    const pendingContacts = [
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
        user_id: userId,
        status: 'pending' as const,
        scan_status: 'basic' as const,
        event_name: null,
        notes: null,
        enrichment_status: 'PENDING' as const,
        enrichment_step: 'queued',
      },
    ]

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
        await warnIfContactMatchesOwnerProfile(userId, c, 'card/scan')
        onCardScanned(c.id, userId).catch(console.error)
        triggerBackgroundEnrichment(c.id, userId)
      }
    }

    console.log('=== SCAN PHASE 1 DONE — enrichment queued ===')

    return NextResponse.json({
      success: true,
      phase: 'basic',
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
