import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { createServerSupabase } from '@/lib/supabase'
import { CARD_PUBLIC_BASE } from '@/lib/card/types'

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const slug = decodeURIComponent(params.slug || '').trim().toLowerCase()
    if (!slug) {
      return NextResponse.json({ error: 'Missing slug' }, { status: 400 })
    }

    const supabase = createServerSupabase()
    const { data: profile, error } = await supabase
      .from('abc_profiles')
      .select('id, card_slug, card_published')
      .eq('card_slug', slug)
      .maybeSingle()

    if (error) {
      console.error('[card/qr] profile lookup failed:', error)
      return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
    }
    if (!profile || !profile.card_published) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }

    const sizeParam = Number(req.nextUrl.searchParams.get('size') || '512')
    const size = Number.isFinite(sizeParam)
      ? Math.min(2048, Math.max(128, Math.floor(sizeParam)))
      : 512

    const url = `${CARD_PUBLIC_BASE}/${slug}?src=qr`
    const png = await QRCode.toBuffer(url, {
      type: 'png',
      width: size,
      margin: 2,
      color: { dark: '#0f0f0f', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })

    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (err) {
    console.error('[card/qr] error:', err)
    return NextResponse.json({ error: 'QR generation failed' }, { status: 500 })
  }
}
