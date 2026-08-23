import { NextRequest, NextResponse } from 'next/server'
import { mapProfileToCardData } from '@/lib/card/public-data'
import { splitName } from '@/lib/data-model'
import { createServerSupabase } from '@/lib/supabase'
import { normalizeAbcCardRef, resolveAbcCardProfile } from '@/lib/card/abc-identity'

/**
 * Resolves an ABC card QR into the identity fields the scanner's review step
 * needs — so scanning another ABC user goes straight into the normal capture
 * flow instead of bouncing out to a web page.
 *
 * Public by design (it returns what the public card already shows) and
 * deliberately narrow: identity only, never meeting context, notes, follow-ups
 * or anything else the owner has stored.
 */

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const identifier = decodeURIComponent(params.slug || '').trim()
    if (!identifier) {
      return NextResponse.json({ error: 'Missing identifier' }, { status: 400 })
    }

    const ref = normalizeAbcCardRef(req.nextUrl.searchParams.get('ref'))
    const supabase = createServerSupabase()

    /*
      The lookup — which column an identifier means, the UUID check on `card`,
      and the published rule for `/d/` — now lives beside the same lookup that
      saving a contact performs. Two copies of a visibility rule is one copy too
      many. The whole row comes back, like loadPublishedCardBySlug does, so a
      profile missing optional card columns still resolves; what leaves this
      route is the explicit whitelist built below, never the row itself.
    */
    const profile = await resolveAbcCardProfile(supabase, identifier, ref)

    if (!profile) {
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
