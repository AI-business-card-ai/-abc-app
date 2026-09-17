'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconArrowLeft, IconMapPin } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import { SectionLabel } from '@/components/ui/abc/Bits'
import {
  MATCH_TYPE_LABEL,
  PRIORITY_LABEL,
  WARNING_LABEL,
  evidenceByField,
  hasLocation,
  locationLabel,
  sourceFacts,
} from '@/lib/event-intelligence/view'
import { displayTargetStatus } from '@/lib/event-intelligence/types'
import type { LinkableEncounter } from '@/lib/event-intelligence/data'
import type {
  IntelCompany,
  IntelEvent,
  IntelPresence,
  MeetingTarget,
  StoredMatch,
} from '@/lib/event-intelligence/types'

/**
 * Why ABC suggests this company — with the seam down the middle.
 *
 * Two sections, visibly different, and never interleaved:
 *
 *   **From the listing** is what the organiser published, quoted. Nothing in it
 *   is ABC's wording, and nothing appears in it that was not stored as a source
 *   value.
 *
 *   **ABC analysis** is inference, labelled as inference, and every statement
 *   carries the listing text it was drawn from so a reader can check the step
 *   rather than take it.
 *
 * The screen has no "conversation starter" or "questions to ask", and that is a
 * decision rather than an omission. The deterministic engine can say what lines
 * up; it cannot write a sentence about a company's supply chain without
 * asserting something nobody told it. Inventing that prose to fill a section
 * would be the exact failure this layout exists to prevent. When an AI adapter
 * exists it can add them — from these same facts, and marked as inference too.
 */

type Props = {
  event: IntelEvent
  match: StoredMatch
  presence: IntelPresence
  company: IntelCompany | undefined
  target: MeetingTarget | null
  source: { provider: string; sourceUrl: string | null; fetchedAt: string } | null
  /** Meetings this owner already recorded at this fair. Never created here. */
  encounters: LinkableEncounter[]
}

