import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServerSupabase } from '@/lib/supabase'

export async function GET() {
  try {
    const auth = createRouteHandlerClient()
    const {
      data: { user },
    } = await auth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerSupabase()
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const [{ count: views }, { count: vcardSaves }, { count: exchanges }, { data: links }] =
      await Promise.all([
        supabase
          .from('card_views')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('created_at', since)
          .neq('source', 'vcard'),
        supabase
          .from('card_views')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('source', 'vcard')
          .gte('created_at', since),
        supabase
          .from('scanned_contacts')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('source', 'card_exchange')
          .gte('created_at', since),
        supabase.from('card_links').select('click_count').eq('user_id', user.id),
      ])

    const linkClicks = (links || []).reduce(
      (sum, row) => sum + (typeof row.click_count === 'number' ? row.click_count : 0),
      0
    )

    return NextResponse.json({
      views: views || 0,
      vcardSaves: vcardSaves || 0,
      exchanges: exchanges || 0,
      linkClicks,
    })
  } catch (err) {
    console.error('[card/analytics] error:', err)
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 })
  }
}
