import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServerSupabase } from '@/lib/supabase'
import {
  CARD_MEDIA_BUCKET,
  CARD_MEDIA_MAX_BYTES,
  EXT_BY_IMAGE_TYPE,
  IMAGE_SNIFF_BYTES,
  cardMediaPath,
  isCardMediaKind,
  sniffImageType,
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
      // Not about the image at all — the client asked to store a kind of media
      // this route does not know. It read "Unknown image type." for a long
      // time, which sent everyone hunting through file formats for a bug that
      // was in a list of five strings.
      return NextResponse.json({ error: 'That upload kind is not recognised.' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No image was received. Try again.' }, { status: 400 })
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

    /*
      Identify from the bytes, not from what the request claimed.

      `file.type` on a multipart upload is whatever the client put there, and
      on iOS it is frequently empty or `application/octet-stream` even for a
      perfectly good PNG. Trusting it decided both the stored extension and the
      Content-Type served back to every visitor, so a missing header meant a
      valid image was refused — and a wrong one meant a file served under a
      type it was not.

      The signature decides, on its own. The claimed type is not consulted even
      as a fallback: this endpoint is reachable by anything holding a session,
      and letting a `Content-Type: image/png` header speak for bytes that are
      not a PNG would store arbitrary content and hand it to every visitor
      under an image type. Bytes we cannot identify are refused.
    */
    const bytes = Buffer.from(await file.arrayBuffer())
    const imageType = sniffImageType(new Uint8Array(bytes.subarray(0, IMAGE_SNIFF_BYTES)))

    if (!imageType) {
      return NextResponse.json(
        { error: 'That file could not be read as an image. Use a PNG, WebP or JPG.' },
        { status: 415 }
      )
    }

    // A hero cutout is a transparent layer by definition, and JPEG has no
    // alpha channel to be transparent with.
    if (kind === 'cutout' && imageType === 'image/jpeg') {
      return NextResponse.json(
        { error: 'A hero portrait needs a transparent background — use a PNG or WebP file.' },
        { status: 415 }
      )
    }

    // A fresh object name per upload means the public URL always changes, so a
    // replaced image can never be masked by a cached copy of the old one.
    const path = cardMediaPath(user.id, kind, EXT_BY_IMAGE_TYPE[imageType])
    const supabase = createServerSupabase()

    const { error } = await supabase.storage.from(CARD_MEDIA_BUCKET).upload(path, bytes, {
      contentType: imageType,
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
