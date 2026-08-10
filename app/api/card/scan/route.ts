import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import {
  extractBusinessCardFromImage,
  ClaudeVisionError,
  ClaudeAnalysisError,
} from '@/lib/claude'
import { onCardScanned } from '@/lib/crm-engine'
import { triggerBackgroundEnrichment } from '@/lib/enrichment'
import { contactMatchesOwnerProfile, warnIfContactMatchesOwnerProfile } from '@/lib/contact-owner-guard'
import { isScanLimitReached, getScanLimitForPlan } from '@/lib/scan-limits'
import {
  SCAN_CARD_UNREADABLE_ERROR,
  hasUsableCardData,
  isTechnicalScanReadError,
  sanitizeCardExtract,
} from '@/lib/scan-card-validation'
import { ABCProfile } from '@/lib/types'

function unreadableCardResponse(status = 422) {
  return NextResponse.json(
    { success: false, error: SCAN_CARD_UNREADABLE_ERROR },
    { status }
  )
}

/**
 * Phase 1 — Instant scan (target <3s):
 * OCR only → save PENDING contact → fire-and-forget Phase 2 enrichment.
 *
 * Plan / scans_used for limit checks ALWAYS come from the server-side
 * abc_profiles row keyed by auth.uid() — never from client FormData.
 */
export async function POST(req: NextRequest) {
  console.log('=== SCAN PHASE 1 (OCR) START ===')

  try {
    const authClient = createRouteHandlerClient()
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = user.id

    const formData = await req.formData()
    const image = formData.get('image') as File
    const formUserId = formData.get('userId') as string | null
    const userProfileRaw = formData.get('userProfile') as string

    if (!image) return NextResponse.json({ error: 'No image' }, { status: 400 })

    // Reject forged userId if client sends a different one
    if (formUserId && formUserId !== userId) {
      return NextResponse.json({ error: 'User mismatch' }, { status: 403 })
    }

    // Client profile is only for message-style preferences — never for plan/limits
    let clientProfile: Partial<ABCProfile> = {}
    if (userProfileRaw) {
      try {
        clientProfile = JSON.parse(userProfileRaw) as Partial<ABCProfile>
      } catch {
        return NextResponse.json({ error: 'Invalid userProfile JSON' }, { status: 400 })
      }
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

    let { data: profileRow } = await supabase
      .from('abc_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    // Auto-create on first scan — always free / 0. INTERNAL_TEST is DB-only.
    if (!profileRow) {
      const { data: created, error: createError } = await supabase
        .from('abc_profiles')
        .insert({
          id: userId,
          email: user.email ?? null,
          google_email: user.email ?? null,
          full_name: (user.user_metadata?.full_name as string | undefined) || null,
          plan: 'free',
          scans_used: 0,
        })
        .select('*')
        .single()

      if (createError) {
        console.error('[card/scan] auto-create profile failed:', createError)
        // Race: row may have been created concurrently
        const { data: retry } = await supabase
          .from('abc_profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle()
        profileRow = retry
      } else {
        profileRow = created
      }
    }

    if (!profileRow) {
      return NextResponse.json({ error: 'Profile unavailable' }, { status: 500 })
    }

    // Limit check — server profile only (plan / scans_used never from client)
    const dbProfile = profileRow as ABCProfile
    const used = dbProfile.scans_used || 0

    if (isScanLimitReached(dbProfile)) {
      const plan = dbProfile.plan || 'free'
      const limit = getScanLimitForPlan(plan)
      return NextResponse.json(
        { error: 'SCAN_LIMIT_REACHED', plan, used, limit },
        { status: 403 }
      )
    }

    // Enrichment preferences may come from client, but plan/scans/email from DB
    const profile: ABCProfile = {
      ...clientProfile,
      ...dbProfile,
      id: userId,
      plan: dbProfile.plan,
      scans_used: dbProfile.scans_used,
      email: dbProfile.email || user.email || clientProfile.email || null,
    } as ABCProfile

    const extracted = sanitizeCardExtract(await extractBusinessCardFromImage(base64, claudeMediaType))
    console.log('Phase 1 OCR complete:', extracted.name, extracted.company)

    if (!hasUsableCardData(extracted)) {
      console.warn('[card/scan] OCR returned no usable card data', extracted)
      return unreadableCardResponse()
    }

    const ownerMatch = contactMatchesOwnerProfile(extracted, profile)
    if (ownerMatch.matches) {
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

    if (error) {
      console.error('[card/scan] insert failed:', error)
      if (isTechnicalScanReadError(error.message)) {
        return unreadableCardResponse()
      }
      throw error
    }

    // Don't increment counter for unlimited internal accounts (optional hygiene)
    if (dbProfile.plan !== 'INTERNAL_TEST') {
      await supabase
        .from('abc_profiles')
        .update({ scans_used: used + 1 })
        .eq('id', userId)
    }

    const contact = data?.[0] ?? null
    if (contact) {
      await warnIfContactMatchesOwnerProfile(userId, contact, 'card/scan')
      onCardScanned(contact.id, userId).catch(console.error)
      triggerBackgroundEnrichment(contact.id, userId)
    }

    console.log('=== SCAN PHASE 1 DONE — enrichment queued ===')

    return NextResponse.json({
      success: true,
      phase: 'basic',
      contactId: contact?.id ?? null,
      extractedData: extracted,
      contact,
      contacts: data,
      count: data?.length || 0,
    })
  } catch (err) {
    console.error('Scan error:', err)

    if (err instanceof ClaudeVisionError || err instanceof ClaudeAnalysisError) {
      return unreadableCardResponse(502)
    }

    const message = err instanceof Error ? err.message : JSON.stringify(err)
    if (isTechnicalScanReadError(message)) {
      return unreadableCardResponse()
    }

    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