export default function MatchDetailView({ event, match, presence, company, target, source, encounters }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(target?.privateNote ?? '')
  const [noteSaved, setNoteSaved] = useState(false)

  const name = presence.exhibitorDisplayName ?? company?.displayName ?? 'Unnamed exhibitor'
  const facts = sourceFacts(presence, company)
  const status = target ? displayTargetStatus(target) : null

  async function save() {
    setBusy(true)
    try {
      await fetch('/api/event-intelligence/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: match.id }),
      })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!target) return
    setBusy(true)
    try {
      await fetch(`/api/event-intelligence/targets?id=${encodeURIComponent(target.id)}`, { method: 'DELETE' })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function patch(body: Record<string, unknown>) {
    if (!target) return
    setBusy(true)
    try {
      await fetch('/api/event-intelligence/targets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: target.id, ...body }),
      })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[760px] abc-page-top px-4 pb-16 sm:px-6 lg:px-8">
      <Link
        href={`/events/intelligence/${event.eventKey}`}
        className="inline-flex items-center gap-1.5 text-[13px] text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
      >
        <IconArrowLeft size={16} stroke={1.8} aria-hidden="true" />
        {event.name}
      </Link>

      <header className="mt-4">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-abc-secondary">
            {MATCH_TYPE_LABEL[match.matchType]}
          </span>
          <span className="text-[11px] font-semibold text-abc-muted">ABC Match {match.score}</span>
        </p>

        <h1 className="mt-1.5 text-[26px] font-bold leading-tight tracking-tight text-abc-text lg:text-[32px]">
          {name}
        </h1>

        <p
          className="mt-1.5 inline-flex items-center gap-1.5 text-[13.5px]"
          style={{ color: hasLocation(presence) ? 'var(--text-secondary)' : 'var(--text-muted)' }}
        >
          <IconMapPin size={15} stroke={1.7} aria-hidden="true" />
          {locationLabel(presence)}
        </p>
      </header>

      {match.warnings.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-1.5">
          {match.warnings.map((warning) => (
            <li key={warning} className="text-[12.5px] leading-[1.5] text-abc-muted">
              {WARNING_LABEL[warning]}
            </li>
          ))}
        </ul>
      ) : null}

      {/* ── What the organiser published ── */}
      <section className="abc-surface mt-6 p-4 sm:p-5">
        <SectionLabel>From the listing</SectionLabel>
        <p className="mt-1.5 text-[12px] leading-[1.5] text-abc-muted">
          Published by the event, quoted as written.
        </p>

        {facts.length === 0 ? (
          <p className="mt-4 text-[13.5px] text-abc-secondary">
            The listing gives nothing but this company&rsquo;s name.
          </p>
        ) : (
          <dl className="mt-4 flex flex-col gap-4">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt className="text-[12px] font-semibold uppercase tracking-[0.05em] text-abc-muted">
                  {fact.label}
                </dt>
                <dd className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[13.5px] leading-[1.55] text-abc-text">
                  {fact.values.map((value) => (
                    <span key={value}>{value}</span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {presence.listingUrl ? (
          <p className="mt-4 break-words text-[12.5px] text-abc-muted">
            Listing: <span className="text-abc-secondary">{presence.listingUrl}</span>
          </p>
        ) : null}
      </section>

      {/* ── What ABC concluded from it ── */}
      <section className="abc-surface mt-4 p-4 sm:p-5">
        <SectionLabel>ABC analysis</SectionLabel>
        <p className="mt-1.5 text-[12px] leading-[1.5] text-abc-muted">
          ABC&rsquo;s reading of the listing against what you said you want. Not published by the
          event, and not a claim about what this company will do.
        </p>

        {match.reasons.length === 0 ? (
          <p className="mt-4 text-[13.5px] text-abc-secondary">
            Nothing here could be supported by the listing.
          </p>
        ) : (
          <ol className="mt-4 flex flex-col gap-4">
            {match.reasons.map((reason, index) => {
              const cited = evidenceByField(match.evidence, reason.evidenceIndex)
              return (
                <li key={`${reason.signal}-${index}`}>
                  <p className="text-[14px] leading-[1.55] text-abc-text">{reason.statement}</p>
                  {cited.map((group) => (
                    <p key={group.label} className="mt-1 text-[12.5px] leading-[1.5] text-abc-muted">
                      <span className="uppercase tracking-[0.04em]">{group.label}:</span>{' '}
                      {group.values.join(' · ')}
                    </p>
                  ))}
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {/* ── The owner's decision ── */}
      <section className="abc-surface mt-4 p-4 sm:p-5">
        <SectionLabel>Your plan</SectionLabel>

        {!target ? (
          <div className="mt-3">
            <p className="text-[13.5px] leading-[1.55] text-abc-secondary">
              Save them and they appear in your plan for {event.name}, with their stand.
            </p>
            <div className="mt-4">
              <Button onClick={save} disabled={busy}>
                {busy ? 'Saving…' : 'Save as a target'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-5">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-abc-muted">
                Priority
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {([1, 2, 3] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => patch({ priority: level })}
                    disabled={busy}
                    aria-pressed={target.priority === level}
                    className={`inline-flex min-h-[44px] items-center rounded-btn border px-3 py-2 text-[13px] font-medium transition-colors duration-200 ease-abc disabled:opacity-45 abc-focus-ring ${
                      target.priority === level
                        ? 'border-abc-border-strong bg-abc-raised text-abc-text'
                        : 'border-abc-border text-abc-secondary hover:text-abc-text'
                    }`}
                  >
                    {PRIORITY_LABEL[level]}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-abc-muted">
                Private note
              </span>
              <span className="mt-0.5 block text-[12px] text-abc-muted">
                Yours alone. Never sent anywhere, and never part of a match.
              </span>
              <textarea
                className="abc-input mt-2 w-full px-3 py-2.5 text-[14px] leading-[1.55]"
                rows={3}
                value={note}
                onChange={(event_) => {
                  setNote(event_.target.value)
                  setNoteSaved(false)
                }}
                onBlur={async () => {
                  if (note === (target.privateNote ?? '')) return
                  await patch({ privateNote: note })
                  setNoteSaved(true)
                }}
                placeholder="Ask whether housings are made internally or sourced."
              />
              {noteSaved ? (
                <span className="mt-1 block text-[12px] text-abc-muted" role="status">
                  Saved.
                </span>
              ) : null}
            </label>

            {/*
              The encounter bridge.

              A target never becomes a meeting on its own, and this screen has
              no button that would make one. It can only point at a meeting the
              owner already recorded through the normal paths — scanning a card,
              exchanging ABC, or saving a contact by hand — which is why the
              list below is of things that already exist and is empty until one
              does.
            */}
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-abc-muted">
                Did you meet them?
              </p>

              {target.metEncounterId ? (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span className="text-[13.5px] text-abc-text">
                    Linked to a meeting you recorded.
                  </span>
                  <button
                    type="button"
                    onClick={() => patch({ metEncounterId: null })}
                    disabled={busy}
                    className="min-h-[44px] text-[13px] font-medium text-abc-secondary transition-colors hover:text-abc-text disabled:opacity-45 abc-focus-ring"
                  >
                    Unlink
                  </button>
                </div>
              ) : encounters.length === 0 ? (
                <p className="mt-1.5 text-[12.5px] leading-[1.55] text-abc-muted">
                  Nothing recorded at {event.name} yet. Scan their card or save the contact when you
                  meet them, and the meeting will be offered here.
                </p>
              ) : (
                <>
                  <p className="mt-1.5 text-[12.5px] leading-[1.55] text-abc-muted">
                    Pick the meeting you recorded with them. ABC will not create one for you.
                  </p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {encounters.map((encounter) => (
                      <li key={encounter.id}>
                        <button
                          type="button"
                          onClick={() => patch({ metEncounterId: encounter.id })}
                          disabled={busy}
                          className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-btn border border-abc-border px-3 py-2 text-left transition-colors duration-200 ease-abc hover:border-abc-border-strong disabled:opacity-45 abc-focus-ring"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[13.5px] font-medium text-abc-text">
                              {encounter.personName ?? 'Unnamed contact'}
                              {encounter.company ? ` · ${encounter.company}` : ''}
                            </span>
                            {encounter.metAt ? (
                              <span className="block text-[12px] text-abc-muted">
                                {new Date(encounter.metAt).toLocaleDateString(undefined, {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-[12.5px] text-abc-secondary">Link</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <p className="mt-2 text-[12px] text-abc-muted">
                {status === 'met'
                  ? 'Marked met, because a real meeting is linked.'
                  : `Status: ${status}.`}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button href={`/events/intelligence/${event.eventKey}/plan`} variant="surface">
                Your plan
              </Button>
              <Button onClick={remove} disabled={busy} variant="ghost">
                Remove from plan
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* ── Where all this came from ── */}
      <section className="mt-6">
        <p className="text-[12px] leading-[1.6] text-abc-muted">
          {source ? (
            <>
              Source: {source.provider}
              {source.sourceUrl ? ` · ${source.sourceUrl}` : ''} · fetched{' '}
              {new Date(source.fetchedAt).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
              .
            </>
          ) : (
            'No source record is stored for this listing.'
          )}{' '}
          ABC Match {match.score} is how well this listing fits what you told ABC, scored by{' '}
          {match.engineVersion}. It is not a prediction that they will buy.
        </p>
      </section>
    </div>
  )
}
