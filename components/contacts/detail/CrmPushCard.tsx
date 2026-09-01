'use client'

import { useEffect, useState } from 'react'
import { IconCheck, IconCloudUpload, IconExternalLink, IconRefresh } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import { CardTitle, ErrorNote } from '@/components/contacts/detail/parts'
import { CRM_PROVIDERS, crmStatusLabel } from '@/lib/crm/providers'
import type { ContactDetail } from '@/lib/contact-detail'
import type { CrmProvider, ExportResult, ExportStep } from '@/lib/crm/types'

/**
 * Push this person and this meeting into the owner's CRM.
 *
 * Explicit, always. Nothing about scanning, saving or writing up a meeting
 * sends anything anywhere — this card is the only thing that does, and it
 * exports the meeting shown above it rather than whatever the contact's legacy
 * fields happen to hold.
 *
 * One card for every CRM rather than one card each. A second integration should
 * not cost the contact screen a second panel, so the providers are rows inside
 * the panel that already exists, and a row that has never been used is a single
 * line with a Connect link.
 *
 * The owner picks the destination. Both being connected is not permission to
 * push to both — that would be the app deciding where somebody's contacts go.
 *
 * Results are reported step by step because a CRM export genuinely can half
 * succeed: the person may land while the company fails. One "Synced" over that
 * would be a comfortable lie, and the owner would find the gap themselves later.
 */

type ProviderId = CrmProvider
type Status = 'idle' | 'pushing' | 'done' | 'error'

type ConnectionStatus = {
  provider: string
  connected?: boolean
  needsReconnect?: boolean
}

/**
 * What each CRM calls the things ABC pushes.
 *
 * The step names are ABC's, and stay ABC's, but showing an owner "Contact" when
 * their CRM says "Person" makes them translate for us.
 */
type PushLabels = {
  contact: string
  company: string
  association: string
  meeting: string
  task: string
}

const LABELS: Record<ProviderId, PushLabels> = {
  hubspot: {
    contact: 'Contact',
    company: 'Company',
    association: 'Association',
    meeting: 'Meeting',
    task: 'Follow-up task',
  },
  pipedrive: {
    contact: 'Person',
    company: 'Organization',
    association: 'Linked to organization',
    meeting: 'Meeting activity',
    task: 'Follow-up activity',
  },
  salesforce: {
    contact: 'Contact',
    company: 'Account',
    association: 'Linked to account',
    // Not "Event". ABC records the meeting as a completed Salesforce Task,
    // because Salesforce will not accept a timed Event without a duration or
    // an end time and ABC knows neither. Saying "Event" here would name an
    // object nothing writes.
    meeting: 'Meeting',
    task: 'Follow-up task',
  },
}

