import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Delete one of the owner's contacts.
 *
 * One statement, scoped to both the id and the verified owner, so an id that
 * belongs to anybody else deletes nothing. What goes with the person is decided
 * by the database inside that statement:
 *
 *   - their meetings, activities, opportunities and follow-up sequences are
 *     removed, as they always have been (ON DELETE CASCADE);
 *   - a Multi-Card batch item that saved or matched them keeps its scan
 *     history and loses only the reference to them
 *     (scan_batch_items_release_deleted_contact);
 *   - Smart Scan credits, the credit ledger and CRM mappings are untouched,
 *     and no CRM is called: deleting a person in ABC does not delete them
 *     anywhere else.
 *
 * Deleting an id that no longer exists — a second press, a stale list — is a
 * success with nothing to do, which is what the API has always answered. The
 * same answer for somebody else's id means a response never reveals whether a
 * contact exists.
 */

export type DeleteContactResult =
  | { ok: true; deleted: boolean }
  | { ok: false; code: string }

export async function deleteOwnedContact(
  db: SupabaseClient,
  ownerId: string,
  contactId: string
): Promise<DeleteContactResult> {
  const { data, error } = await db
    .from('scanned_contacts')
    .delete()
    .eq('id', contactId)
    .eq('user_id', ownerId)
    .select('id')

  if (error) {
    // The code, not the message: a database message can quote the row.
    console.error('[contacts/delete] delete failed:', error.code ?? 'unknown')
    return { ok: false, code: error.code ?? 'unknown' }
  }

  return { ok: true, deleted: Array.isArray(data) && data.length > 0 }
}
