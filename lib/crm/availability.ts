import type { CrmProvider } from '@/lib/crm/connections'
import { isTokenEncryptionConfigured } from '@/lib/crm/encryption'
import { getHubSpotConfig } from '@/lib/crm/hubspot-oauth'
import { getPipedriveConfig } from '@/lib/crm/pipedrive-oauth'
import { CRM_PROVIDERS } from '@/lib/crm/providers'
import { getSalesforceConfig } from '@/lib/crm/salesforce-oauth'

/**
 * Which CRMs this deployment can actually connect.
 *
 * The same two checks each connect route makes before it refuses with "X is
 * not configured on this server": the provider's OAuth configuration, and token
 * encryption, without which no connection can be stored. A public page that
 * names a CRM should only name one that would get past that refusal.
 *
 * Server-only: it reads process.env. The names it returns may cross to the
 * client; the configuration behind them may not.
 */
export function crmAvailability(): Record<CrmProvider, boolean> {
  const storable = isTokenEncryptionConfigured()
  return {
    hubspot: storable && getHubSpotConfig() !== null,
    pipedrive: storable && getPipedriveConfig() !== null,
    salesforce: storable && getSalesforceConfig() !== null,
  }
}

/** The display names of the connectable CRMs, in the shared provider order. */
export function connectableCrmNames(): string[] {
  const available = crmAvailability()
  return CRM_PROVIDERS.filter(({ id }) => available[id]).map(({ name }) => name)
}