/*
  Identity from the shared list, wording from here.

  Which CRMs exist is one fact and belongs in one place; what each of them
  calls the objects ABC pushes is this card's own business. Keeping the first
  half here as a second literal array is what let the contact sidebar and this
  panel disagree about whether Pipedrive existed.
*/
const PROVIDERS = CRM_PROVIDERS.map((provider) => ({
  ...provider,
  labels: LABELS[provider.id],
}))

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
  const [checking, setChecking] = useState(true)
  const [connections, setConnections] = useState<Record<string, ConnectionStatus>>({})
  const [busy, setBusy] = useState<ProviderId | null>(null)
  const [status, setStatus] = useState<Partial<Record<ProviderId, Status>>>({})
  const [results, setResults] = useState<Partial<Record<ProviderId, ExportResult>>>({})
  const [errors, setErrors] = useState<Partial<Record<ProviderId, string>>>({})

  /** The meeting shown above — the same encounter the context card renders. */
  const latest = contact.encounters[0]

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/crm/connections')
        if (!res.ok) throw new Error('failed')
        const data = await res.json()
        if (!active) return

        const byProvider: Record<string, ConnectionStatus> = {}
        for (const c of (data.connections || []) as ConnectionStatus[]) {
          if (c?.provider) byProvider[c.provider] = c
        }
        setConnections(byProvider)
      } catch {
        if (active) setConnections({})
      } finally {
        if (active) setChecking(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  async function push(provider: ProviderId) {
    if (!latest) return
    setBusy(provider)
    setStatus((s) => ({ ...s, [provider]: 'pushing' }))
    setErrors((e) => ({ ...e, [provider]: undefined }))

    try {
      const res = await fetch('/api/crm/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Ids only. Every fact that reaches the CRM is re-read server-side.
        body: JSON.stringify({ provider, contactId: contact.id, encounterId: latest.id }),
      })
      const data = await res.json().catch(() => ({}))

      if (data.result) {
        const result = data.result as ExportResult
        setResults((r) => ({ ...r, [provider]: result }))
        if (result.needsReconnect) {
          setConnections((c) => ({ ...c, [provider]: { ...c[provider], provider, needsReconnect: true } }))
        }
        setStatus((s) => ({ ...s, [provider]: data.success ? 'done' : 'error' }))
        if (!data.success) {
          /*
            A mapping failure is worth saying out loud rather than filing under
            "some of this did not arrive". The record exists in their CRM and
            ABC cannot yet point at it, so pushing again is the one thing they
            should not do — the message says so, and says nothing about the
            database that produced it.
          */
          const mappingFailure = [result.contact, result.company, result.meeting, result.task].find(
            (s) => s.reason === 'mapping_persistence_failed' || s.reason === 'mapping_conflict'
          )

          setErrors((e) => ({
            ...e,
            [provider]: mappingFailure?.message
              ? mappingFailure.message
              : result.retryable
                ? 'That CRM was busy. Try again in a moment.'
                : 'Some of this did not arrive.',
          }))
        }
        return
      }

      throw new Error(data.error || 'failed')
    } catch (err) {
      setStatus((s) => ({ ...s, [provider]: 'error' }))
      setErrors((e) => ({
        ...e,
        [provider]:
          err instanceof Error && err.message !== 'failed' ? err.message : 'Could not push to that CRM.',
      }))
    } finally {
      setBusy(null)
    }
  }

  const anyConnected = PROVIDERS.some((p) => crmStatusLabel(connections[p.id]) === 'connected')

  return (
    /*
      `crm` is a link target, not decoration. This is the only place on the
      contact screen where a connection can actually be made, so the sidebar
      summary points here rather than at a settings page that has no CRM
      controls on it.

      Section id plus `scroll-mt-20` is the pattern the follow-ups screen
      already uses for its anchors, and the margin clears the mobile header,
      which is sticky and 56px tall.
    */
    <section id="crm" className="abc-surface scroll-mt-20 p-5">
      <div className="flex items-center gap-2">
        <IconCloudUpload size={17} stroke={1.8} style={{ color: 'var(--abc-gold-accent)' }} />
        <CardTitle>CRM</CardTitle>
      </div>
      <p className="mt-1.5 text-[13px] leading-[1.55] text-abc-secondary">
        {anyConnected
          ? 'Send this person and the meeting above to your CRM.'
          : 'Connect a CRM to send contacts and meetings there.'}
      </p>

      {checking ? (
        <p className="mt-4 text-[13px] text-abc-muted">Checking your CRM connections…</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {PROVIDERS.map((provider) => {
            const connection = connections[provider.id]
            /*
              The same reading the contact sidebar uses. Both screens showing
              this contact's CRM state now decide it in one place, which is the
              whole point: they used to answer differently on one page.
            */
            const label = crmStatusLabel(connection)
            const connected = label === 'connected'
            const needsReconnect = label === 'needs_reconnect'
            const state = status[provider.id] ?? 'idle'
            const result = results[provider.id]
            const error = errors[provider.id]
            const pushing = busy === provider.id && state === 'pushing'

            return (
              <div
                key={provider.id}
                className="rounded-inner border border-abc-border bg-abc-raised px-4 py-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[13.5px] text-abc-primary">{provider.name}</p>
                    <p className="text-[12px] text-abc-muted">
                      {needsReconnect
                        ? 'Needs reconnecting'
                        : connected
                          ? 'Connected'
                          : 'Not connected'}
                    </p>
                  </div>

                  {!connected || needsReconnect ? (
                    <Button href={provider.connectPath} variant="surface" className="shrink-0">
                      <IconExternalLink size={16} stroke={1.9} />
                      {needsReconnect ? 'Reconnect' : 'Connect'}
                    </Button>
                  ) : !latest ? (
                    <p className="text-[12px] text-abc-muted">Add a meeting first</p>
                  ) : (
                    /*
                      Neutral surface with a gold icon, not a gold button.
                      Three connected CRMs meant three full-gold buttons stacked
                      down the page, each claiming to be the thing to do next —
                      which is no hierarchy at all, and it drowned out the
                      Smart Follow-up above them. The accent moves to the icon:
                      still obviously the action on the row, no longer competing
                      with the page.
                    */
                    <Button
                      onClick={() => void push(provider.id)}
                      disabled={busy !== null}
                      variant="surface"
                      className="shrink-0"
                    >
                      {pushing ? null : state === 'done' ? (
                        <IconRefresh size={16} stroke={1.9} style={{ color: 'var(--abc-gold-accent)' }} />
                      ) : (
                        <IconCheck size={16} stroke={1.9} style={{ color: 'var(--abc-gold-accent)' }} />
                      )}
                      {pushing
                        ? 'Syncing…'
                        : state === 'done'
                          ? 'Sync again'
                          : state === 'error'
                            ? 'Retry'
                            : `Push to ${provider.name}`}
                    </Button>
                  )}
                </div>

                {result ? (
                  <ul className="mt-3.5 flex flex-col gap-2 border-t border-abc-border pt-3">
                    <StepRow label={provider.labels.contact} step={result.contact} />
                    <StepRow label={provider.labels.company} step={result.company} />
                    <StepRow label={provider.labels.association} step={result.association} />
                    <StepRow label={provider.labels.meeting} step={result.meeting} />
                    <StepRow label={provider.labels.task} step={result.task} />
                  </ul>
                ) : null}

                {error ? (
                  <div className="mt-3">
                    <ErrorNote>{error}</ErrorNote>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
