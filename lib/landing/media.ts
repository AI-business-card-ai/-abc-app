/**
 * The landing's media contract.
 *
 * Five cinematic moments want real photography or animation that does not
 * exist yet. Rather than fill them with stock imagery — or leave grey boxes on
 * a premium page — each slot is declared here with the brief it will be
 * commissioned against, and every slot is `null` until an approved asset
 * lands.
 *
 * A scene asks for its slot and renders its own product-UI composition when the
 * answer is null, so the page is complete today and gains photography later
 * without a redesign: set `src` (plus `width`/`height`, so the space is
 * reserved and nothing shifts) and the scene switches over.
 *
 * Deliberately empty: public/hero/abc-hero-visual.webp. It shows capabilities
 * the product no longer has — contact intelligence, match scores, enriched
 * company data — in the retired pink/cyan palette. It must not come back.
 */

export type MediaSlotId =
  | 'hero'
  | 'smart-scan'
  | 'follow-up-crm'
  | 'event-workspace'
  | 'event-intelligence'
  | 'final-cta'

export type MediaAsset = {
  /** Path under /public, or null while the asset is still to be supplied. */
  src: string | null
  /** Intrinsic size. Required with `src` so the slot reserves its space. */
  width?: number
  height?: number
  /** What a screen reader should hear. Required with `src`. */
  alt?: string
  /** The brief, kept beside the slot so it cannot drift from the design. */
  brief: {
    purpose: string
    kind: 'photo' | 'animation' | 'ui'
    aspectDesktop: string
    aspectMobile: string
    textSafeArea: boolean
    motion: string
  }
}

export const MEDIA: Record<MediaSlotId, MediaAsset> = {
  hero: {
    src: null,
    brief: {
      purpose:
        'Two people finishing a real business conversation at an event — a handshake or a phone held between them. The mechanism (card, scan, rail) is drawn in UI over it.',
      kind: 'photo',
      aspectDesktop: '16:9',
      aspectMobile: '4:5',
      textSafeArea: true,
      motion: 'Handshake → scan → context → follow-up → CRM, one continuous move.',
    },
  },
  'smart-scan': {
    src: null,
    brief: {
      purpose: 'A physical business card being scanned in the hall, resolving into a person plus meeting context.',
      kind: 'animation',
      aspectDesktop: '4:3',
      aspectMobile: '1:1',
      textSafeArea: false,
      motion: 'Card → contact fields → meeting context settling around the record.',
    },
  },
  'follow-up-crm': {
    src: null,
    brief: {
      purpose: 'Meeting context becoming a message, then a CRM record.',
      kind: 'animation',
      aspectDesktop: '16:10',
      aspectMobile: '4:5',
      textSafeArea: false,
      motion: 'Context → message → chosen channel → CRM object.',
    },
  },
  'event-workspace': {
    src: null,
    brief: {
      purpose: 'Many separate meetings gathering into one organised event pipeline.',
      kind: 'animation',
      aspectDesktop: '16:9',
      aspectMobile: '4:5',
      textSafeArea: false,
      motion: 'Scattered cards → grouped rows → follow-up and CRM status.',
    },
  },
  'event-intelligence': {
    src: null,
    brief: {
      purpose:
        'An event floor resolving into a relevant company, its hall and stand, and the reason to meet them. Must read as a preview, never as a shipped screen.',
      kind: 'animation',
      aspectDesktop: '16:9',
      aspectMobile: '4:5',
      textSafeArea: true,
      motion: 'Floor → highlighted company → why it matters → invitation.',
    },
  },
  'final-cta': {
    src: null,
    brief: {
      purpose: 'A warm, human business moment — the handshake that becomes an opportunity — on the light closing chapter.',
      kind: 'photo',
      aspectDesktop: '21:9',
      aspectMobile: '3:2',
      textSafeArea: true,
      motion: 'Stills are fine; a slow settle at most.',
    },
  },
}

/** True when a slot has a real asset to render. */
export function hasMedia(id: MediaSlotId): boolean {
  const asset = MEDIA[id]
  return Boolean(asset.src && asset.width && asset.height && asset.alt)
}
