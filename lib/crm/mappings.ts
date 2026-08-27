import { createServerSupabase } from '@/lib/supabase'
import type { CrmProvider } from '@/lib/crm/connections'

/**
 * What ABC has already created in somebody's CRM.
 *
 * Pressing "Push to HubSpot" twice must not produce two of the same person,
 * and the only reliable way to know is to remember what was made the first
 * time. Every remote object is recorded here the moment it exists, so a retry
 * — after a partial failure, or a second deliberate push — reuses what is
 * already there rather than starting again.
 *
 * Server only, like crm_connections. These rows say which of an owner's people
 * exist in which CRM under which id, which is not something a browser needs and
 * not something another owner may ever see.
 */

export type LocalObjectType = 'contact' | 'company' | 'encounter' | 'follow_up'

/**
 * What the provider calls it, in the provider's own words.
 *
 * HubSpot has contacts, companies, meetings and tasks. Pipedrive has persons,
 * organizations and activities — a meeting and a follow-up are both activities
 * there, told apart by the `local_object_type` they are mapped from.
 */
export type RemoteObjectType =
  | 'contact'
  | 'company'
  | 'meeting'
  | 'task'
  | 'person'
  | 'organization'
  | 'activity'

export type MappingKey = {
  ownerId: string
  provider: CrmProvider
  localType: LocalObjectType
  localId: string
  remoteType: RemoteObjectType
}

/**
 * The remote id ABC created for this local object, or null.
 *
 * Owner-scoped in the query even though the service role ignores row-level
 * security — because it ignores it. This filter is the only thing between the
 * call and another customer's CRM ids.
 */
export async function getMapping(key: MappingKey): Promise<string | null> {
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('crm_object_mappings')
    .select('remote_object_id')
    .eq('user_id', key.ownerId)
    .eq('provider', key.provider)
    .eq('local_object_type', key.localType)
    .eq('local_object_id', key.localId)
    .eq('remote_object_type', key.remoteType)
    .maybeSingle()

  if (error || !data) return null
  return (data.remote_object_id as string | null) ?? null
}

export type MappingSaveResult =
  | { ok: true; remoteId: string }
  | { ok: false; reason: 'mapping_persistence_failed' | 'mapping_conflict' }

/** Postgres unique violation. A race, not a fault, until proven otherwise. */
const UNIQUE_VIOLATION = '23505'

/**
 * Remember a remote object, immediately after the provider confirms it.
 *
 * Called the instant a create succeeds rather than at the end of the export, so
 * that a failure three steps later cannot cost us the knowledge that a contact
 * already exists. That is the difference between a retry being free and a retry
 * duplicating someone's CRM.
 *
 * This used to log a failure and let the export carry on. That was wrong, and
 * wrong in the one way that matters here: the remote object existed, ABC had
 * lost track of which one it was, and the next push would have made a second.
 * Persisting the mapping is not bookkeeping that happens after the work — it is
 * part of the work, and the caller is now told when it did not happen.
 *
 * An INSERT rather than an upsert. Callers only reach here when no mapping was
 * found, so there is nothing to update; and an upsert would quietly overwrite a
 * mapping another request had just written, which is the precise thing worth
 * detecting.
 */
export async function saveMapping(
  key: MappingKey,
  remoteId: string
): Promise<MappingSaveResult> {
  const supabase = createServerSupabase()

  const { error } = await supabase.from('crm_object_mappings').insert({
    user_id: key.ownerId,
    provider: key.provider,
    local_object_type: key.localType,
    local_object_id: key.localId,
    remote_object_type: key.remoteType,
    remote_object_id: remoteId,
    updated_at: new Date().toISOString(),
  })

  if (!error) return { ok: true, remoteId }

  /*
    Two pushes of the same contact can overlap — a double-clicked button is
    enough. The loser of that race finds the row already written, and if it
    names the same remote object then nothing is wrong at all: the mapping this
    call wanted to create exists, which is what it was trying to achieve.

    A different remote object is the case worth stopping for. It means two
    remote records now stand for one ABC contact, and picking either would
    make the wrong one canonical for ever.
  */
  if (error.code === UNIQUE_VIOLATION) {
    const existing = await getMapping(key)
    if (existing === remoteId) return { ok: true, remoteId }
    if (existing) {
      console.error(`[crm] mapping conflict for ${key.provider}/${key.localType}`)
      return { ok: false, reason: 'mapping_conflict' }
    }
    // A conflict with nothing to read back: the row was removed in between, or
    // the read failed. Either way this call cannot claim the mapping is stored.
    console.error(`[crm] mapping conflict could not be resolved for ${key.provider}/${key.localType}`)
    return { ok: false, reason: 'mapping_persistence_failed' }
  }

  // The code only. An error body can quote the row, and the row names somebody's
  // contact and the id it has inside their CRM.
  console.error('[crm] mapping save failed:', error.code ?? 'unknown')
  return { ok: false, reason: 'mapping_persistence_failed' }
}
