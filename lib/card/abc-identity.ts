import type { SupabaseClient } from '@supabase/supabase-js'
import type { AbcCardRef } from '@/lib/scan/qr-parse'

/**
 * Finding the ABC account behind a scanned card, server-side.
 *
 * Two callers need the same three rules — which column an identifier means,
 * that a `card` reference must be a real UUID, and that a `/d/` card has to be
 * published to be readable — and rules like those are exactly what drifts when
 * they are written twice. The public resolve route reads a profile to render
 * identity for the scanner; saving a contact reads one to record who was
 * scanned. Same lookup, different reasons.
 *
 * Deliberately no analytics. The resolve route counts a card view because a
 * person pointed a camera at a card; revalidating that identity again at save
 * time is bookkeeping, and one scan must not become two views just because we
 * refused to take the client's word for who it had found.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function normalizeAbcCardRef(value: string | null | undefined): AbcCardRef {
  return value === 'u' || value === 'card' ? value : 'd'
}

/**
 * The profile a card identifier points at, or null.
 *
 * Returns the whole row because the resolve route still needs it to build the
 * public card; callers that only want identity take what they need from it.
 */
export async function resolveAbcCardProfile(
  supabase: SupabaseClient,
  identifier: string,
  ref: AbcCardRef
): Promise<Record<string, unknown> | null> {
  const value = (identifier || '').trim()
  if (!value) return null

  let query = supabase.from('abc_profiles').select('*')

  if (ref === 'card') {
    if (!UUID_RE.test(value)) return null
    query = query.eq('id', value)
  } else if (ref === 'u') {
    query = query.eq('user_name', value.toLowerCase())
  } else {
    query = query.eq('card_slug', value.toLowerCase())
  }

  const { data, error } = await query.maybeSingle()
  if (error || !data) return null

  // A /d/ card must be published to be readable. The /u/ and /card/ aliases
  // predate publishing and stay readable, matching what those pages render.
  if (ref === 'd' && !data.card_published) return null

  return data as Record<string, unknown>
}

/**
 * Who a scanned ABC card belongs to.
 *
 * `userId` is the person: today `abc_profiles.id` *is* the `auth.users.id`, so
 * one value answers both "which account" and "which profile". `cardSlug`
 * records which card was actually scanned — the only card-level discriminator
 * the schema has — so when an account can hold several cards, the row already
 * says which one was in front of the camera.
 *
 * Both are read out of the database here. Nothing a client sends reaches these
 * fields, which is the whole point: the contact's owner is the session user,
 * and this is a claim about a different person entirely.
 */
export type AbcCardIdentity = {
  linkedUserId: string
  linkedCardSlug: string | null
}

export function abcIdentityFromProfile(
  profile: Record<string, unknown> | null
): AbcCardIdentity | null {
  if (!profile) return null
  const id = typeof profile.id === 'string' ? profile.id : null
  if (!id) return null
  const slug = typeof profile.card_slug === 'string' ? profile.card_slug : null
  return { linkedUserId: id, linkedCardSlug: slug }
}
