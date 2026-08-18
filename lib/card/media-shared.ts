/** Shared between the browser helper and the upload route — no client imports here. */

export const CARD_MEDIA_BUCKET = 'card-media'
export const CARD_MEDIA_MAX_BYTES = 10 * 1024 * 1024

export type CardMediaKind = 'photo' | 'cover' | 'logo' | 'showcase' | 'cutout'

/**
 * The three images stored directly on the profile row. Showcase images are
 * rows in their own table and the cutout lives inside card_media_transforms,
 * so anything keyed "one per card field" means these.
 */
export type CardProfileMediaKind = Exclude<CardMediaKind, 'showcase' | 'cutout'>

/**
 * Kinds whose transparency must survive the upload. Everything else is
 * re-encoded to JPEG for weight; these would lose the alpha channel that is
 * the entire point of them.
 */
export const ALPHA_MEDIA_KINDS: CardMediaKind[] = ['cutout', 'logo']

/**
 * Every kind the upload route will accept.
 *
 * A record rather than an array, and deliberately so. This was an array that
 * listed four of the five kinds — `cutout` was added to the union when hero
 * portraits arrived and never added here — so the route rejected every single
 * cutout upload, automatic and manual alike, with "Unknown image type." An
 * array of a union type accepts a partial list without complaint; a record
 * keyed by the union does not compile until every kind is present, which is
 * the only version of this list that cannot silently fall behind again.
 */
const KINDS: Record<CardMediaKind, true> = {
  photo: true,
  cover: true,
  logo: true,
  showcase: true,
  cutout: true,
}

export function isCardMediaKind(value: string): value is CardMediaKind {
  return Object.prototype.hasOwnProperty.call(KINDS, value)
}

/* ─── Image identification ─── */

/** The three encodings the card pipeline stores. */
export type SupportedImageType = 'image/png' | 'image/jpeg' | 'image/webp'

export const EXT_BY_IMAGE_TYPE: Record<SupportedImageType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export function isSupportedImageType(value: string): value is SupportedImageType {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp'
}

/**
 * What the bytes actually are, regardless of what the browser claimed.
 *
 * MIME metadata is not evidence. An iPhone handing over a transparent sticker
 * or a file picked out of Files can arrive with an empty `type`, with
 * `application/octet-stream`, or with something non-canonical — none of which
 * says anything about the content. Rejecting on that metadata turned away
 * perfectly good cutouts, so the signature is read instead and the claimed
 * type is used only when it happens to agree with a format we support.
 *
 * This identifies; it does not validate. Bytes that pass here are still
 * decoded before anything is stored, so a file that merely starts with the
 * right eight bytes cannot masquerade as an image.
 */
export function sniffImageType(bytes: Uint8Array): SupportedImageType | null {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png'
  }

  // JPEG: SOI marker, then any segment.
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }

  // RIFF....WEBP — the four size bytes between the two tags are skipped.
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }

  return null
}

/** Bytes enough for the longest signature above, with room to spare. */
export const IMAGE_SNIFF_BYTES = 16

export const CARD_MEDIA_LABELS: Record<CardMediaKind, { title: string; help: string }> = {
  photo: {
    title: 'Profile photo',
    help: 'Your face or personal portrait.',
  },
  cover: {
    title: 'Cover image',
    help: 'A wide background image shown at the top of your public card.',
  },
  logo: {
    title: 'Company logo',
    help: 'Your company or personal brand logo.',
  },
  showcase: {
    title: 'Showcase image',
    help: 'A photo of your work — a project, a product, an installation.',
  },
  cutout: {
    title: 'Hero portrait',
    help: 'A portrait with the background already removed, as PNG or WebP.',
  },
}

/** Longest edge each kind is resized to before upload. */
export const CARD_MEDIA_MAX_EDGE: Record<CardMediaKind, number> = {
  photo: 1024,
  cover: 2000,
  logo: 800,
  // Big enough to stay sharp full-screen on a modern phone, small enough that
  // eight of them over fair wifi is not a punishment.
  showcase: 1600,
  // A hero cutout is displayed large but never full-bleed, and PNG with alpha
  // is heavy — this keeps a person crisp without shipping a 4 MB layer.
  cutout: 1400,
}

/**
 * Showcase objects go in their own folder under the same owner-scoped prefix.
 * The upload route derives this from the session, never from the client, and
 * the delete path check only trusts a path starting with the caller's own id.
 */
export function cardMediaPath(userId: string, kind: CardMediaKind, ext: string): string {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  if (kind === 'showcase') return `${userId}/showcase/${unique}.${ext}`
  // The cutout is a second asset beside the original, never a replacement for
  // it: photo-… and photo-cutout-… coexist, so the owner can always go back.
  if (kind === 'cutout') return `${userId}/photo-cutout-${unique}.${ext}`
  return `${userId}/${kind}-${Date.now()}.${ext}`
}
