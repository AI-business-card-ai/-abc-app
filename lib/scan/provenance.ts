import type { AbcCardRef } from '@/lib/scan/qr-parse'

/**
 * How a candidate was captured, kept apart from what was captured.
 *
 * `ContactCandidate` is the person — eight fields someone can edit. This is the
 * circumstance: which device path produced them, what sort of thing was read,
 * and for another ABC card, which card. They are separate types because they
 * have separate lifetimes and separate trust. The candidate is edited freely by
 * the owner; provenance is a record of what happened and is never typed into a
 * form.
 *
 * Nothing here identifies the scanned person. The ABC slug is a pointer the
 * server re-resolves for itself; no account or profile id travels from the
 * client, because a claim about someone else's identity is not the client's to
 * make.
 */

/** The device path the capture came through. */
export const CAPTURE_ORIGINS = ['camera', 'gallery', 'qr_live'] as const
export type CaptureOrigin = (typeof CAPTURE_ORIGINS)[number]

/**
 * What was read.
 *
 * `business_card`, `badge` and `document` are the owner's own choice of mode,
 * not a classifier's verdict — one vision prompt reads every image, so these
 * record what the person said they were pointing at. The QR kinds are genuinely
 * determined, because the parser knows a vCard from an ABC link.
 */
export const CAPTURE_KINDS = [
  /** The owner captured without saying what it was. */
  'auto',
  'business_card',
  'badge',
  'document',
  'abc_card',
  'vcard',
  'mecard',
  'mailto',
  'tel',
] as const
export type CaptureKind = (typeof CAPTURE_KINDS)[number]

export type CaptureProvenance = {
  origin: CaptureOrigin
  kind: CaptureKind
  /** Present only for an ABC card, and only as something for the server to look up. */
  abcCardSlug?: string
  abcCardRef?: AbcCardRef
}

export function isCaptureOrigin(value: unknown): value is CaptureOrigin {
  return typeof value === 'string' && (CAPTURE_ORIGINS as readonly string[]).includes(value)
}

export function isCaptureKind(value: unknown): value is CaptureKind {
  return typeof value === 'string' && (CAPTURE_KINDS as readonly string[]).includes(value)
}

/**
 * A provenance object the server is willing to store.
 *
 * Anything unrecognised becomes null rather than being written through: these
 * values end up in columns other code will branch on, so an arbitrary string
 * from a request body must never become one. A slug is length-capped and
 * otherwise left alone — it is not trusted, only looked up.
 */
export function sanitizeProvenance(value: unknown): CaptureProvenance | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>

  if (!isCaptureOrigin(input.origin) || !isCaptureKind(input.kind)) return null

  const provenance: CaptureProvenance = { origin: input.origin, kind: input.kind }

  if (input.kind === 'abc_card' && typeof input.abcCardSlug === 'string') {
    const slug = input.abcCardSlug.trim().slice(0, 200)
    if (slug) {
      provenance.abcCardSlug = slug
      provenance.abcCardRef =
        input.abcCardRef === 'u' || input.abcCardRef === 'card' ? input.abcCardRef : 'd'
    }
  }

  return provenance
}
