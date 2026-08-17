/** Shared between the browser helper and the upload route — no client imports here. */

export const CARD_MEDIA_BUCKET = 'card-media'
export const CARD_MEDIA_MAX_BYTES = 10 * 1024 * 1024

export type CardMediaKind = 'photo' | 'cover' | 'logo' | 'showcase'

/**
 * The three images stored directly on the profile row. Showcase images are
 * rows in their own table, so anything keyed "one per card" means these.
 */
export type CardProfileMediaKind = Exclude<CardMediaKind, 'showcase'>

const KINDS: CardMediaKind[] = ['photo', 'cover', 'logo', 'showcase']

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
  showcase: {
    title: 'Showcase image',
    help: 'A photo of your work — a project, a product, an installation.',
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
}

/**
 * Showcase objects go in their own folder under the same owner-scoped prefix.
 * The upload route derives this from the session, never from the client, and
 * the delete path check only trusts a path starting with the caller's own id.
 */
export function cardMediaPath(userId: string, kind: CardMediaKind, ext: string): string {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  if (kind === 'showcase') return `${userId}/showcase/${unique}.${ext}`
  return `${userId}/${kind}-${Date.now()}.${ext}`
}
