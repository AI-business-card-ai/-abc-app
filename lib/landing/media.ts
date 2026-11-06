/**
 * The landing's media contract.
 *
 * The landing wants assets that do not exist yet: the approved logo,
 * photography, the real screen recording of the main flow, and real product
 * screenshots. Rather than fill them with stock imagery, generated UI or grey
 * boxes on a premium page, each slot is declared here with the brief it will
 * be commissioned against, and every slot is `null` until an approved asset
 * lands. components/landing/MediaSlot renders a slot, or the section's current
 * composition while the slot is empty.
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
  | 'logo'
  | 'hero'
  | 'hero-recording'
  | 'smart-scan'
  | 'follow-up-crm'
  | 'event-workspace'
  | 'event-intelligence'
  | 'final-cta'
  | 'screen-smart-scan'
  | 'screen-follow-up'
  | 'screen-crm'
  | 'screen-event'
  | 'screen-card'

export type MediaAsset = {
  /** Path under /public, or null while the asset is still to be supplied. */
  src: string | null
  /** Intrinsic size. Required with `src` so the slot reserves its space. */
  width?: number
  height?: number
  /** What a screen reader should hear. Required with `src`. */
  alt?: string
  /**
   * Video only, and required for one: the still shown before playback and
   * instead of it under reduced motion.
   */
  poster?: string
  /** The brief, kept beside the slot so it cannot drift from the design. */
  brief: {
    purpose: string
    kind: 'photo' | 'animation' | 'ui' | 'logo' | 'video' | 'screenshot'
    aspectDesktop: string
    aspectMobile: string
    textSafeArea: boolean
    motion: string
  }
}

/** Shared by the five screenshot slots: real screens, demo data only, never mocked. */
const SCREENSHOT_BRIEF = {
  kind: 'screenshot',
  aspectDesktop: 'Phone portrait, about 9:19.5',
  aspectMobile: 'Phone portrait, about 9:19.5',
  textSafeArea: false,
  motion: 'A restrained reveal on first view.',
} as const

export const MEDIA: Record<MediaSlotId, MediaAsset> = {
  logo: {
    src: null,
    brief: {
      purpose: 'The approved ABC Card logo for the public header and footer. Until it exists both keep the "ABC." wordmark.',
      kind: 'logo',
      aspectDesktop: 'As supplied; SVG, drawn at 24px tall',
      aspectMobile: 'Same',
      textSafeArea: false,
      motion: 'None.',
    },
  },
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
  'hero-recording': {
    src: null,
    brief: {
      purpose:
        'A real screen recording of ABC Card on a phone, on a demo account with demo contacts: Scan → Save → Context → Follow-up → CRM in one take. It replaces the drawn card inside the hero phone; the rail beside it stays.',
      kind: 'video',
      aspectDesktop: 'Phone portrait, about 9:19.5',
      aspectMobile: 'Phone portrait, about 9:19.5',
      textSafeArea: false,
      motion: 'The page’s one substantial animation. Muted and looping, paused off screen, the poster under reduced motion.',
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
  'screen-smart-scan': {
    src: null,
    brief: { ...SCREENSHOT_BRIEF, purpose: 'A real Multi-Card review, and the contact it creates with its meeting context.' },
  },
  'screen-follow-up': {
    src: null,
    brief: { ...SCREENSHOT_BRIEF, purpose: 'The real Smart Follow-up draft with its Email, WhatsApp and LinkedIn options.' },
  },
  'screen-crm': {
    src: null,
    brief: { ...SCREENSHOT_BRIEF, purpose: 'A real CRM export result, for a provider confirmed live in Production.' },
  },
  'screen-event': {
    src: null,
    brief: { ...SCREENSHOT_BRIEF, purpose: 'A real planned event: Before, During and After, its meetings and the In CRM filter.' },
  },
  'screen-card': {
    src: null,
    brief: { ...SCREENSHOT_BRIEF, purpose: 'A real demo public card with its real QR code.' },
  },
}

/** True when a slot has a real asset to render. */
export function hasMedia(id: MediaSlotId): boolean {
  const asset = MEDIA[id]
  if (!asset.src || !asset.width || !asset.height || !asset.alt) return false
  // A video without its still would show nothing before it loads, or ever under reduced motion.
  return !isVideo(asset.src) || Boolean(asset.poster)
}

/** Recordings are files, not animated images: they get a video element. */
export function isVideo(src: string): boolean {
  return /\.(mp4|webm|mov)$/i.test(src)
}
