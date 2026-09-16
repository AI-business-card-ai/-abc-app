import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Delete an owner's entire ABC account.
 *
 * The one place account deletion happens. Routes verify the session and the
 * confirmation and then call this with the verified user's id — never an id a
 * request carried. Three steps, in an order chosen so that every failure is
 * retryable by the owner who is still signed in:
 *
 *   1. Data.     `remove_account_data`, one database transaction: refuses while a
 *                subscription still bills; otherwise writes the anonymised
 *                economic record, then removes the public card, the Gmail and
 *                CRM credentials, contacts, meetings, scan sessions, follow-ups,
 *                activities, opportunities and CRM mappings together. See
 *                20260916120000_account_deletion for exactly what and why.
 *   2. Storage.  Every object under the owner's own folder in the buckets ABC
 *                uploads to. These are public-read, so they must be gone before
 *                the account is: once the auth user is deleted nobody can sign
 *                in to retry.
 *   3. Auth.     The Supabase auth user, last. Its foreign keys cascade away the
 *                credit ledger and the Pro entitlements whose summary step 1
 *                already recorded.
 *
 * A failure stops the sequence where it happened and says which step, so the
 * next attempt picks up from there: step 1 finds nothing left to delete, step 2
 * finds nothing left to remove. An auth user that is already gone counts as
 * done.
 *
 * What this deliberately does not do:
 *   - cancel, refund or reverse anything. No Stripe call is made; an active
 *     subscription blocks deletion instead, and unused credits end with the
 *     account.
 *   - call Google, HubSpot, Salesforce or Pipedrive. ABC has no token revocation
 *     for any of them today, so the stored credentials are deleted locally, in
 *     step 1, and a provider being down can never hold a deletion up.
 *   - touch another owner's data. Every step is scoped to this owner's id.
 */

export const ACCOUNT_STORAGE_BUCKETS = ['card-media', 'avatars'] as const

export type AccountDeletionStage = 'data' | 'storage' | 'auth'

export type AccountDeletionResult =
  | { ok: true }
  | { ok: false; code: 'active_subscription' }
  | { ok: false; code: 'deletion_incomplete'; stage: AccountDeletionStage }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Objects per Storage list page, and how many are removed per call. */
const STORAGE_PAGE = 100
/** A ceiling on folders walked, so a malformed listing can never loop for ever. */
const MAX_FOLDERS = 500

type ErrorLike = { code?: unknown; status?: unknown; statusCode?: unknown; message?: unknown } | null | undefined

function codeOf(error: ErrorLike): string {
  return typeof error?.code === 'string' && error.code ? error.code : 'unknown'
}

function incomplete(stage: AccountDeletionStage): AccountDeletionResult {
  return { ok: false, code: 'deletion_incomplete', stage }
}

/** Whether this owner may delete their account right now. Null when nothing blocks it, or when it could not be read. */
export async function readAccountDeletionBlocker(
  db: SupabaseClient,
  ownerId: string
): Promise<'active_subscription' | null> {
  if (!UUID.test(ownerId)) return null
  const { data, error } = await db.rpc('account_deletion_blocker', { p_user_id: ownerId })
  if (error) {
    // Deletion still checks for itself; a screen that cannot tell in advance
    // loses a warning, not the rule.
    console.error('[account/delete] blocker unavailable:', codeOf(error))
    return null
  }
  return data === 'active_subscription' ? 'active_subscription' : null
}

/**
 * A bucket that does not exist has nothing in it. Only that error is forgiven:
 * listing a folder that does not exist answers an empty list, so a 404 from a
 * list call can only be the bucket itself.
 */
function isMissingBucket(error: ErrorLike): boolean {
  return String(error?.statusCode ?? '') === '404' || /bucket not found/i.test(String(error?.message ?? ''))
}

