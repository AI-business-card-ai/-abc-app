import type { CrmProvider } from '@/lib/crm/connections'

/**
 * The CRMs ABC ships, named once.
 *
 * Every surface that lists providers reads this. Before it existed each screen
 * carried its own literal array, and they drifted: the contact sidebar listed
 * HubSpot and Salesforce and had never heard of Pipedrive, while the push card
 * two sections below it offered all three. A list written twice is a list that
 * disagrees with itself eventually.
 *
 * Deliberately free of anything server-side. The type import is erased at
 * build, so a client component can read this without pulling `connections.ts`
 * — and with it the service key — into a browser bundle.
 *
 * CSV is not here. It has no OAuth, no connection and no connected state, so
 * it is not a provider; it is ABC's own data in a format anyone can open.
 */
export type CrmProviderInfo = {
  id: CrmProvider
  /** What the CRM calls itself, for display. */
  name: string
  /** Where connecting starts. */
  connectPath: string
}

export const CRM_PROVIDERS: readonly CrmProviderInfo[] = [
  { id: 'hubspot', name: 'HubSpot', connectPath: '/api/auth/hubspot' },
  { id: 'pipedrive', name: 'Pipedrive', connectPath: '/api/auth/pipedrive' },
  { id: 'salesforce', name: 'Salesforce', connectPath: '/api/auth/salesforce' },
] as const

/**
 * What a connection looks like to a screen: the two facts, and nothing else.
 *
 * Both fields are optional because one caller reads them straight out of a
 * JSON response, where a field can simply be absent. Treating absence as its
 * own case here is what stops that caller coercing first and getting the
 * coercion subtly wrong — which is the class of mistake this whole change is
 * about.
 */
export type CrmConnectionView = { connected?: boolean; needsReconnect?: boolean } | undefined

export type CrmStatusLabel = 'connected' | 'needs_reconnect' | 'not_connected'

/**
 * One reading of connection state, for every surface that shows it.
 *
 * The bug this closes was two screens answering the same question differently
 * on the same page. Agreement is now a property of shared code rather than of
 * two implementations happening to match: both the contact sidebar and the
 * push card call this, so they cannot drift without the drift being deliberate.
 *
 * A connection needing reconnection is deliberately not "connected". It exists,
 * and it cannot be used — the push card already refuses to push and offers
 * Reconnect, so a summary calling it Connected would be the disagreement all
 * over again in a subtler form.
 */
export function crmStatusLabel(status: CrmConnectionView): CrmStatusLabel {
  if (!status?.connected) return 'not_connected'
  return status.needsReconnect ? 'needs_reconnect' : 'connected'
}
