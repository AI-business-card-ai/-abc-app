'use client'

import { useCallback, useEffect, useState } from 'react'
import { IconPlug } from '@tabler/icons-react'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import {
  CRM_PROVIDERS,
  crmStatusLabel,
  type CrmConnectionView,
  type CrmStatusLabel,
} from '@/lib/crm/providers'

/**
 * Integrations.
 *
 * Every CRM ABC supports, and whether each one is connected — read from
 * `/api/crm/connections`, which reads `crm_connections`. That is the only place
 * a connection is recorded, and this screen deliberately has no second opinion:
 * no profile columns, no local heuristics, no "we have a token so it must be
 * working". The disconnected profile column this app used to consult for
 * Salesforce had been dropped from the database, and the read that failed was
 * being silently swallowed, so a connected CRM rendered as disconnected.
 *
 * CSV is not here. It has no OAuth, no connection and no connected state — it
 * is ABC's own data in a format anyone can open, and listing it beside HubSpot
 * would imply an account somewhere to connect to.
 *
 * The status wording comes from `crmStatusLabel`, the same function the contact
 * push card uses, so the two cannot disagree about what "connected" means. A
 * connection that needs reauthorising is not connected: it exists and it cannot
 * be used.
 */

const STATUS_TEXT: Record<CrmStatusLabel, string> = {
  connected: 'Connected',
  needs_reconnect: 'Needs reconnecting',
  not_connected: 'Not connected',
}

const STATUS_COLOR: Record<CrmStatusLabel, string> = {
  connected: 'var(--abc-green)',
  needs_reconnect: 'var(--abc-overdue)',
  not_connected: 'var(--abc-muted)',
}

type ConnectionMap = Record<string, CrmConnectionView>

export default function IntegrationsSettingsView() {
  const [connections, setConnections] = useState<ConnectionMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/crm/connections')
      if (!res.ok) throw new Error('load failed')
      const json = (await res.json()) as { connections?: { provider: string }[] }
      const next: ConnectionMap = {}
      for (const row of json.connections ?? []) {
        next[row.provider] = row as CrmConnectionView
      }
      setConnections(next)
      setError(null)
    } catch (err) {
      console.error('[settings/integrations] load failed:', err)
      setError('Your connections could not be loaded. Reload and try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function disconnect(providerId: string, providerName: string) {
    setBusy(providerId)
    setError(null)
    try {
      const res = await fetch(`/api/auth/${providerId}/disconnect`, { method: 'DELETE' })
      if (!res.ok) throw new Error('disconnect failed')
      await load()
    } catch (err) {
      console.error('[settings/integrations] disconnect failed:', err)
      setError(`Could not disconnect ${providerName}. Try again.`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pb-10 pt-5 sm:px-6 lg:pt-8">
      <SettingsPageHeader title="Integrations" description="Connect your CRM and services" />

      <p className="mt-5 flex items-start gap-2 text-[13px] leading-[1.5] text-abc-secondary">
        <IconPlug size={16} stroke={1.7} className="mt-0.5 shrink-0" />
        <span>Connect a CRM and you can push a contact to it from the contact screen.</span>
      </p>

      {error ? (
        <p className="mt-4 text-[12.5px]" style={{ color: 'var(--abc-overdue)' }} role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-3">
        {CRM_PROVIDERS.map((provider) => {
          const label = crmStatusLabel(connections[provider.id])
          const connected = label !== 'not_connected'

          return (
            <section
              key={provider.id}
              className="rounded-card border border-abc-border bg-abc-card p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-semibold text-abc-text">{provider.name}</span>
                <span
                  className="shrink-0 text-[12.5px] font-medium"
                  style={{ color: loading ? 'var(--abc-muted)' : STATUS_COLOR[label] }}
                >
                  {loading ? 'Checking…' : STATUS_TEXT[label]}
                </span>
              </div>

              {loading ? null : (
                <div className="mt-3.5 flex flex-wrap gap-2">
                  <a
                    href={provider.connectPath}
                    className="inline-flex h-[44px] items-center justify-center rounded-btn border border-abc-border bg-abc-raised px-4 text-[14px] font-medium text-abc-text transition-colors hover:border-abc-border-strong abc-focus-ring"
                  >
                    {label === 'needs_reconnect' ? 'Reconnect' : label === 'connected' ? 'Reconnect' : 'Connect'}
                  </a>

                  {connected ? (
                    <button
                      type="button"
                      onClick={() => void disconnect(provider.id, provider.name)}
                      disabled={busy === provider.id}
                      className="inline-flex h-[44px] items-center justify-center rounded-btn border border-abc-border bg-transparent px-4 text-[14px] font-medium text-abc-secondary transition-colors hover:text-abc-text disabled:opacity-50 abc-focus-ring"
                    >
                      {busy === provider.id ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                  ) : null}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
