import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServerSupabase } from '@/lib/supabase'
import {
  ClaudeAnalysisError,
  ClaudeVisionError,
  extractBusinessCardsFromImage,
} from '@/lib/claude'
import { readScanEntitlement } from '@/lib/scan/entitlement'
import { isTechnicalScanReadError } from '@/lib/scan-card-validation'
import {
  appendDetectedCards,
  loadBatch,
  markBatchSource,
  remainingCapacity,
} from '@/lib/scan/batch-store'
import { MAX_BATCH_CARDS } from '@/lib/scan/batch'
import type { ABCProfile } from '@/lib/types'

/**
 * Read one photograph into the batch.
 *
 * Called once for a single photo holding several cards, and once per shot in a
 * guided session — the same endpoint either way, because the difference is how
 * many cards come back, not what happens to them. Nothing here creates a
 * contact: like `/api/card/scan`, this ends at reviewable data, and only
 * `/save` can produce a person.
 */

export const runtime = 'nodejs'
/** A vision call on a ten-card photo is not a two-second request. */
export const maxDuration = 120

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = createRouteHandlerClient()
    const {
      data: { user },
    } = await auth.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabase()

    const batch = await loadBatch(supabase, user.id, params.id)
    if (!batch) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })
    if (batch.status === 'saved') {
      return NextResponse.json(
        { error: 'This batch has already been saved.' },
        { status: 409 }
      )
    }

    const capacity = await remainingCapacity(supabase, user.id, params.id)
    if (capacity <= 0) {
      return NextResponse.json(
        { error: `A batch holds up to ${MAX_BATCH_CARDS} cards.`, reason: 'batch_full' },
        { status: 409 }
      )
    }

    const form = await req.formData()
    const image = form.get('image')
    if (!(image instanceof File)) {
      return NextResponse.json({ error: 'No image.' }, { status: 400 })
    }

    const { data: profileRow } = await supabase
      .from('abc_profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (!profileRow) {
      return NextResponse.json({ error: 'Profile unavailable' }, { status: 500 })
    }

    /*
      Reading is checked against the balance; it does not spend it.

      A Smart Scan credit buys a kept card, so the charge belongs at save,
      where a card becomes a person. Detection that finds a coffee cup, a card
      that fails to store, and a card the owner unticks all cost nothing —
      which is only true if nothing is deducted here.

      The balance is still consulted, because reading twenty cards for somebody
      who can keep none of them is a worse experience than telling them now.
    */
    const profile = profileRow as ABCProfile
    const entitlement = readScanEntitlement(profile)

    if (entitlement.available <= 0) {
      return NextResponse.json(
        { error: 'SCAN_LIMIT_REACHED', available: 0 },
        { status: 403 }
      )
    }

    /*
      How many cards to ask the model for. Capped by what is left in the batch
      and by what the owner could actually keep — reading fifteen when two can
      be kept is work nobody can use. The response says plainly when the balance
      rather than the photo decided, because truncating silently would be the
      app quietly choosing which of the people you met you get to keep.
    */
    const allowed = Math.max(
      0,
      Math.min(capacity, entitlement.unmetered ? capacity : entitlement.available)
    )

    const buffer = Buffer.from(await image.arrayBuffer())
    const supported = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    const mediaType = supported.includes(image.type) ? image.type : 'image/jpeg'

    const detected = await extractBusinessCardsFromImage(
      buffer.toString('base64'),
      mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
      allowed
    )

    /*
      Shape only. These logs used to be the obvious place for a scanned
      person's name and company to end up, and a batch would put ten of them
      there at once.
    */
    console.log('[scan/batch] detected', {
      batchId: params.id,
      found: detected.length,
      allowed,
    })

    if (detected.length === 0) {
      return NextResponse.json(
        {
          success: false,
          reason: 'no_cards',
          error:
            'No business cards found in that photo. Lay the cards flat, fill the frame and try again.',
        },
        { status: 422 }
      )
    }

    const items = await appendDetectedCards(
      supabase,
      user.id,
      params.id,
      detected,
      batch.items.length
    )

    if (items.length === 0) {
      return NextResponse.json({ error: 'Could not store the detected cards.' }, { status: 500 })
    }

    // No credit is spent here. See the note above the balance check: a credit
    // buys a kept card, and nothing has been kept yet.

    const refreshed = await loadBatch(supabase, user.id, params.id)

    /*
      Provenance, corrected as the session actually unfolds. A batch opens as
      `single_photo`; the moment a second photograph joins it, it was a guided
      session and says so.
    */
    const photos = (refreshed?.items.length || 0) > items.length ? 'guided' : batch.sourceKind
    if (photos !== batch.sourceKind) {
      await markBatchSource(supabase, user.id, params.id, 'guided')
    }

    return NextResponse.json({
      success: true,
      batch: photos === batch.sourceKind ? refreshed : { ...refreshed, sourceKind: 'guided' },
      added: items.length,
      /*
        Set when the balance, not the photo, decided how many cards came back.
        The review screen says so rather than letting the owner assume the
        camera missed them.
      */
      cappedByPlan:
        !entitlement.unmetered &&
        entitlement.available < capacity &&
        detected.length >= allowed,
      remaining: Math.max(0, MAX_BATCH_CARDS - (refreshed?.items.length || 0)),
    })
  } catch (err) {
    console.error('[scan/batch] detect failed:', err)

    if (err instanceof ClaudeVisionError || err instanceof ClaudeAnalysisError) {
      return NextResponse.json(
        { error: 'That photo could not be read. Try again with more light.' },
        { status: 502 }
      )
    }

    const message = err instanceof Error ? err.message : 'Could not read that photo.'
    if (isTechnicalScanReadError(message)) {
      return NextResponse.json(
        { error: 'That photo could not be read. Try again with more light.' },
        { status: 422 }
      )
    }

    return NextResponse.json({ error: 'Could not read that photo.' }, { status: 500 })
  }
}
