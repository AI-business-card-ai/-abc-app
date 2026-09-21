'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/abc/Button'
import {
  missionPaths,
  missionSetupBodies,
  type MissionSetupInput,
} from '@/lib/event-intelligence/mission'
import type { MissionSetupOption } from '@/lib/event-intelligence/mission-data'
import type { CompanyIntentProfile, EventObjective } from '@/lib/event-intelligence/types'

/**
 * The whole mission setup: where, what you sell, what you are looking for.
 *
 * Three answers, then one button. Behind the button the existing Event
 * Intelligence endpoints do what they already do — save the company profile,
 * save the objective for this fair, run the matching engine — in that order.
 * There is no second setup model and no mission endpoint: the mission is the
 * objective, and everything the engine needs lives where it always has.
 *
 * Everything the simple form does not ask about is carried over untouched
 * (`missionSetupBodies`), so building a mission can never wipe what somebody
 * set in "Refine".
 */

type Props = {
  /** Fairs that can be chosen. Ignored when `fixedEvent` is given. */
  events: MissionSetupOption[]
  fixedEvent?: { key: string; name: string } | null
  defaults: MissionSetupInput
  profile: CompanyIntentProfile | null
  objective: EventObjective | null
  companyName: string | null
  /** Tighter spacing for the Home card. */
  compact?: boolean
}

const CHOICES = [
  { key: 'suppliers', label: 'Suppliers' },
  { key: 'distributors', label: 'Distributors' },
  { key: 'partners', label: 'Partners' },
] as const

async function post(url: string, body: unknown): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (response.ok) return null
    const data = await response.json().catch(() => null)
    return typeof data?.error === 'string' ? data.error : 'That did not work. Try again.'
  } catch {
    return 'ABC could not be reached. Check your connection and try again.'
  }
}

export default function MissionSetupForm({
  events,
  fixedEvent = null,
  defaults,
  profile,
  objective,
  companyName,
  compact = false,
}: Props) {
  const router = useRouter()
  const selectable = events.filter((event) => !event.hasMission)
  const [eventKey, setEventKey] = useState<string>(fixedEvent?.key ?? selectable[0]?.key ?? '')
  const [input, setInput] = useState<MissionSetupInput>(defaults)
  const [step, setStep] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const chosen = fixedEvent ?? selectable.find((event) => event.key === eventKey) ?? null
  const busy = step !== null
  const idPrefix = compact ? 'home-mission' : 'mission'

  async function build(event: React.FormEvent) {
    event.preventDefault()
    if (!chosen) {
      setError('Choose the fair you are going to.')
      return
    }

    const bodies = missionSetupBodies(input, chosen.key, profile, objective, companyName)
    if (!bodies.ok) {
      setError(bodies.error)
      return
    }

    setError(null)
    setStep('Saving what you sell…')
    let failure = await post('/api/event-intelligence/profile', bodies.value.profile)
    if (!failure) {
      setStep('Saving what you are looking for…')
      failure = await post('/api/event-intelligence/objective', bodies.value.objective)
    }
    if (!failure) {
      setStep('Finding the companies worth your time…')
      // A matching problem (no exhibitor list, nothing lined up) is explained on
      // the mission screen itself, so it does not stop the owner getting there.
      await post('/api/event-intelligence/match', { eventKey: chosen.key })
    }

    if (failure) {
      setStep(null)
      setError(failure)
      return
    }

    router.push(missionPaths(chosen.key).mission)
    router.refresh()
  }

  const field = 'abc-input w-full px-3 py-2.5 text-[14px]'

  return (
    <form onSubmit={build} className={compact ? 'mt-3 flex flex-col gap-3.5' : 'flex flex-col gap-5'} noValidate>
      {fixedEvent ? null : (
        <label className="block" htmlFor={`${idPrefix}-event`}>
          <span className="block text-[13px] font-semibold text-abc-text">Where are you going next?</span>
          {selectable.length === 1 ? (
            <span id={`${idPrefix}-event`} className="mt-1.5 block text-[15px] font-semibold text-abc-text">
              {selectable[0].name}
            </span>
          ) : (
            <select
              id={`${idPrefix}-event`}
              value={eventKey}
              onChange={(e) => setEventKey(e.target.value)}
              className={`${field} mt-2 min-h-[44px]`}
              disabled={busy}
            >
              {selectable.map((event) => (
                <option key={event.key} value={event.key}>
                  {event.name}
                </option>
              ))}
            </select>
          )}
        </label>
      )}

      <label className="block" htmlFor={`${idPrefix}-sell`}>
        <span className="block text-[13px] font-semibold text-abc-text">What do you sell?</span>
        <input
          id={`${idPrefix}-sell`}
          value={input.sell}
          onChange={(e) => setInput({ ...input, sell: e.target.value })}
          placeholder="e.g. Medical imaging components"
          className={`${field} mt-2 min-h-[44px]`}
          autoComplete="off"
          disabled={busy}
        />
      </label>

      <label className="block" htmlFor={`${idPrefix}-looking`}>
        <span className="block text-[13px] font-semibold text-abc-text">What are you looking for?</span>
        <input
          id={`${idPrefix}-looking`}
          value={input.lookingFor}
          onChange={(e) => setInput({ ...input, lookingFor: e.target.value })}
          placeholder="e.g. OEM customers and distributors in DACH"
          className={`${field} mt-2 min-h-[44px]`}
          autoComplete="off"
          disabled={busy}
        />
      </label>

      <div>
        <p id={`${idPrefix}-also`} className="text-[12.5px] text-abc-secondary">
          ABC always looks for customers. Also look for:
        </p>
        <div role="group" aria-labelledby={`${idPrefix}-also`} className="mt-2 flex flex-wrap gap-2">
          {CHOICES.map(({ key, label }) => {
            const on = input[key]
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => setInput({ ...input, [key]: !on })}
                disabled={busy}
                className={[
                  'inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 text-[13.5px] font-medium transition-colors abc-focus-ring',
                  on
                    ? 'border-abc-gold-border bg-abc-gold-soft text-abc-text'
                    : 'border-abc-border bg-transparent text-abc-secondary hover:text-abc-text',
                ].join(' ')}
              >
                <span aria-hidden="true">{on ? '✓' : '+'}</span>
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-[13px] leading-[1.5]" style={{ color: 'var(--abc-overdue)' }}>
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <Button type="submit" size="lg" fullWidth disabled={busy || !chosen} className="sm:w-auto">
          {busy ? 'Building your mission…' : 'Build my mission'}
        </Button>
        {chosen ? (
          <Link
            href={missionPaths(chosen.key).setup}
            className="inline-flex min-h-[44px] items-center justify-center px-2 text-[13px] font-medium text-abc-secondary hover:text-abc-text abc-focus-ring"
          >
            Refine in detail
          </Link>
        ) : null}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {step ?? ''}
      </p>
      {step ? <p className="text-[12.5px] text-abc-muted">{step}</p> : null}
    </form>
  )
}
