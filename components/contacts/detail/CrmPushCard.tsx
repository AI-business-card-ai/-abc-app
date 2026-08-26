'use client'

import { useEffect, useState } from 'react'
import { IconCheck, IconCloudUpload, IconExternalLink, IconRefresh } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import { CardTitle, ErrorNote } from '@/components/contacts/detail/parts'
import type { ContactDetail } from '@/lib/contact-detail'
import type { ExportResult, ExportStep } from '@/lib/crm/types'

/**
 * Push this person and this meeting into the owner's CRM.
 *
 * Explicit, always. Nothing about scanning, saving or writing up a meeting
 * sends anything anywhere — this button is the only thing that does, and it
 * exports the meeting shown above it rather than whatever the contact's legacy
 * fields happen to hold.
 *
 * The result is reported step by step because a CRM export genuinely can half
 * succeed: the person may land while the company fails. One "Synced" over that
 * would be a comfortable lie, and the owner would find the gap themselves later.
 */

type Status = 'idle' | 'checking' | 'pushing' | 'done' | 'error'

const STEP_LABEL: Record<string, string> = {
  created: 'Created',
  reused: 'Matched existing',
  synced: 'Updated',
  skipped: 'Skipped',
  failed: 'Failed',
  not_started: 'Not attempted',
}

function StepRow({ label, step }: { label: string; step: ExportStep }) {
  const failed = step.state === 'failed'
  const muted = step.state === 'skipped' || step.state === 'not_started'

  return (
    <li className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className="text-abc-secondary">{label}</span>
      <span
        className="text-right"
        style={{ color: failed ? 'var(--abc-overdue)' : muted ? 'var(--abc-muted)' : 'var(--abc-gold-accent)' }}
        title={step.message}
      >
        {STEP_LABEL[step.state] ?? step.state}
      </span>
    </li>
  )
}

export default function CrmPushCard({ contact }: { contact: ContactDetail }) {
  const [status, setStatus] = useState<Status>('checking')
  const [connected, setConnected] = useState(false)
  const [needsReconnect, setNeedsReconnect] = useState(false)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  /** The meeting shown above — the same encounter the context card renders. */
  const latest = contact.encounters[0]

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/crm/connections')
        if (!res.ok) throw new Error('failed')
        const data = await res.json()
        const hubspot = (data.connections || []).find(
          (c: { provider: string }) => c.provider === 'hubspot'
        )
        if (!active) return
        setConnected(Boolean(hubspot?.connected))
        setNeedsReconnect(Boolean(hubspot?.needsReconnect))
      } catch {
        if (active) setConnected(false)
      } finally {
        if (active) setStatus('idle')
      }
    })()
    return () => {
      active = false
    }
  }, [])

  async function push() {
    if (!latest) return
    setStatus('pushing')
    setError(null)
    try {
      const res = await fetch('/api/crm/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Ids only. Every fact that reaches the CRM is re-read server-side.
        body: JSON.stringify({ provider: 'hubspot', contactId: contact.id, encounterId: latest.id }),
      })
      const data = await res.json().catch(() => ({}))

      if (data.result) {
        setResult(data.result as ExportResult)
        if (data.result.needsReconnect) setNeedsReconnect(true)
        setStatus(data.success ? 'done' : 'error')
        if (!data.success) {
          setError(
            data.result.retryable
              ? 'HubSpot was busy. Try again in a moment.'
              : 'Some of this did not reach HubSpot.'
          )
        }
        return
      }

      throw new Error(data.error || 'failed')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error && err.message !== 'failed' ? err.message : 'Could not push to HubSpot.')
    }
  }

  return (
    <section className="abc-surface p-5">
      <div className="flex items-center gap-2">
        <IconCloudUpload size={17} stroke={1.8} style={{ color: 'var(--abc-gold-accent)' }} />
        <CardTitle>HubSpot</CardTitle>
      </div>
      <p className="mt-1.5 text-[13px] leading-[1.55] text-abc-secondary">
        {connected && !needsReconnect
          ? 'Send this person and the meeting above to your CRM.'
          : 'Connect your CRM to send contacts and meetings there.'}
      </p>

      {result ? (
        <ul className="mt-4 flex flex-col gap-2 rounded-inner border border-abc-border bg-abc-raised px-4 py-3.5">
          <StepRow label="Contact" step={result.contact} />
          <StepRow label="Company" step={result.company} />
          <StepRow label="Association" step={result.association} />
          <StepRow label="Meeting" step={result.meeting} />
          <StepRow label="Follow-up task" step={result.task} />
        </ul>
      ) : null}

      {error ? <div className="mt-3"><ErrorNote>{error}</ErrorNote></div> : null}

      <div className="mt-4">
        {status === 'checking' ? (
          <p className="text-[13px] text-abc-muted">Checking your CRM connection…</p>
        ) : !connected || needsReconnect ? (
          <Button href="/api/auth/hubspot" fullWidth className="sm:w-auto">
            <IconExternalLink size={17} stroke={1.9} />
            {needsReconnect ? 'Reconnect HubSpot' : 'Connect HubSpot'}
          </Button>
        ) : !latest ? (
          <p className="text-[13px] text-abc-muted">
            Add a meeting before pushing this contact to HubSpot.
          </p>
        ) : (
          <Button
            onClick={() => void push()}
            disabled={status === 'pushing'}
            variant={status === 'done' ? 'surface' : 'gold'}
            fullWidth
            className="sm:w-auto"
          >
            {status === 'pushing' ? null : status === 'done' ? (
              <IconRefresh size={17} stroke={1.9} />
            ) : (
              <IconCheck size={17} stroke={1.9} />
            )}
            {status === 'pushing'
              ? 'Syncing…'
              : status === 'done'
                ? 'Sync again'
                : status === 'error'
                  ? 'Retry'
                  : 'Push to HubSpot'}
          </Button>
        )}
      </div>
    </section>
  )
}
