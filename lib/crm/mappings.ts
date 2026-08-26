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
export type RemoteObjectType = 'contact' | 'company' | 'meeting' | 'task'

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

/**
 * Remember a remote object, immediately after the provider confirms it.
 *
 * Called the instant a create succeeds rather than at the end of the export, so
 * that a failure three steps later cannot cost us the knowledge that a contact
 * already exists. That is the difference between a retry being free and a retry
 * duplicating someone's CRM.
 */
export async function saveMapping(key: MappingKey, remoteId: string): Promise<void> {
  const supabase = createServerSupabase()

  const { error } = await supabase.from('crm_object_mappings').upsert(
    {
      user_id: key.ownerId,
      provider: key.provider,
      local_object_type: key.localType,
      local_object_id: key.localId,
      remote_object_type: key.remoteType,
      remote_object_id: remoteId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider,local_object_type,local_object_id,remote_object_type' }
  )

  if (error) {
    // Worth knowing, not worth failing the export: the remote object exists and
    // the owner should hear that. The cost is that a retry may create a second
    // one, which is why the code is logged and the row is not silently dropped.
    console.error('[crm] mapping save failed:', error.code ?? 'unknown')
  }
}
