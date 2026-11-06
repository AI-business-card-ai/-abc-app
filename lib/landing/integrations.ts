import { connectableCrmNames } from '@/lib/crm/availability'
import { getGmailConnectConfig } from '@/lib/google/gmail-connect'

/**
 * What the public pages may say about integrations, from this deployment's
 * own configuration.
 *
 * Three states, and the pages keep them apart:
 *
 *  - Direct connection: a CRM in `crm`, or Gmail when `gmail` is true. Both are
 *    ABC Pro, and each is a connection the owner makes in Settings.
 *  - CSV export: always, on every account. It needs no connection and opens
 *    in any CRM (app/api/export/csv).
 *  - Not available yet: a CRM in lib/crm/providers that is missing from `crm`,
 *    or Gmail when `gmail` is false. Named as such, never as something to
 *    connect.
 *
 * The checks are the ones the connect routes make before they refuse: provider
 * OAuth configuration and token encryption for a CRM (lib/crm/availability),
 * Google's client configuration for Gmail (lib/google/gmail-connect).
 *
 * Server-only: it reads process.env. The landing and /pricing are static, so
 * this is read when they are built, and a connection configured later shows on
 * them after the next deployment. Client components import the type alone.
 */
export type LandingIntegrations = {
  /** Display names of the CRMs a Pro account can connect here, in provider order. */
  crm: string[]
  /** Whether a Pro account can connect Gmail here and send from its own address. */
  gmail: boolean
}

export function landingIntegrations(): LandingIntegrations {
  return { crm: connectableCrmNames(), gmail: getGmailConnectConfig() !== null }
}
