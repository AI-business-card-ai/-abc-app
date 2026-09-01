import IntegrationsSettingsView from '@/components/settings/IntegrationsSettingsView'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Integrations — ABC',
}

/**
 * Connection state is read on the client from /api/crm/connections, which is
 * the one route that reads crm_connections. Fetching it again here would be a
 * second reader of the same fact, and two readers is how the CRM status bug
 * started.
 */
export default function IntegrationsSettingsPage() {
  return <IntegrationsSettingsView />
}
