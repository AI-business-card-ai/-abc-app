import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServerSupabase } from '@/lib/supabase'
import { createBatch } from '@/lib/scan/batch-store'
import type { BatchSourceKind } from '@/lib/scan/batch'

/**
 * Open a multi-card session.
 *
 * A batch exists before any photograph is taken, so every card the owner adds
 * has somewhere to land and the ten-card ceiling has something to count
 * against. It costs nothing: a draft nobody adds to is a row, not a contact.
 */

const SOURCE_KINDS: BatchSourceKind[] = ['single_photo', 'guided', 'mixed']

export async function POST(req: NextRequest) {
  try {
    const auth = createRouteHandlerClient()
    const {
      data: { user },
    } = await auth.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json().catch(() => ({}))) as { sourceKind?: string }
    const sourceKind = SOURCE_KINDS.includes(body.sourceKind as BatchSourceKind)
      ? (body.sourceKind as BatchSourceKind)
      : 'single_photo'

    const batch = await createBatch(createServerSupabase(), user.id, sourceKind)
    if (!batch) {
      return NextResponse.json({ error: 'Could not start this batch.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, batch })
  } catch (err) {
    console.error('[scan/batch] create failed:', err)
    return NextResponse.json({ error: 'Could not start this batch.' }, { status: 500 })
  }
}
