import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServerSupabase } from '@/lib/supabase'
import { applyItemPatches, loadBatch, saveSharedContext, type ItemPatch } from '@/lib/scan/batch-store'
import { emptySharedContext, type BatchSharedContext } from '@/lib/scan/batch'
import { isoOrNull } from '@/lib/encounters'

/**
 * Read a batch, or revise it before it is saved.
 *
 * PATCH covers the two things the review screen does: correct a misread field
 * and untick a card. It cannot move an item between batches, renumber it,
 * rewrite what the model saw, or claim a contact exists — those are facts about
 * the past or the server's to decide, and the column grants in the migration
 * say the same thing a second time.
 */

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = createRouteHandlerClient()
    const {
      data: { user },
    } = await auth.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const batch = await loadBatch(createServerSupabase(), user.id, params.id)
    if (!batch) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })

    return NextResponse.json({ success: true, batch })
  } catch (err) {
    console.error('[scan/batch] load failed:', err)
    return NextResponse.json({ error: 'Could not load this batch.' }, { status: 500 })
  }
}

type PatchBody = {
  sharedContext?: Partial<BatchSharedContext>
  items?: ItemPatch[]
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = createRouteHandlerClient()
    const {
      data: { user },
    } = await auth.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabase()
    const existing = await loadBatch(supabase, user.id, params.id)
    if (!existing) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })

    const body = (await req.json().catch(() => ({}))) as PatchBody

    if (body.sharedContext) {
      const incoming = { ...emptySharedContext(), ...body.sharedContext }
      await saveSharedContext(supabase, user.id, params.id, {
        event: String(incoming.event || ''),
        location: String(incoming.location || ''),
        discussed: String(incoming.discussed || ''),
        nextAction: String(incoming.nextAction || ''),
        // Parsed rather than trusted: an unparseable date reaching the column
        // is a 500 on a route that had nothing else wrong with it.
        followUpAt: isoOrNull(incoming.followUpAt),
        metAt: isoOrNull(incoming.metAt),
      })
    }

    if (Array.isArray(body.items) && body.items.length > 0) {
      /*
        An item whose contact already exists is left alone. Editing a card
        after it has become a person would change the batch record without
        changing the contact, and the two would quietly disagree; the contact
        screen is where a saved person is edited.
      */
      const editable = new Set(
        existing.items.filter((item) => !item.createdContactId).map((item) => item.id)
      )
      const patches = body.items.filter((patch) => editable.has(patch.id))
      if (patches.length > 0) await applyItemPatches(supabase, user.id, params.id, patches)
    }

    const batch = await loadBatch(supabase, user.id, params.id)
    return NextResponse.json({ success: true, batch })
  } catch (err) {
    console.error('[scan/batch] patch failed:', err)
    return NextResponse.json({ error: 'Could not update this batch.' }, { status: 500 })
  }
}
