import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServerSupabase } from '@/lib/supabase'
import { isValidCardSlug, normalizeCardSlug } from '@/lib/card/slug'

export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get('slug') || ''
    const slug = normalizeCardSlug(raw)

    if (!isValidCardSlug(slug)) {
      return NextResponse.json({
        available: false,
        slug,
        reason: 'Slug musí mít 3–40 znaků: a-z, 0-9, pomlčka.',
      })
    }

    const auth = createRouteHandlerClient()
    const {
      data: { user },
    } = await auth.auth.getUser()

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('abc_profiles')
      .select('id')
      .eq('card_slug', slug)
      .maybeSingle()

    if (error) {
      console.error('[card/slug-check] failed:', error)
      return NextResponse.json({ available: false, slug, reason: 'Kontrola selhala.' }, { status: 500 })
    }

    const takenByOther = Boolean(data && data.id !== user?.id)
    return NextResponse.json({
      available: !takenByOther,
      slug,
      reason: takenByOther ? 'Tento slug už někdo používá.' : null,
    })
  } catch (err) {
    console.error('[card/slug-check] error:', err)
    return NextResponse.json({ available: false, reason: 'Unexpected error' }, { status: 500 })
  }
}
