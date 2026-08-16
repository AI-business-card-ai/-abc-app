/** Shared between the browser helper and the upload route — no client imports here. */

export const CARD_MEDIA_BUCKET = 'card-media'
export const CARD_MEDIA_MAX_BYTES = 10 * 1024 * 1024

export type CardMediaKind = 'photo' | 'cover' | 'logo'

const KINDS: CardMediaKind[] = ['photo', 'cover', 'logo']

export function isCardMediaKind(value: string): value is CardMediaKind {
  return (KINDS as string[]).includes(value)
}

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
}

/** Longest edge each kind is resized to before upload. */
export const CARD_MEDIA_MAX_EDGE: Record<CardMediaKind, number> = {
  photo: 1024,
  cover: 2000,
  logo: 800,
}
