import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { CARD_ACCENT_DEFAULT, LEGACY_CARD_ACCENTS } from '@/lib/card/types'
import { createServerSupabase } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const slug = decodeURIComponent(params.slug || '').trim().toLowerCase()
    const supabase = createServerSupabase()
    const { data: profile } = await supabase
      .from('abc_profiles')
      .select('full_name, job_title, role, company_name, company, card_accent, card_published, card_slug')
      .eq('card_slug', slug)
      .maybeSingle()

    if (!profile || !profile.card_published) {
      return new Response('Not found', { status: 404 })
    }

    const name = profile.full_name || 'ABC'
    const title = profile.job_title || profile.role || ''
    const company = profile.company_name || profile.company || ''
    const stored = (profile.card_accent || '').trim().toLowerCase()
    const accent =
      !stored || (LEGACY_CARD_ACCENTS as readonly string[]).includes(stored)
        ? CARD_ACCENT_DEFAULT
        : stored

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: 64,
            background: '#0a0a0b',
            position: 'relative',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 8,
              background: accent,
            }}
          />
          <div
            style={{
              display: 'flex',
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: 5,
              color: accent,
              marginBottom: 24,
            }}
          >
            ABC CARD
          </div>
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, color: '#ffffff', lineHeight: 1.1 }}>
            {name}
          </div>
          {(title || company) && (
            <div style={{ display: 'flex', fontSize: 28, color: '#a1a1aa', marginTop: 16 }}>
              {[title, company].filter(Boolean).join(' · ')}
            </div>
          )}
          <div
            style={{
              display: 'flex',
              marginTop: 40,
              width: 180,
              height: 6,
              borderRadius: 999,
              background: accent,
            }}
          />
        </div>
      ),
      { width: 1200, height: 630 }
    )
  } catch (err) {
    console.error('[card/og] error:', err)
    return new Response('OG error', { status: 500 })
  }
}
