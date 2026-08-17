import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServerSupabase } from '@/lib/supabase'
import {
  CARD_MEDIA_BUCKET,
  CARD_MEDIA_MAX_BYTES,
  cardMediaPath,
  isCardMediaKind,
} from '@/lib/card/media-shared'

/**
 * Card media upload.
 *
 * Uploads run server-side on purpose. Storage has RLS enabled with no insert
 * policy for authenticated users, so a browser upload with the anon key is
 * rejected outright ("new row violates row-level security policy"). Rather
 * than open storage up, the object is written here with the service role after
 * the session is verified, and the object path is derived from the session
 * user — never from anything the client sends.
 */

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

function publicUrlFor(path: string): string {
  const supabase = createServerSupabase()
  return supabase.storage.from(CARD_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl
}

/** Only paths inside the caller's own folder may be touched. */
function pathFromUrl(url: string, userId: string): string | null {
  const marker = `/${CARD_MEDIA_BUCKET}/`
  const at = url.indexOf(marker)
  if (at < 0) return null
  const path = decodeURIComponent(url.slice(at + marker.length)).split('?')[0]
  if (!path.startsWith(`${userId}/`) || path.includes('..')) return null
  return path
}

export async function POST(req: NextRequest) {
  try {
    const auth = createRouteHandlerClient()
    const {
      data: { user },
    } = await auth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'You are signed out. Sign in and try again.' }, { status: 401 })
    }

    const formData = await req.formData()
    const kind = String(formData.get('kind') || '')
    const file = formData.get('file')

    if (!isCardMediaKind(kind)) {
      return NextResponse.json({ error: 'Unknown image type.' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No image was received. Try again.' }, { status: 400 })
    }

    const ext = EXT_BY_TYPE[file.type]
    if (!ext) {
      return NextResponse.json(
        { error: 'That image format is not supported. Use JPG, PNG or WebP.' },
        { status: 415 }
      )
    }
    if (file.size > CARD_MEDIA_MAX_BYTES) {
      return NextResponse.json(
        { error: 'That image is too large. Keep it under 10 MB.' },
        { status: 413 }
      )
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'That image looks empty. Try another file.' }, { status: 400 })
    }

    // A fresh object name per upload means the public URL always changes, so a
    // replaced image can never be masked by a cached copy of the old one.
    const path = cardMediaPath(user.id, kind, ext)
    const supabase = createServerSupabase()

    const { error } = await supabase.storage
      .from(CARD_MEDIA_BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type,
        cacheControl: '31536000',
        upsert: false,
      })

    if (error) {
      console.error('[card/media] upload failed:', error)
      return NextResponse.json({ error: 'The upload did not complete. Try again.' }, { status: 502 })
    }

    return NextResponse.json({ ok: true, url: publicUrlFor(path), path })
  } catch (err) {
    console.error('[card/media] unexpected error:', err)
    return NextResponse.json({ error: 'The upload did not complete. Try again.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = createRouteHandlerClient()
    const {
      data: { user },
    } = await auth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'You are signed out. Sign in and try again.' }, { status: 401 })
    }

    const url = req.nextUrl.searchParams.get('url') || ''
    const path = pathFromUrl(url, user.id)

    // Nothing to remove is not an error — the card field is cleared either way.
    if (!path) return NextResponse.json({ ok: true, removed: false })

    const supabase = createServerSupabase()
    const { error } = await supabase.storage.from(CARD_MEDIA_BUCKET).remove([path])
    if (error) {
      console.error('[card/media] remove failed:', error)
      return NextResponse.json({ ok: true, removed: false })
    }

    return NextResponse.json({ ok: true, removed: true })
  } catch (err) {
    console.error('[card/media] unexpected delete error:', err)
    return NextResponse.json({ ok: true, removed: false })
  }
}
