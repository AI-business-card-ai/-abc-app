'use client'

import { useEffect, useState } from 'react'
import { IconAlertTriangle, IconCheck, IconCloudUpload } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import { SectionLabel } from '@/components/ui/abc/Bits'
import { userFacingRequestError } from '@/lib/network-error'

/**
 * Push a whole batch into the CRM the owner has connected.
 *
 * The provider list is read from `/api/crm/connections` rather than offered as
 * three buttons, because connecting HubSpot does not mean the owner wants their
 * contacts in HubSpot and Pipedrive both — the app should not be choosing where
 * somebody's contacts go. With one connection this is a single button; with
 * several it asks which.
 */

/** Mirrors `CrmConnectionStatus`, which is what /api/crm/connections returns. */
type Connection = { provider: string; connected: boolean; needsReconnect: boolean }

type ExportRow = {
  contactId: string
  name: string
  ok: boolean
  needsReconnect?: boolean
  message?: string
}

const LABELS: Record<string, string> = {
  hubspot: 'HubSpot',
  pipedrive: 'Pipedrive',
  salesforce: 'Salesforce',
}

export default function BatchExportPanel({
  batchId,
  contactCount,
}: {
  batchId: string
  contactCount: number
}) {
  const [providers, setProviders] = useState<string[]>([])
  const [chosen, setChosen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<ExportRow[] | null>(null)
  const [exported, setExported] = useState(0)

  useEffect(() => {
    let cancelled = false

    fetch('/api/crm/connections')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json) return
        const list = Array.isArray(json.connections) ? (json.connections as Connection[]) : []
        /*
          A connection needing reconnection is still offered. The owner can
          renew it and push, and hiding it would leave them wondering where
          their CRM went — the export result says plainly when that is the
          reason nothing moved.
        */
        const live = list
          .filter((connection) => connection.connected)
          .map((connection) => connection.provider)
          .filter((provider) => provider in LABELS)
        setProviders(live)
        if (live.length === 1) setChosen(live[0])
      })
      .catch((err) => console.error('[batch-export] connections failed:', err))

    return () => {
      cancelled = true
    }
  }, [])

  async function push() {
    if (!chosen || busy) return
    setBusy(true)
    setError(null)

    try {
      const res = await fetch(`/api/scan/batch/${batchId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: chosen }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) throw new Error(data.error || 'Could not push this batch.')

      setRows((data.results as ExportRow[]) || [])
      setExported(typeof data.exported === 'number' ? data.exported : 0)
    } catch (err) {
      setError(userFacingRequestError(err, 'Could not push this batch.'))
    } finally {
      setBusy(false)
    }
  }

  if (contactCount === 0) return null

  const needsReconnect = rows?.some((row) => row.needsReconnect)
  const failed = rows?.filter((row) => !row.ok) || []

  return (
    <section className="abc-surface p-4 sm:p-5">
      <SectionLabel>Send to CRM</SectionLabel>

      {providers.length === 0 ? (
        <>
          <p className="mt-1.5 text-[13px] leading-[1.55] text-abc-secondary">
            No CRM is connected yet. Connect one and every contact in this batch can go across in
            one press.
          </p>
          <div className="mt-4">
            <Button href="/settings/integrations" variant="surface" size="md">
              Connect a CRM
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1.5 text-[13px] leading-[1.55] text-abc-secondary">
            {contactCount === 1
              ? 'Push this contact and its meeting across.'
              : `Push all ${contactCount} contacts and their meeting across in one go.`}
          </p>

          {providers.length > 1 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {providers.map((provider) => {
                const active = chosen === provider
                return (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => setChosen(provider)}
                    aria-pressed={active}
                    className={`rounded-full border px-3.5 py-2 text-[12.5px] font-medium transition-colors duration-200 ease-abc abc-focus-ring ${
                      active
                        ? 'border-transparent text-[#1a1205]'
                        : 'border-abc-border bg-abc-raised text-abc-secondary hover:border-abc-border-strong hover:text-abc-text'
                    }`}
                    style={active ? { background: 'var(--abc-gold)' } : undefined}
                  >
                    {LABELS[provider]}
                  </button>
                )
              })}
            </div>
          ) : null}

          <div className="mt-4">
            <Button onClick={() => void push()} disabled={!chosen || busy} size="lg" fullWidth>
              <IconCloudUpload size={18} stroke={1.8} />
              {busy
                ? 'Pushing…'
                : `Export to ${chosen ? LABELS[chosen] : 'CRM'}`}
            </Button>
          </div>
        </>
      )}

      {error ? (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--abc-overdue)' }} role="alert">
          {error}
        </p>
      ) : null}

      {rows ? (
        <div className="mt-4 rounded-inner border border-abc-border bg-abc-raised p-3">
          <p className="flex items-center gap-2 text-[13.5px] font-semibold text-abc-text">
            {exported > 0 ? (
              <IconCheck size={15} stroke={2.2} style={{ color: 'var(--abc-gold-accent)' }} />
            ) : (
              <IconAlertTriangle size={15} stroke={2} style={{ color: 'var(--abc-overdue)' }} />
            )}
            {exported} of {rows.length} pushed
          </p>

          {needsReconnect ? (
            <p className="mt-2 text-[12.5px] leading-[1.5] text-abc-secondary">
              Your CRM connection needs renewing.{' '}
              <a href="/settings/integrations" className="text-abc-gold-accent abc-focus-ring">
                Reconnect it
              </a>{' '}
              and push again — contacts that already went across will not be duplicated.
            </p>
          ) : null}

          {failed.length > 0 && !needsReconnect ? (
            <ul className="mt-2 flex flex-col gap-1">
              {failed.map((row) => (
                <li key={row.contactId} className="text-[12.5px] text-abc-secondary">
                  <span className="text-abc-text">{row.name}</span> — {row.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
