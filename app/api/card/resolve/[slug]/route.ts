import { NextRequest, NextResponse } from 'next/server'
import { mapProfileToCardData } from '@/lib/card/public-data'
import { splitName } from '@/lib/data-model'
import { createServerSupabase } from '@/lib/supabase'

/**
 * Resolves an ABC card QR into the identity fields the scanner's review step
 * needs — so scanning another ABC user goes straight into the normal capture
 * flow instead of bouncing out to a web page.
 *
 * Public by design (it returns what the public card already shows) and
 * deliberately narrow: identity only, never meeting context, notes, follow-ups
 * or anything else the owner has stored.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type Ref = 'd' | 'u' | 'card'

function refFrom(value: string | null): Ref {
  return value === 'u' || value === 'card' ? value : 'd'
}

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const identifier = decodeURIComponent(params.slug || '').trim()
    if (!identifier) {
      return NextResponse.json({ error: 'Missing identifier' }, { status: 400 })
    }

    const ref = refFrom(req.nextUrl.searchParams.get('ref'))
    const supabase = createServerSupabase()

    // Selects the whole row, like loadPublishedCardBySlug does, so a profile
    // schema that is missing optional card columns still resolves. What leaves
    // this route is the explicit whitelist built below, never the row itself.
    let query = supabase.from('abc_profiles').select('*')

    if (ref === 'card') {
      if (!UUID_RE.test(identifier)) {
        return NextResponse.json({ error: 'Card not found' }, { status: 404 })
      }
      query = query.eq('id', identifier)
    } else if (ref === 'u') {
      query = query.eq('user_name', identifier.toLowerCase())
    } else {
      query = query.eq('card_slug', identifier.toLowerCase())
    }

    const { data: profile, error } = await query.maybeSingle()

    if (error) {
      console.error('[card/resolve] lookup failed:', error)
      return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
    }
    if (!profile) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }

    // A /d/ card must be published to be readable. The /u/ and /card/ aliases
    // predate publishing and stay readable, matching what those pages render.
    if (ref === 'd' && !profile.card_published) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }

    const card = mapProfileToCardData(profile as Record<string, unknown>)
    const { first_name, last_name } = splitName(card.fullName)

    void supabase.from('card_views').insert({
      user_id: card.userId,
      source: 'scan',
      referrer: null,
    })

    return NextResponse.json(
      {
        ok: true,
        card: {
          name: card.fullName,
          first_name,
          last_name,
          company: card.companyName,
          role: card.jobTitle,
          email: card.showEmail ? card.email : null,
          phone: card.showPhone ? card.phone : null,
          website: card.showWebsite ? card.website : null,
          linkedin_url: card.linkedinUrl,
          photo_url: card.photoUrl,
          url: profile.card_slug ? `https://abccard.io/d/${profile.card_slug}` : null,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    console.error('[card/resolve] error:', err)
    return NextResponse.json({ error: 'Resolve failed' }, { status: 500 })
  }
}
