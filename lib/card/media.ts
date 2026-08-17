'use client'

import {
  CARD_MEDIA_MAX_BYTES,
  CARD_MEDIA_MAX_EDGE,
  type CardMediaKind,
} from '@/lib/card/media-shared'

export type { CardMediaKind, CardProfileMediaKind } from '@/lib/card/media-shared'
export { CARD_MEDIA_LABELS } from '@/lib/card/media-shared'

export type UploadResult = { url: string } | { error: string }

/**
 * Formats a browser can hand us directly. HEIC/HEIF from an iPhone is not on
 * this list on purpose — it is decoded and re-encoded to JPEG below, because
 * Safari can decode it but most other browsers cannot display it.
 */
const DIRECT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const HEIC_TYPES = new Set(['image/heic', 'image/heif'])

/**
 * Transparency is worth preserving on a logo and mandatory on a hero cutout;
 * an ordinary portrait is not worth the bytes.
 *
 * Getting this wrong is silent and fatal: JPEG has no alpha, so a cutout
 * re-encoded as JPEG comes back as a person on a white rectangle, which is
 * exactly the pasted-on look hero mode exists to avoid.
 */
function outputTypeFor(kind: CardMediaKind, sourceType: string): 'image/png' | 'image/jpeg' {
  if (kind === 'cutout') return 'image/png'
  if (kind === 'logo' && (sourceType === 'image/png' || sourceType === 'image/webp')) {
    return 'image/png'
  }
  return 'image/jpeg'
}

export function validateCardImage(file: File, kind?: CardMediaKind): string | null {
  const type = (file.type || '').toLowerCase()

  if (!DIRECT_TYPES.has(type) && !HEIC_TYPES.has(type)) {
    // An empty type happens on some Android pickers — let the decoder decide.
    if (type) return 'That image format is not supported. Use JPG, PNG or WebP.'
  }

  // A JPEG cannot carry transparency, so accepting one here would produce a
  // person on a white block and look like a bug rather than a wrong file.
  if (kind === 'cutout' && type && type !== 'image/png' && type !== 'image/webp') {
    return 'A hero portrait needs a transparent background — use a PNG or WebP file.'
  }
  if (file.size > CARD_MEDIA_MAX_BYTES) {
    return 'That image is too large. Keep it under 10 MB.'
  }
  if (file.size === 0) {
    return 'That image looks empty. Try another file.'
  }
  return null
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // Fall through to the <img> path — Safari decodes some formats there
      // that createImageBitmap refuses.
    }
  }

  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('decode failed'))
      img.src = url
    })
  } finally {
    // Revoked on the next tick so the decoded image keeps its data.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

/**
 * Resize and re-encode in the browser. This is also what makes an iPhone HEIC
 * usable: Safari decodes it, and what leaves here is always JPEG or PNG.
 */
async function prepare(file: File, kind: CardMediaKind): Promise<File> {
  const outputType = outputTypeFor(kind, (file.type || '').toLowerCase())
  const maxEdge = CARD_MEDIA_MAX_EDGE[kind]

  const source = await decode(file)
  const width = 'width' in source ? source.width : 0
  const height = 'height' in source ? source.height : 0
  if (!width || !height) throw new Error('decode failed')

  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const targetW = Math.max(1, Math.round(width * scale))
  const targetH = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')

  // JPEG has no alpha; without this a transparent source turns black.
  if (outputType === 'image/jpeg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, targetW, targetH)
  }
  ctx.drawImage(source as CanvasImageSource, 0, 0, targetW, targetH)
  if ('close' in source && typeof source.close === 'function') source.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, outputType, outputType === 'image/jpeg' ? 0.86 : undefined)
  )
  if (!blob) throw new Error('encode failed')

  const ext = outputType === 'image/png' ? 'png' : 'jpg'
  return new File([blob], `${kind}.${ext}`, { type: outputType })
}

/**
 * Upload one card image. Returns the public URL to store on the profile.
 * The object name is unique per upload, so the returned URL is never a cached
 * copy of the previous image.
 */
export async function uploadCardMedia(kind: CardMediaKind, file: File): Promise<UploadResult> {
  const validation = validateCardImage(file, kind)
  if (validation) return { error: validation }

  let prepared: File
  try {
    prepared = await prepare(file, kind)
  } catch (err) {
    console.error('[card/media] could not process image:', err)
    if (HEIC_TYPES.has((file.type || '').toLowerCase())) {
      return {
        error:
          'This browser cannot read iPhone HEIC photos. In iOS: Settings → Camera → Formats → Most Compatible, or pick a JPG.',
      }
    }
    return { error: 'That image could not be read. Try a JPG, PNG or WebP.' }
  }

  try {
    const body = new FormData()
    body.append('kind', kind)
    body.append('file', prepared)

    const res = await fetch('/api/card/media', { method: 'POST', body })
    const json = (await res.json().catch(() => null)) as { url?: string; error?: string } | null

    if (!res.ok || !json?.url) {
      return { error: json?.error || 'The upload did not complete. Try again.' }
    }
    return { url: json.url }
  } catch (err) {
    console.error('[card/media] upload request failed:', err)
    return { error: 'No connection while uploading. Check your signal and try again.' }
  }
}

/** Best-effort removal of a replaced object. Clearing the field is what matters. */
export async function removeCardMedia(url: string): Promise<void> {
  if (!url) return
  try {
    await fetch(`/api/card/media?url=${encodeURIComponent(url)}`, { method: 'DELETE' })
  } catch (err) {
    console.error('[card/media] remove request failed:', err)
  }
}