/** Every object path under `<ownerId>/` in one bucket, or null when it could not be listed. */
async function listOwnerObjects(
  db: SupabaseClient,
  bucket: string,
  ownerId: string
): Promise<string[] | null> {
  const paths: string[] = []
  const folders = [ownerId]
  let visited = 0

  while (folders.length > 0) {
    if (++visited > MAX_FOLDERS) return null
    const folder = folders.pop() as string

    for (let offset = 0; ; offset += STORAGE_PAGE) {
      const { data, error } = await db.storage.from(bucket).list(folder, { limit: STORAGE_PAGE, offset })
      if (error) return isMissingBucket(error) ? [] : null

      const entries = data ?? []
      for (const entry of entries) {
        if (!entry?.name || entry.name.includes('/') || entry.name === '.' || entry.name === '..') continue
        const path = `${folder}/${entry.name}`
        // Storage reports a folder as an entry with no id.
        if (entry.id === null || entry.id === undefined) folders.push(path)
        else paths.push(path)
      }
      if (entries.length < STORAGE_PAGE) break
    }
  }

  return paths
}

/**
 * Remove every object this owner uploaded. Returns false if any listing or
 * removal failed, so the caller does not go on to delete the auth user.
 *
 * Only paths inside the owner's own folder are ever named, and that is checked
 * again right before removal rather than trusted from the listing.
 */
export async function removeOwnerStorage(db: SupabaseClient, ownerId: string): Promise<boolean> {
  if (!UUID.test(ownerId)) return false
  const prefix = `${ownerId}/`

  for (const bucket of ACCOUNT_STORAGE_BUCKETS) {
    const paths = await listOwnerObjects(db, bucket, ownerId)
    if (paths === null) {
      console.error('[account/delete] storage listing failed:', bucket)
      return false
    }

    const owned = paths.filter((path) => path.startsWith(prefix) && !path.includes('..'))
    for (let i = 0; i < owned.length; i += STORAGE_PAGE) {
      const { error } = await db.storage.from(bucket).remove(owned.slice(i, i + STORAGE_PAGE))
      if (error) {
        console.error('[account/delete] storage removal failed:', bucket)
        return false
      }
    }
  }

  return true
}

async function recordProgress(
  db: SupabaseClient,
  ownerId: string,
  update: { status?: 'completed'; last_error_code: string | null }
): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await db
    .from('account_deletions')
    .update({
      ...update,
      ...(update.status === 'completed' ? { completed_at: now } : {}),
      updated_at: now,
    })
    .eq('user_id', ownerId)
  if (error) console.error('[account/delete] progress not recorded:', codeOf(error))
}

/** The auth user no longer exists, which is what this step was for. */
function isUserAlreadyGone(error: ErrorLike): boolean {
  return error?.code === 'user_not_found'
}

export async function deleteAccountForOwner(
  db: SupabaseClient,
  ownerId: string
): Promise<AccountDeletionResult> {
  if (!UUID.test(ownerId)) return incomplete('data')

  // 1. Data, credentials and the public card, in one transaction.
  const { data, error } = await db.rpc('remove_account_data', { p_user_id: ownerId })
  if (error) {
    console.error('[account/delete] data removal failed:', codeOf(error))
    return incomplete('data')
  }
  if (data === 'active_subscription') return { ok: false, code: 'active_subscription' }
  if (data !== 'removed') {
    console.error('[account/delete] data removal answered unexpectedly')
    return incomplete('data')
  }

  // 2. Uploaded images.
  if (!(await removeOwnerStorage(db, ownerId))) {
    await recordProgress(db, ownerId, { last_error_code: 'storage_failed' })
    return incomplete('storage')
  }

  // 3. The auth user, last.
  const { error: authError } = await db.auth.admin.deleteUser(ownerId)
  if (authError && !isUserAlreadyGone(authError)) {
    console.error('[account/delete] auth user deletion failed:', codeOf(authError))
    await recordProgress(db, ownerId, { last_error_code: 'auth_delete_failed' })
    return incomplete('auth')
  }

  await recordProgress(db, ownerId, { status: 'completed', last_error_code: null })

  // A request still carrying the old session could have uploaded an image
  // between step 2 and step 3. One more sweep, best effort: the account is
  // already gone, so there is nobody left to retry for.
  await removeOwnerStorage(db, ownerId)

  return { ok: true }
}
