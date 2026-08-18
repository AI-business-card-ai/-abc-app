'use client'

import {
  CARD_MEDIA_MAX_BYTES,
  CARD_MEDIA_MAX_EDGE,
  IMAGE_SNIFF_BYTES,
  isSupportedImageType,
  sniffImageType,
  type CardMediaKind,
  type SupportedImageType,
} from '@/lib/card/media-shared'

export type { CardMediaKind, CardProfileMediaKind } from '@/lib/card/media-shared'
export { CARD_MEDIA_LABELS } from '@/lib/card/media-shared'

export type UploadResult = { url: string } | { error: string }

/**
 * HEIC/HEIF is never stored as-is: Safari can decode it but most other
 * browsers cannot display it, so it is re-encoded to JPEG below. It has no
 * signature this pipeline reads, which is why it is named here explicitly.
 */
const HEIC_TYPES = new Set(['image/heic', 'image/heif'])

/**
 * What this file really is.
 *
 * The browser's `File.type` is a hint, not a fact, and on iOS it is often
 * neither: a transparent sticker or a pick from Files can arrive with an empty
 * type or `application/octet-stream`. The old check read that metadata and
 * refused anything it did not recognise, which rejected genuine iPhone cutouts
 * before they were ever decoded.
 *
 * So the claim is used only when it names a format we support, and otherwise
 * the first bytes decide. Nothing here proves the file is a usable image —
 * that is what decoding it does — this only stops metadata from being the
 * reason a valid cutout is turned away.
 */
async function resolveImageType(file: File): Promise<SupportedImageType | null> {
  const claimed = (file.type || '').toLowerCase()
  if (isSupportedImageType(claimed)) return claimed

  try {
    const head = new Uint8Array(await file.slice(0, IMAGE_SNIFF_BYTES).arrayBuffer())
    return sniffImageType(head)
  } catch {
    return null
  }
}

/** An error carrying a message meant for the owner, not for a log. */
class ImageError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage)
  }
}

/**
 * Whether the image actually has transparency, or merely the ability to.
 *
 * A PNG exported flattened is still a PNG, and hero mode would paste it over
 * the artwork as a rectangle. Catching it here lets the owner be told the true
 * problem — that the background is still there — instead of being handed a
 * format error about a file whose format was never wrong.
 *
 * A pixel is treated as transparent below 250 rather than below 255 because a
 * real cutout's edge is anti-aliased, and some encoders round the outermost
 * fully-clear pixels a shade off zero.
 */
function hasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(0, 0, width, height).data
  } catch {
    // A tainted canvas cannot be read. Never block an upload over it — the
    // check is a courtesy, and refusing here would be a worse failure than
    // the one it is trying to describe.
    return true
  }
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) return true
  }
  return false
}

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

export async function validateCardImage(
  file: File,
  kind?: CardMediaKind
): Promise<string | null> {
  // Size first: it needs no bytes read, and a 40 MB file should be refused
  // before anything tries to slice it.
  if (file.size > CARD_MEDIA_MAX_BYTES) {
    return 'That image is too large. Keep it under 10 MB.'
  }
  if (file.size === 0) {
    return 'That image looks empty. Try another file.'
  }

  const claimed = (file.type || '').toLowerCase()
  const resolved = await resolveImageType(file)

  // HEIC has no signature we read, and Safari can still decode it — the
  // re-encode below is what makes an iPhone photo usable elsewhere.
  if (!resolved && !HEIC_TYPES.has(claimed)) {
    return 'That file is not an image we can read. Use a PNG, WebP or JPG.'
  }

  // A JPEG cannot carry transparency, so accepting one for a cutout would
  // produce a person on a white block — a wrong file, stated as such. This
  // now judges the bytes, so an iPhone PNG with no MIME metadata gets through.
  if (kind === 'cutout' && resolved === 'image/jpeg') {
    return 'A hero portrait needs a transparent background — use a PNG or WebP file.'
  }
  if (kind === 'cutout' && !resolved) {
    return 'A hero portrait needs a transparent background — use a PNG or WebP file.'
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
  const resolved = await resolveImageType(file)
  const outputType = outputTypeFor(kind, resolved || (file.type || '').toLowerCase())
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

  // The whole point of a hero cutout is the absence of a background. A
  // supported image that simply still has one is not an unreadable file, and
  // saying so is the difference between the owner fixing it and giving up.
  if (kind === 'cutout' && !hasTransparency(ctx, targetW, targetH)) {
    throw new ImageError('This image does not have a transparent background.')
  }

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
  const validation = await validateCardImage(file, kind)
  if (validation) return { error: validation }

  let prepared: File
  try {
    prepared = await prepare(file, kind)
  } catch (err) {
    // A judgement about the image, already worded for the owner, is passed
    // through rather than flattened into "could not be read".
    if (err instanceof ImageError) return { error: err.userMessage }

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
