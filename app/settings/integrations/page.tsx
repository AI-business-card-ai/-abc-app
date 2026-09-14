import { headers } from 'next/headers'
import IntegrationsSettingsView from '@/components/settings/IntegrationsSettingsView'
import { resolveProEntitlement } from '@/lib/entitlements'
import { nativePlatformFromHeaders } from '@/lib/native/runtime'
import { createServerComponentClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Integrations — ABC',
}

/**
 * Connection state is read on the client from /api/crm/connections, which is
 * the one route that reads crm_connections. Fetching it again here would be a
 * second reader of the same fact, and two readers is how the CRM status bug
 * started.
 *
 * Whether the owner is Pro is a different fact, resolved here from the verified
 * session so the screen can say honestly that connecting is ABC Pro. The routes
 * enforce it either way. So is whether this is the native app, where a new
 * connection cannot be completed yet and the screen says so instead of offering
 * a button that would fail.
 */
export default async function IntegrationsSettingsPage() {
  const {
    data: { user },
  } = await createServerComponentClient().auth.getUser()
  if (!user) return null

  const { pro } = await resolveProEntitlement(createServiceClient(), user)
  return <IntegrationsSettingsView pro={pro} nativeApp={nativePlatformFromHeaders(headers()) !== null} />
}
