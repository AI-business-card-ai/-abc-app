import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase'
import { loadPublishedCardBySlug } from '@/lib/card/public-data'
import { splitName } from '@/lib/data-model'

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const slug = decodeURIComponent(params.slug || '').trim().toLowerCase()
    if (!slug) {
      return NextResponse.json({ error: 'Missing slug' }, { status: 400 })
    }

    const supabase = createServerSupabase()
    const card = await loadPublishedCardBySlug(supabase, slug)
    if (!card) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }

    // Track vCard download as a view source
    void supabase.from('card_views').insert({
      user_id: card.userId,
      source: 'vcard',
      referrer: null,
    })

    const { first_name, last_name } = splitName(card.fullName)
    const noteParts = [card.tagline, card.whatIDo].filter(Boolean).join(' — ')

    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${escapeVCard(card.fullName)}`,
      `N:${escapeVCard(last_name)};${escapeVCard(first_name)};;;`,
    ]

    if (card.jobTitle) lines.push(`TITLE:${escapeVCard(card.jobTitle)}`)
    if (card.companyName) lines.push(`ORG:${escapeVCard(card.companyName)}`)
    if (card.phone) lines.push(`TEL;TYPE=CELL:${escapeVCard(card.phone)}`)
    if (card.email) lines.push(`EMAIL:${escapeVCard(card.email)}`)
    if (card.website) lines.push(`URL:${escapeVCard(card.website)}`)
    if (card.location) lines.push(`ADR;TYPE=WORK:;;${escapeVCard(card.location)};;;;`)
    if (noteParts) lines.push(`NOTE:${escapeVCard(noteParts)}`)
    if (card.photoUrl) lines.push(`PHOTO;VALUE=URI:${card.photoUrl}`)

    const socials: [string, string | null][] = [
      ['linkedin', card.linkedinUrl],
      ['instagram', card.instagramUrl],
      ['twitter', card.xUrl],
      ['facebook', card.facebookUrl],
      ['youtube', card.youtubeUrl],
      ['tiktok', card.tiktokUrl],
      ['github', card.githubUrl],
      ['threads', card.threadsUrl],
    ]
    for (const [type, url] of socials) {
      if (url) lines.push(`X-SOCIALPROFILE;TYPE=${type}:${url}`)
    }

    lines.push('END:VCARD')
    const body = lines.join('\r\n')

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/vcard; charset=utf-8',
        'Content-Disposition': `attachment; filename="${slug}.vcf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[card/vcard] error:', err)
    return NextResponse.json({ error: 'Failed to build vCard' }, { status: 500 })
  }
}

function escapeVCard(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}
