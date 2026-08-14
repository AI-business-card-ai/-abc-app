/**
 * Capture modes shown under the viewfinder.
 *
 * AUTO is the default and is what we can honestly claim today: QR codes are
 * detected live in every mode except DOCUMENT-only use, and any captured image
 * goes to the same vision extraction. The explicit modes are hints that adjust
 * the on-screen guidance and the `source` recorded on the contact — they do not
 * pretend to switch between different OCR engines, because there is only one.
 */
export type CaptureMode = 'auto' | 'business_card' | 'badge' | 'qr' | 'document'

export const CAPTURE_MODES: { id: CaptureMode; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'Point at a card, badge, QR or screen' },
  { id: 'business_card', label: 'Business card', hint: 'Position the card inside the frame' },
  { id: 'badge', label: 'Badge', hint: 'Position the badge inside the frame' },
  { id: 'qr', label: 'QR', hint: 'Point at a QR code' },
  { id: 'document', label: 'Document', hint: 'Frame the contact details' },
]

export function hintForMode(mode: CaptureMode): string {
  return CAPTURE_MODES.find((m) => m.id === mode)?.hint ?? CAPTURE_MODES[0].hint
}

/** QR is watched for in every mode except Document, where it would be noise. */
export function qrEnabledForMode(mode: CaptureMode): boolean {
  return mode !== 'document'
}

/** What gets written to scanned_contacts.source. */
export function sourceForMode(mode: CaptureMode): string {
  return mode === 'auto' ? 'auto' : mode
}
