import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { linkId?: string }
    const linkId = typeof body.linkId === 'string' ? body.linkId.trim() : ''
    if (!linkId) {
      return NextResponse.json({ error: 'Missing linkId' }, { status: 400 })
    }

    const supabase = createServerSupabase()
    const { data: link, error } = await supabase
      .from('card_links')
      .select('id, click_count')
      .eq('id', linkId)
      .maybeSingle()

    if (error || !link) {
      console.error('[card/link-click] lookup failed:', error)
      return NextResponse.json({ error: 'Link not found' }, { status: 404 })
    }

    const next = (link.click_count || 0) + 1
    const { error: updateError } = await supabase
      .from('card_links')
      .update({ click_count: next })
      .eq('id', linkId)

    if (updateError) {
      console.error('[card/link-click] update failed:', updateError)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, click_count: next })
  } catch (err) {
    console.error('[card/link-click] error:', err)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
