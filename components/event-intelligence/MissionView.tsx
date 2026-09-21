import Link from 'next/link'
import { IconArrowLeft, IconChevronRight } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import MissionSetupForm from '@/components/event-intelligence/MissionSetupForm'
import RunMatching from '@/components/event-intelligence/RunMatching'
import {
  crmPending,
  dueFollowUps,
  missionPaths,
  missionTiming,
  peopleMet,
  remainingTargets,
  timingLabel,
  type MissionAction,
  type MissionFacts,
  type MissionSetupInput,
} from '@/lib/event-intelligence/mission'
import type { CompanyIntentProfile, EventObjective, IntelEvent } from '@/lib/event-intelligence/types'

/**
 * The Expo Mission — one screen, one next action.
 *
 * No tabs and no before/during/after: the same screen adapts to where the fair
 * is (from its own dates) and to what has actually happened. The one dominant
 * card is `nextMissionAction`; everything else — every opportunity, the plan,
 * the material, the event details — is one step away behind "Show details",
 * never in the way.
 */

type Props = {
  event: IntelEvent
  facts: MissionFacts | null
  action: MissionAction | null
  exhibitors: number
  setup: {
    defaults: MissionSetupInput
    profile: CompanyIntentProfile | null
    objective: EventObjective | null
    companyName: string | null
  } | null
}

