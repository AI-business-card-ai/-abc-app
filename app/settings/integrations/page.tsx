import { headers } from 'next/headers'
import IntegrationsSettingsView from '@/components/settings/IntegrationsSettingsView'
import { resolveProEntitlement } from '@/lib/entitlements'
import { hasGmailGrant } from '@/lib/gmail-capability'
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
 * enforce it either way. So is whether this is the native app, where Connect
 * runs the native flow, and whether the app was just sent back here by a web
 * connect route it cannot finish (lib/native/connect-gate.ts).
 */
export default async function IntegrationsSettingsPage({
  searchParams,
}: {
  searchParams?: { native?: string }
}) {
  const {
    data: { user },
  } = await createServerComponentClient().auth.getUser()
  if (!user) return null

  const supabase = createServerComponentClient()
  const [{ pro }, { data: profile }] = await Promise.all([
    resolveProEntitlement(createServiceClient(), user),
    // The two Gmail columns the browser may read; the tokens are never granted to it.
    supabase.from('abc_profiles').select('google_connected, google_email').eq('id', user.id).maybeSingle(),
  ])

  return (
    <IntegrationsSettingsView
      pro={pro}
      nativeApp={nativePlatformFromHeaders(headers()) !== null}
      nativeConnectRetry={searchParams?.native === 'connect-unavailable'}
      gmail={{
        connected: hasGmailGrant(profile),
        mailbox: typeof profile?.google_email === 'string' ? profile.google_email : null,
      }}
    />
  )
}
