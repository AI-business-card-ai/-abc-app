import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import {
  extractBusinessCardFromImage,
  ClaudeVisionError,
  ClaudeAnalysisError,
} from '@/lib/claude'
import { contactMatchesOwnerProfile } from '@/lib/contact-owner-guard'
import { isScanLimitReached, getScanLimitForPlan } from '@/lib/scan-limits'
import {
  SCAN_CARD_UNREADABLE_ERROR,
  hasUsableCardData,
  isTechnicalScanReadError,
  sanitizeCardExtract,
} from '@/lib/scan-card-validation'
import { toCandidate } from '@/lib/scan/candidate'
import { ABCProfile } from '@/lib/types'

/** Capture sources the scanner can report; anything else is ignored. */
const CAPTURE_SOURCES = ['business_card', 'badge', 'qr', 'document', 'upload', 'auto'] as const

function normalizeCaptureSource(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null
  return (CAPTURE_SOURCES as readonly string[]).includes(value) ? value : null
}

function unreadableCardResponse(status = 422) {
  return NextResponse.json(
    { success: false, error: SCAN_CARD_UNREADABLE_ERROR },
    { status }
  )
}

/**
 * Reads a card and returns what it saw. It does not keep anyone.
 *
 * The response is a candidate: an in-memory shape for the review screen to
 * edit. Nothing reaches the database here — a contact exists only once the
 * owner has looked at the fields and pressed save, which is /api/scan/contact's
 * job and the single place a scan can create a row.
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

    // Enrichment is no longer part of the product, so a scan never queues one
    // regardless of what the caller asks for. The legacy `enrich` field is
    // still accepted and ignored so older clients do not error.
    const captureSource = normalizeCaptureSource(formData.get('source'))

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
    /*
      Which fields came back, never what was in them. These logs used to carry
      the scanned person's name and company, and the failure branch printed the
      whole extraction — email and phone included. That is a third party's
      contact details sitting in server logs, from someone who never agreed to
      it. Shape is what a diagnosis actually needs.
    */
    console.log('[card/scan] OCR complete', {
      hasName: Boolean(extracted.name),
      hasCompany: Boolean(extracted.company),
      hasEmail: Boolean(extracted.email),
      hasPhone: Boolean(extracted.phone),
    })

    if (!hasUsableCardData(extracted)) {
      console.warn('[card/scan] OCR returned no usable card data')
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

    /*
      Reading a card is not the same as keeping the person.

      This route used to insert the contact here, the moment the model returned
      — before the owner had seen a single field. Review then edited a row that
      already existed, and Discard left it behind: a contact nobody asked for,
      in the list forever. The fix is not to delete on discard, it is not to
      write until someone says yes.

      So the scan now ends at a candidate. Persistence belongs to
      /api/scan/contact, which is where the QR branch already created its
      contact and is now the single place a scan can produce a row.
    */
    const candidate = toCandidate(extracted)

    // The scan itself is what costs money, and it has now happened: the model
    // was called and answered. Whether the owner keeps the result is a separate
    // question from whether the work was done, so the quota moves here, where
    // the insert used to sit, rather than following the contact to save time.
    if (dbProfile.plan !== 'INTERNAL_TEST') {
      await supabase
        .from('abc_profiles')
        .update({ scans_used: used + 1 })
        .eq('id', userId)
    }

    return NextResponse.json({
      success: true,
      phase: 'basic',
      candidate,
      source: captureSource,
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