function dateRange(event: IntelEvent): string | null {
  const format = (value: string | null) => {
    if (!value) return null
    const date = new Date(`${value}T12:00:00Z`)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  const from = format(event.startsOn)
  const to = format(event.endsOn)
  if (!from && !to) return null
  if (!to || from === to) return from
  return `${from} – ${to}`
}

function contextLine(facts: MissionFacts): string[] {
  const timing = missionTiming(facts.event, facts.today)
  const remaining = remainingTargets(facts)
  const n = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`

  if (timing.kind === 'live') {
    return [n(peopleMet(facts), 'person met', 'people met'), n(remaining.length, 'target remaining', 'targets remaining')]
  }
  if (timing.kind === 'after') {
    const parts = [n(peopleMet(facts), 'person met', 'people met'), n(dueFollowUps(facts).length, 'follow-up due', 'follow-ups due')]
    if (facts.crmConnected) parts.push(n(crmPending(facts).length, 'not yet in your CRM', 'not yet in your CRM'))
    return parts
  }
  const shared = remaining.filter((t) => t.brief?.status === 'shared').length
  const parts = [n(facts.matchedCompanies, 'company worth reviewing', 'companies worth reviewing')]
  if (facts.targets.length > 0) parts.push(n(remaining.length, 'target', 'targets'))
  if (shared > 0) parts.push(n(shared, 'meeting request shared', 'meeting requests shared'))
  return parts
}

function NextActionCard({ facts, action }: { facts: MissionFacts; action: MissionAction }) {
  return (
    <section aria-labelledby="mission-next" className="abc-surface p-5 sm:p-6">
      <h2 id="mission-next" className="text-[12px] font-semibold uppercase tracking-[0.14em] text-abc-gold-accent">
        {action.eyebrow}
      </h2>

      <p className="mt-2.5 text-[22px] font-bold leading-tight tracking-tight text-abc-text lg:text-[26px]">
        {action.title}
      </p>
      {action.location ? <p className="mt-1 text-[14px] font-medium text-abc-secondary">{action.location}</p> : null}

      {action.listing.length > 0 ? (
        <div className="mt-4">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-abc-muted">From the listing</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="From the listing">
            {action.listing.map((fact) => (
              <li key={fact} className="rounded-full border border-abc-border px-2.5 py-0.5 text-[12.5px] text-abc-secondary">
                {fact}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {action.lines.length > 0 ? (
        <dl className="mt-4 flex flex-col gap-3">
          {action.lines.map((line) => (
            <div key={line.label}>
              <dt className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-abc-muted">{line.label}</dt>
              <dd className="mt-0.5 text-[14.5px] leading-[1.55] text-abc-text">{line.text}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {action.listing.length > 0 && action.lines.some((l) => /^Why/.test(l.label)) ? (
        <p className="mt-3 text-[12px] leading-[1.5] text-abc-muted">
          “Why” is ABC’s reading of the listing, not a fact about the company.
        </p>
      ) : null}

      <div className="mt-5">
        {action.primary.kind === 'link' ? (
          <Button href={action.primary.href} size="lg" fullWidth className="sm:w-auto">
            {action.primary.label}
          </Button>
        ) : action.primary.kind === 'run-matching' ? (
          <RunMatching eventKey={facts.event.key} label={action.primary.label} />
        ) : null}
      </div>

      {action.whyHref || action.secondary.length > 0 ? (
        <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          {action.whyHref ? (
            <li>
              <Link
                href={action.whyHref}
                className="inline-flex min-h-[44px] items-center text-[13px] font-medium text-abc-secondary hover:text-abc-text abc-focus-ring"
              >
                See why
              </Link>
            </li>
          ) : null}
          {action.secondary.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="inline-flex min-h-[44px] items-center text-[13px] font-medium text-abc-secondary hover:text-abc-text abc-focus-ring"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

export default function MissionView({ event, facts, action, exhibitors, setup }: Props) {
  const paths = missionPaths(event.eventKey)
  const timing = facts ? timingLabel(missionTiming(facts.event, facts.today)) : null
  const when = [timing, dateRange(event), [event.venue, event.city].filter(Boolean).join(', ') || null]
    .filter(Boolean)
    .join(' · ')

  const details = [
    { label: 'All opportunities', href: paths.opportunities },
    { label: 'Your plan', href: paths.plan },
    { label: 'What you will show', href: paths.profile },
    { label: 'Refine your mission', href: paths.setup },
    { label: 'People you met here', href: paths.meetings },
    { label: 'Import or update the exhibitor list', href: paths.import },
  ]

  return (
    <div className="mx-auto w-full max-w-[760px] abc-page-top px-4 pb-12 sm:px-6 lg:px-8">
      <Link
        href="/home"
        className="inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-medium text-abc-secondary hover:text-abc-text abc-focus-ring"
      >
        <IconArrowLeft size={16} stroke={1.8} aria-hidden="true" />
        Home
      </Link>

      <header className="mt-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-abc-gold-accent">Expo Mission</p>
        <h1 className="mt-1.5 text-[28px] font-bold leading-tight tracking-tight text-abc-text lg:text-[36px]">
          {event.name}
        </h1>
        {when ? <p className="mt-1.5 text-[14px] text-abc-secondary">{when}</p> : null}
      </header>

      <div className="mt-6">
        {!facts || !action || action.stage === 'setup_required' ? (
          setup ? (
            <section aria-labelledby="mission-setup" className="abc-surface p-5 sm:p-6">
              <h2 id="mission-setup" className="text-[18px] font-bold leading-tight text-abc-text">
                Build your mission for {event.name}
              </h2>
              <p className="mt-1.5 text-[13.5px] leading-[1.55] text-abc-secondary">
                Two answers. ABC finds the companies worth your time among the {exhibitors.toLocaleString('en-GB')} exhibitors it
                holds for this fair, then tells you what to do next.
              </p>
              <div className="mt-5">
                <MissionSetupForm
                  fixedEvent={{ key: event.eventKey, name: event.name }}
                  events={[]}
                  defaults={setup.defaults}
                  profile={setup.profile}
                  objective={setup.objective}
                  companyName={setup.companyName}
                />
              </div>
            </section>
          ) : null
        ) : (
          <>
            {action.stage === 'review_opportunities' && facts.targets.length === 0 ? (
              <p className="mb-3 text-[15px] font-semibold text-abc-text" role="status">
                Your mission is ready — {facts.matchedCompanies}{' '}
                {facts.matchedCompanies === 1 ? 'company' : 'companies'} worth reviewing.
              </p>
            ) : null}

            <NextActionCard facts={facts} action={action} />

            <p className="mt-4 text-[13px] leading-[1.6] text-abc-muted">{contextLine(facts).join(' · ')}</p>
          </>
        )}
      </div>

      <details className="group mt-6 border-t border-abc-border pt-2">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between text-[13.5px] font-medium text-abc-secondary hover:text-abc-text abc-focus-ring">
          Show details
          <IconChevronRight size={16} stroke={1.8} aria-hidden="true" className="transition-transform group-open:rotate-90" />
        </summary>

        <div className="pb-2 pt-1">
          <p className="text-[12.5px] leading-[1.6] text-abc-muted">
            {exhibitors.toLocaleString('en-GB')} {exhibitors === 1 ? 'exhibitor' : 'exhibitors'} from an imported exhibitor list.
            ABC works from the list it holds for this fair; it does not know every exhibitor on its own.
          </p>
          <ul className="mt-2 flex flex-col">
            {details.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="flex min-h-[44px] items-center justify-between border-b border-abc-border/60 text-[14px] text-abc-text hover:text-abc-gold-accent abc-focus-ring"
                >
                  {link.label}
                  <IconChevronRight size={16} stroke={1.8} aria-hidden="true" className="text-abc-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  )
}
