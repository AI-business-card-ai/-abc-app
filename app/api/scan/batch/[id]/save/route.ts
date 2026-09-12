import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServerSupabase } from '@/lib/supabase'
import {
  applyItemPatches,
  capReselection,
  loadBatch,
  saveBatchContacts,
  saveSharedContext,
  type ItemPatch,
} from '@/lib/scan/batch-store'
import { emptySharedContext, type BatchSharedContext } from '@/lib/scan/batch'
import {
  chargeAcceptedCards,
  resolveScanEntitlement,
  type EntitlementProfile,
} from '@/lib/scan/entitlement'
import { ledgerKeys } from '@/lib/billing/ledger'
import { isoOrNull } from '@/lib/encounters'

/**
 * Turn the batch into contacts.
 *
 * The context and any last edits arrive with the save rather than as a separate
 * call the client has to remember to make first — one press of Save Contacts is
 * one request, and there is no window in which contacts exist without the
 * meeting the owner just typed.
 *
 * Re-runnable on purpose. A batch where three of ten failed can be saved again:
 * items that already produced a contact are skipped, so the second attempt
 * finishes the job instead of duplicating the seven that worked.
 */

export const runtime = 'nodejs'
export const maxDuration = 120

type Body = {
  sharedContext?: Partial<BatchSharedContext>
  items?: ItemPatch[]
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = createRouteHandlerClient()
    const {
      data: { user },
    } = await auth.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabase()
    const existing = await loadBatch(supabase, user.id, params.id)
    if (!existing) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })

    const body = (await req.json().catch(() => ({}))) as Body

    if (body.sharedContext) {
      const incoming = { ...emptySharedContext(), ...body.sharedContext }
      await saveSharedContext(supabase, user.id, params.id, {
        event: String(incoming.event || ''),
        location: String(incoming.location || ''),
        discussed: String(incoming.discussed || ''),
        nextAction: String(incoming.nextAction || ''),
        followUpAt: isoOrNull(incoming.followUpAt),
        metAt: isoOrNull(incoming.metAt),
      })
    }

    if (Array.isArray(body.items) && body.items.length > 0) {
      const editable = new Set(
        existing.items.filter((item) => !item.createdContactId).map((item) => item.id)
      )
      // A restore can never take the batch past ten active cards.
      const patches = capReselection(
        existing.items,
        body.items.filter((patch) => editable.has(patch.id))
      )
      if (patches.length > 0) await applyItemPatches(supabase, user.id, params.id, patches)
    }

    /*
      The balance is read immediately before the write and passed in as a cap,
      so a batch can never accept more cards than the owner can pay for.

      Every accepted card counts, including one that matched somebody already
      on file: a credit pays for reading a physical card, and that reading cost
      the same either way. The person already existing changes where the
      meeting lands, not what the work cost.
    */
    const { data: profileRow } = await supabase
      .from('abc_profiles')
      .select('id, plan, email, google_email, scans_used')
      .eq('id', user.id)
      .maybeSingle()

    if (!profileRow) {
      return NextResponse.json({ error: 'Profile unavailable' }, { status: 500 })
    }

    const profile = profileRow as EntitlementProfile & { id: string }
    // The verified session user, so founder access is decided by identity.
    const entitlement = await resolveScanEntitlement(supabase, profile, user)

    const result = await saveBatchContacts(supabase, user.id, params.id, entitlement.available)
    if (!result) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })

    /*
      Charged for the cards this attempt accepted, and nothing else.

      That single fact carries the whole credit contract: a false detection is
      never accepted, an unticked card is never accepted, a card that failed to
      save is never accepted, and a card that already succeeded is skipped
      before it can be charged again. A retry therefore pays for exactly the
      cards it completes on that attempt.
    */
    await chargeAcceptedCards(
      supabase,
      profile,
      user,
      result.paidItemIds.map((itemId) => ({
        source: 'batch_item' as const,
        ref: itemId,
        idempotencyKey: ledgerKeys.batchItem(itemId),
      }))
    )

    if (result.created.length === 0 && result.failed.length === 0) {
      return NextResponse.json(
        { error: 'Select at least one card to save.', reason: 'nothing_selected' },
        { status: 400 }
      )
    }

    /*
      200 even when some cards failed. A partial save is a real outcome the
      screen renders card by card — seven saved, three to fix — and collapsing
      it into an error would throw away the seven.
    */
    return NextResponse.json({
      success: true,
      batch: result.batch,
      created: result.created,
      failed: result.failed,
      newContacts: result.newContacts,
      creditsConsumed: result.creditsConsumed,
      linkedContacts: result.linkedContacts,
      stoppedForCredits: result.stoppedForCredits,
    })
  } catch (err) {
    console.error('[scan/batch] save failed:', err)
    return NextResponse.json({ error: 'Could not save these contacts.' }, { status: 500 })
  }
}
