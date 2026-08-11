import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
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
    const accent = profile.card_accent || '#f0197d'

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
            background: '#0f0f0f',
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
              background: `linear-gradient(90deg, ${accent}, #00d4d4)`,
            }}
          />
          <div style={{ display: 'flex', fontSize: 28, fontWeight: 800, color: '#00d4d4', marginBottom: 24 }}>
            ABC
          </div>
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, color: '#ffffff', lineHeight: 1.1 }}>
            {name}
          </div>
          {(title || company) && (
            <div style={{ display: 'flex', fontSize: 28, color: '#999999', marginTop: 16 }}>
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
              background: `linear-gradient(90deg, ${accent}, #00d4d4)`,
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
