import { parseList } from '@/lib/event-intelligence/intent'
import { WEAK_SCORE } from '@/lib/event-intelligence/scoring'
import type {
  CompanyIntentProfile,
  EventObjective,
  MatchType,
  TargetStatus,
} from '@/lib/event-intelligence/types'

/**
 * Expo Mission — one question, answered from what already happened.
 *
 * Event Intelligence has many parts: a company profile, an objective for one
 * fair, matches, saved targets, prepared meeting requests, and — from ABC's
 * other half — the meetings somebody actually recorded, their follow-ups and
 * whether they reached a CRM. A person at a fair should not have to know any of
 * that. The mission asks one thing: *what should I do next?*
 *
 * Everything here is pure. It takes plain facts that were read elsewhere
 * (`mission-data.ts`) and returns plain answers, so every rule is testable
 * without a database and gives the same answer every time for the same facts.
 * There is no stored "mission status" to fall out of step with the data: the
 * state is derived, on every read, from the rows that already exist.
 *
 * Two invariants carry over from the rest of the feature and are enforced here
 * by construction rather than by care:
 *
 *  - TARGET ≠ ENCOUNTER. A target counts as met only when it points at a
 *    recorded meeting (`met`, from `met_encounter_id`). Opening it, preparing
 *    it, sharing a request or the fair starting changes nothing.
 *  - INVITATION ≠ MEETING. A shared meeting request is a step in preparation,
 *    never a meeting. The target stays a target to visit.
 */

// ── Facts ────────────────────────────────────────────────────────

export type MissionEventFact = {
  key: string
  name: string
  startsOn: string | null
  endsOn: string | null
  city: string | null
  venue: string | null
}

/** A company the owner has not saved yet, best first. */
export type MissionOpportunityFact = {
  matchId: string
  company: string
  hall: string | null
  stand: string | null
  matchType: MatchType
  score: number
  /** ABC's statement of what lines up — its analysis, not the listing's words. */
  why: string | null
  /** What the listing itself says, quoted: categories, then country. */
  listing: string[]
}

export type MissionBriefFact = {
  status: 'draft' | 'ready' | 'shared'
  topic: string | null
  productName: string | null
}

export type MissionTargetFact = MissionOpportunityFact & {
  targetId: string
  status: Exclude<TargetStatus, 'met'>
  priority: 1 | 2 | 3
  /** True only when the target points at a recorded meeting. */
  met: boolean
  brief: MissionBriefFact | null
}

/** A meeting recorded at this fair, read through the Event Workspace rules. */
export type MissionMeetingFact = {
  encounterId: string
  contactId: string
  personName: string | null
  company: string | null
  metAt: string | null
  discussed: string | null
  nextAction: string | null
  followUp: 'due' | 'scheduled' | 'none'
  followUpAt: string | null
  inCrm: boolean
}

export type MissionFacts = {
  event: MissionEventFact
  /** YYYY-MM-DD. The day the answer is for. */
  today: string
  /** An objective exists for this fair and the profile has something to match on. */
  setupComplete: boolean
  /** Listed exhibitors ABC holds for this fair. */
  exhibitors: number
  /** Distinct companies with at least one match. */
  matchedCompanies: number
  /** Not yet saved, strongest first. */
  opportunities: MissionOpportunityFact[]
  targets: MissionTargetFact[]
  meetings: MissionMeetingFact[]
  crmConnected: boolean
}

// ── Timing ───────────────────────────────────────────────────────

export type MissionTiming =
  | { kind: 'undated' }
  | { kind: 'before'; daysUntil: number }
  | { kind: 'live'; day: number; days: number }
  | { kind: 'after'; daysSince: number }

const DAY_MS = 86_400_000

function dayNumber(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(time) ? null : Math.round(time / DAY_MS)
}

/** Today as the calendar date the mission works in. UTC, like `eventPhaseOn`. */
export function missionToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/**
 * Where the fair is relative to today, from the dates it carries.
 *
 * A fair with no dates is `undated` rather than guessed at, and is treated as
 * still ahead: nothing about it has happened yet as far as ABC can tell.
 */
export function missionTiming(event: Pick<MissionEventFact, 'startsOn' | 'endsOn'>, today: string): MissionTiming {
  const start = dayNumber(event.startsOn ?? event.endsOn ?? '')
  const end = dayNumber(event.endsOn ?? event.startsOn ?? '')
  const now = dayNumber(today)
  if (start === null || end === null || now === null) return { kind: 'undated' }
  if (now < start) return { kind: 'before', daysUntil: start - now }
  if (now > end) return { kind: 'after', daysSince: now - end }
  return { kind: 'live', day: now - start + 1, days: end - start + 1 }
}

export function timingLabel(timing: MissionTiming): string | null {
  switch (timing.kind) {
    case 'undated':
      return null
    case 'before':
      return timing.daysUntil === 1 ? 'Tomorrow' : `In ${timing.daysUntil} days`
    case 'live':
      return timing.days > 1 ? `Live · day ${timing.day} of ${timing.days}` : 'Live today'
    case 'after':
      return timing.daysSince === 1 ? 'Ended yesterday' : `Ended ${timing.daysSince} days ago`
  }
}

// ── Next best action ─────────────────────────────────────────────

export type MissionStage =
  | 'setup_required'
  | 'no_exhibitors'
  | 'find_opportunities'
  | 'review_opportunities'
  | 'prepare_target'
  | 'share_request'
  | 'plan_ready'
  | 'visit_target'
  | 'scan_people'
  | 'follow_up'
  | 'relationships_need_attention'
  | 'send_to_crm'
  | 'no_meetings_recorded'
  | 'follow_ups_scheduled'
  | 'complete'

export type MissionLink = { label: string; href: string }

export type MissionPrimary =
  | ({ kind: 'link' } & MissionLink)
  /** Runs the matching engine for this fair (an existing endpoint), then reloads. */
  | { kind: 'run-matching'; label: string }
  /** The simple mission setup, shown in place. */
  | { kind: 'setup'; label: string }

export type MissionLine = { label: string; text: string }

export type MissionAction = {
  stage: MissionStage
  /** Small heading above the title. */
  eyebrow: string
  title: string
  location: string | null
  /** ABC's analysis, labelled as such. */
  lines: MissionLine[]
  /** Quoted listing facts, kept apart from `lines`. Empty when there is no company. */
  listing: string[]
  /** When the action is about one company: where "See why" leads. */
  whyHref: string | null
  primary: MissionPrimary
  /** Visually subordinate. Never more than two. */
  secondary: MissionLink[]
}

export const missionPaths = (eventKey: string) => {
  const base = `/events/intelligence/${eventKey}`
  return {
    mission: `${base}/mission`,
    opportunities: base,
    plan: `${base}/plan`,
    setup: `${base}/setup`,
    profile: `${base}/profile`,
    match: (matchId: string) => `${base}/m/${matchId}`,
    prepare: (matchId: string) => `${base}/m/${matchId}/prepare`,
    meetings: `/events/${eventKey}`,
    import: '/events/intelligence/import',
    hub: '/events/intelligence',
  }
}

export function locationOf(fact: Pick<MissionOpportunityFact, 'hall' | 'stand'>): string | null {
  const hall = fact.hall ? `Hall ${fact.hall.replace(/^hall\s*/i, '')}` : null
  const stand = fact.stand ? fact.stand : null
  return [hall, stand].filter(Boolean).join(' · ') || null
}

const byPriority = (a: MissionTargetFact, b: MissionTargetFact) =>
  a.priority - b.priority ||
  (a.hall ?? '￿').localeCompare(b.hall ?? '￿', undefined, { numeric: true }) ||
  (a.stand ?? '￿').localeCompare(b.stand ?? '￿', undefined, { numeric: true }) ||
  a.company.localeCompare(b.company) ||
  a.targetId.localeCompare(b.targetId)

const byDue = (a: MissionMeetingFact, b: MissionMeetingFact) =>
  (a.followUpAt ?? '').localeCompare(b.followUpAt ?? '') ||
  (a.personName ?? '￿').localeCompare(b.personName ?? '￿') ||
  a.encounterId.localeCompare(b.encounterId)

/** Targets still to meet: not skipped, and not linked to a recorded meeting. */
export function remainingTargets(facts: Pick<MissionFacts, 'targets'>): MissionTargetFact[] {
  return facts.targets.filter((t) => t.status !== 'skipped' && !t.met).sort(byPriority)
}

export function peopleMet(facts: Pick<MissionFacts, 'meetings'>): number {
  return new Set(facts.meetings.map((m) => m.contactId)).size
}

/** Meetings with a follow-up due now (today or overdue), earliest first. */
export function dueFollowUps(facts: Pick<MissionFacts, 'meetings'>): MissionMeetingFact[] {
  return facts.meetings.filter((m) => m.followUp === 'due').sort(byDue)
}

/** Meetings not yet in a CRM — counted only when a CRM is connected at all. */
export function crmPending(facts: Pick<MissionFacts, 'meetings' | 'crmConnected'>): MissionMeetingFact[] {
  if (!facts.crmConnected) return []
  return facts.meetings.filter((m) => !m.inCrm).sort(byDue)
}

/** People who need something from the owner after the fair: a due follow-up, or not in the CRM yet. */
export function relationshipsNeedingAttention(facts: Pick<MissionFacts, 'meetings' | 'crmConnected'>): string[] {
  const people = new Set<string>()
  for (const m of dueFollowUps(facts)) people.add(m.contactId)
  for (const m of crmPending(facts)) people.add(m.contactId)
  return [...people]
}

const personLabel = (m: MissionMeetingFact) => m.personName ?? m.company ?? 'this contact'

function companyAction(
  facts: MissionFacts,
  subject: MissionOpportunityFact,
  stage: MissionStage,
  eyebrow: string,
  lines: MissionLine[],
  primary: MissionPrimary,
  secondary: MissionLink[]
): MissionAction {
  const paths = missionPaths(facts.event.key)
  return {
    stage,
    eyebrow,
    title: subject.company,
    location: locationOf(subject),
    lines: lines.filter((line) => line.text.trim() !== ''),
    listing: subject.listing,
    whyHref: paths.match(subject.matchId),
    primary,
    secondary,
  }
}

function followUpAction(facts: MissionFacts, meeting: MissionMeetingFact): MissionAction {
  const lines: MissionLine[] = []
  if (meeting.discussed) lines.push({ label: 'You discussed', text: meeting.discussed })
  if (meeting.nextAction) lines.push({ label: 'Next step', text: meeting.nextAction })
  return {
    stage: 'follow_up',
    eyebrow: 'Follow up',
    title: `Follow up with ${personLabel(meeting)}`,
    location: meeting.personName && meeting.company ? meeting.company : null,
    lines,
    listing: [],
    whyHref: null,
    primary: { kind: 'link', label: 'Continue follow-up', href: `/contacts/${meeting.contactId}` },
    secondary: [{ label: 'See everyone you met', href: missionPaths(facts.event.key).meetings }],
  }
}

/**
 * The single most useful thing to do next, and nothing else.
 *
 * Ordered rules; the first that applies wins. The order is the product:
 *
 *   1. The mission is not set up → set it up.
 *   2. ABC holds no exhibitor list for the fair → import one (the only honest
 *      answer: ABC does not know every fair's exhibitors).
 *   3. After the fair → the relationships: due follow-ups, then the CRM, then
 *      done. Preparation no longer matters.
 *   4. Otherwise, a follow-up that is due now comes first — a real person is
 *      waiting, and ABC's own follow-up date says so.
 *   5. Nothing matched yet → find opportunities.
 *   6. During the fair → the next target to walk to, else scan people.
 *   7. Before the fair → prepare the highest-priority target, share a ready
 *      request, review the next strong opportunity, or review the plan.
 */
export function nextMissionAction(facts: MissionFacts): MissionAction {
  const paths = missionPaths(facts.event.key)
  const timing = missionTiming(facts.event, facts.today)

  if (!facts.setupComplete) {
    return {
      stage: 'setup_required',
      eyebrow: 'Set up',
      title: 'Tell ABC what you sell and who you are looking for',
      location: null,
      lines: [],
      listing: [],
      whyHref: null,
      primary: { kind: 'setup', label: 'Build my mission' },
      secondary: [],
    }
  }

  if (facts.exhibitors === 0) {
    return {
      stage: 'no_exhibitors',
      eyebrow: 'One thing is missing',
      title: `ABC does not have the exhibitor list for ${facts.event.name} yet`,
      location: null,
      lines: [
        {
          label: 'Why',
          text: 'The mission is built from the fair’s exhibitor list. Import the organiser’s export and ABC will find the companies worth your time.',
        },
      ],
      listing: [],
      whyHref: null,
      primary: { kind: 'link', label: 'Import the exhibitor list', href: paths.import },
      secondary: [],
    }
  }

  const due = dueFollowUps(facts)

  if (timing.kind === 'after') {
    if (facts.meetings.length === 0) {
      return {
        stage: 'no_meetings_recorded',
        eyebrow: `${facts.event.name} is over`,
        title: 'No meetings recorded at this fair',
        location: null,
        lines: [{ label: 'If you met people', text: 'Scan their cards and ABC keeps the meeting with them.' }],
        listing: [],
        whyHref: null,
        primary: { kind: 'link', label: 'Scan a card', href: '/scan' },
        secondary: [{ label: 'Plan your next fair', href: paths.hub }],
      }
    }

    const attention = relationshipsNeedingAttention(facts)
    const crm = crmPending(facts)

    if (attention.length > 1) {
      const first = due[0] ?? crm[0]
      const lines: MissionLine[] = []
      if (due.length > 0) lines.push({ label: 'Follow-ups due', text: String(due.length) })
      if (crm.length > 0) lines.push({ label: 'Not yet in your CRM', text: String(crm.length) })
      return {
        stage: 'relationships_need_attention',
        eyebrow: 'After the fair',
        title: `${attention.length} relationships need your attention`,
        location: null,
        lines,
        listing: [],
        whyHref: null,
        primary: { kind: 'link', label: 'Continue follow-ups', href: `/contacts/${first.contactId}` },
        secondary: [{ label: 'See everyone you met', href: paths.meetings }],
      }
    }

    if (due.length > 0) return followUpAction(facts, due[0])

    if (crm.length > 0) {
      const meeting = crm[0]
      const lines: MissionLine[] = []
      if (meeting.discussed) lines.push({ label: 'You discussed', text: meeting.discussed })
      return {
        stage: 'send_to_crm',
        eyebrow: 'After the fair',
        title: `Send ${personLabel(meeting)} to your CRM`,
        location: meeting.personName && meeting.company ? meeting.company : null,
        lines,
        listing: [],
        whyHref: null,
        primary: { kind: 'link', label: 'Send to CRM', href: `/contacts/${meeting.contactId}` },
        secondary: [{ label: 'See everyone you met', href: paths.meetings }],
      }
    }

    const scheduled = facts.meetings.filter((m) => m.followUp === 'scheduled')
    if (scheduled.length > 0) {
      return {
        stage: 'follow_ups_scheduled',
        eyebrow: 'After the fair',
        title: 'Your follow-ups are scheduled',
        location: null,
        lines: [
          { label: 'Scheduled', text: `${scheduled.length} follow-up${scheduled.length === 1 ? '' : 's'}` },
          { label: 'People met', text: String(peopleMet(facts)) },
        ],
        listing: [],
        whyHref: null,
        primary: { kind: 'link', label: 'See everyone you met', href: paths.meetings },
        secondary: [{ label: 'Plan your next fair', href: paths.hub }],
      }
    }

    const lines: MissionLine[] = [{ label: 'People met', text: String(peopleMet(facts)) }]
    if (facts.crmConnected) {
      lines.push({ label: 'In your CRM', text: String(facts.meetings.filter((m) => m.inCrm).length) })
    }
    return {
      stage: 'complete',
      eyebrow: facts.event.name,
      title: 'Mission complete',
      location: null,
      lines,
      listing: [],
      whyHref: null,
      primary: { kind: 'link', label: 'See everyone you met', href: paths.meetings },
      secondary: [{ label: 'Plan your next fair', href: paths.hub }],
    }
  }

  if (due.length > 0) return followUpAction(facts, due[0])

  if (facts.matchedCompanies === 0 && facts.targets.length === 0) {
    return {
      stage: 'find_opportunities',
      eyebrow: 'What matters next',
      title: 'Find the companies worth your time',
      location: null,
      lines: [
        {
          label: 'How',
          text: `ABC compares what you told it with the ${facts.exhibitors.toLocaleString('en-GB')} exhibitors it holds for this fair.`,
        },
      ],
      listing: [],
      whyHref: null,
      primary: { kind: 'run-matching', label: 'Find opportunities' },
      secondary: [{ label: 'Refine what you are looking for', href: paths.setup }],
    }
  }

  const remaining = remainingTargets(facts)

  if (timing.kind === 'live') {
    if (remaining.length > 0) {
      const target = remaining[0]
      return companyAction(
        facts,
        target,
        'visit_target',
        'What matters next',
        [
          { label: 'Why visit them', text: target.why ?? '' },
          { label: 'What to discuss', text: target.brief?.topic ?? '' },
          { label: 'What to show', text: target.brief?.productName ?? '' },
        ],
        { kind: 'link', label: 'Open target', href: paths.match(target.matchId) },
        [{ label: 'Scan a person', href: '/scan' }]
      )
    }
    return {
      stage: 'scan_people',
      eyebrow: 'What matters next',
      title: 'Meet people and scan their cards',
      location: null,
      lines: [{ label: 'People met so far', text: String(peopleMet(facts)) }],
      listing: [],
      whyHref: null,
      primary: { kind: 'link', label: 'Scan a person', href: '/scan' },
      secondary:
        facts.opportunities.length > 0 ? [{ label: 'Review more opportunities', href: paths.opportunities }] : [],
    }
  }

  // Before the fair, or no dates known.
  for (const target of remaining) {
    const brief = target.brief
    if (!brief || brief.status === 'draft') {
      return companyAction(
        facts,
        target,
        'prepare_target',
        'What matters next',
        [
          { label: 'Why it may matter', text: target.why ?? '' },
          { label: 'Your angle', text: brief?.topic ?? '' },
          { label: 'Show', text: brief?.productName ?? '' },
        ],
        { kind: 'link', label: 'Prepare this conversation', href: paths.prepare(target.matchId) },
        [{ label: 'Your plan', href: paths.plan }]
      )
    }
    if (brief.status === 'ready') {
      return companyAction(
        facts,
        target,
        'share_request',
        'Your meeting request is ready',
        [
          { label: 'Your angle', text: brief.topic ?? '' },
          { label: 'Show', text: brief.productName ?? '' },
        ],
        { kind: 'link', label: 'Share meeting request', href: paths.prepare(target.matchId) },
        [{ label: 'Your plan', href: paths.plan }]
      )
    }
    // Shared: an invitation is not a meeting. The target stays on the plan; move on.
  }

  const strong = facts.opportunities.find((o) => o.score > WEAK_SCORE)
  const first = facts.targets.length === 0 ? facts.opportunities[0] : strong
  if (first) {
    return companyAction(
      facts,
      first,
      'review_opportunities',
      facts.targets.length === 0 ? 'Start with the best opportunity' : 'Worth a look next',
      [{ label: 'Why it may matter', text: first.why ?? '' }],
      {
        kind: 'link',
        label: facts.targets.length === 0 ? 'Start with the best opportunities' : `Review ${first.company}`,
        href: paths.match(first.matchId),
      },
      [{ label: 'View all opportunities', href: paths.opportunities }]
    )
  }

  return {
    stage: 'plan_ready',
    eyebrow: 'What matters next',
    title: 'Your plan is ready',
    location: null,
    lines: [
      { label: 'Targets', text: String(remaining.length) },
      {
        label: 'Meeting requests shared',
        text: String(remaining.filter((t) => t.brief?.status === 'shared').length),
      },
    ],
    listing: [],
    whyHref: null,
    primary: { kind: 'link', label: 'Review my plan', href: paths.plan },
    secondary: [{ label: 'View all opportunities', href: paths.opportunities }],
  }
}

// ── Home card ────────────────────────────────────────────────────

export type MissionHomeSummary = {
  eventKey: string
  eventName: string
  timing: string | null
  live: boolean
  headline: string
  /** One quiet line: what the mission says to do next. */
  next: string | null
  cta: MissionLink
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

/** The next action as one short, verb-first line for Home: "Next: prepare XYZ Medical". */
export function nextLine(action: MissionAction): string | null {
  switch (action.stage) {
    case 'prepare_target':
      return `Next: prepare ${action.title}`
    case 'share_request':
      return `Next: share your meeting request with ${action.title}`
    case 'review_opportunities':
      return `Next: review ${action.title}`
    case 'visit_target':
      return `Next: visit ${action.title}${action.location ? ` · ${action.location}` : ''}`
    case 'plan_ready':
      return 'Next: review your plan'
    case 'scan_people':
      return 'Next: scan the people you meet'
    case 'complete':
    case 'setup_required':
    case 'no_exhibitors':
    case 'relationships_need_attention':
    case 'follow_ups_scheduled':
    case 'no_meetings_recorded':
      return null
    default:
      return `Next: ${lowerFirst(action.title)}`
  }
}

/** What the Home card says about a mission. Always one call to action. */
export function missionHomeSummary(facts: MissionFacts, action: MissionAction = nextMissionAction(facts)): MissionHomeSummary {
  const paths = missionPaths(facts.event.key)
  const timing = missionTiming(facts.event, facts.today)
  const remaining = remainingTargets(facts).length
  const base = {
    eventKey: facts.event.key,
    eventName: facts.event.name,
    timing: timingLabel(timing),
    live: timing.kind === 'live',
  }
  const next = nextLine(action)

  switch (action.stage) {
    case 'setup_required':
      return { ...base, headline: 'Finish setting up your mission', next: null, cta: { label: 'Continue setup', href: paths.mission } }
    case 'no_exhibitors':
      return { ...base, headline: 'Waiting for the exhibitor list', next: null, cta: { label: 'Import the exhibitor list', href: paths.import } }
    case 'find_opportunities':
      return { ...base, headline: 'Your mission is set up', next, cta: { label: 'Continue my mission', href: paths.mission } }
    case 'relationships_need_attention':
    case 'follow_up':
    case 'send_to_crm': {
      if (timing.kind === 'after') {
        const n = relationshipsNeedingAttention(facts).length
        return {
          ...base,
          headline: `${plural(n, 'relationship needs', 'relationships need')} follow-up`,
          next: action.stage === 'relationships_need_attention' ? null : next,
          cta: { label: 'Continue follow-ups', href: paths.mission },
        }
      }
      return { ...base, headline: 'A follow-up is due', next, cta: { label: 'Continue my mission', href: paths.mission } }
    }
    case 'follow_ups_scheduled':
      return { ...base, headline: 'Your follow-ups are scheduled', next: null, cta: { label: 'See my mission', href: paths.mission } }
    case 'no_meetings_recorded':
      return { ...base, headline: 'No meetings recorded at this fair', next: null, cta: { label: 'See my mission', href: paths.mission } }
    case 'complete':
      return { ...base, headline: 'Mission complete', next: null, cta: { label: 'See summary', href: paths.mission } }
    default:
      break
  }

  if (timing.kind === 'live') {
    return {
      ...base,
      headline: `${plural(peopleMet(facts), 'person', 'people')} met · ${plural(remaining, 'target', 'targets')} remaining`,
      next,
      cta: { label: 'Continue my mission', href: paths.mission },
    }
  }

  if (facts.targets.length === 0) {
    return {
      ...base,
      headline: 'Your mission is ready.',
      next: `${plural(facts.matchedCompanies, 'company', 'companies')} worth reviewing`,
      cta: { label: 'Start mission', href: paths.mission },
    }
  }

  const tomorrow = timing.kind === 'before' && timing.daysUntil === 1
  return {
    ...base,
    headline: `${plural(remaining, 'target', 'targets')} remaining`,
    next,
    cta: tomorrow ? { label: 'Review my plan', href: paths.plan } : { label: 'Continue my mission', href: paths.mission },
  }
}

// ── Which mission leads ──────────────────────────────────────────

/**
 * The one mission Home leads with.
 *
 * A fair happening now; otherwise the nearest one ahead; otherwise a fair that
 * is over but still has people waiting; otherwise one with no dates. A fair that
 * is over with nothing left to do does not lead — Home then asks where the owner
 * is going next. Ties break on the name, then the key, so the choice is stable.
 */
export function selectPrimaryMission<T extends MissionFacts>(missions: T[]): T | null {
  const scored = missions.map((facts) => ({ facts, timing: missionTiming(facts.event, facts.today) }))
  const byName = (a: { facts: T }, b: { facts: T }) =>
    a.facts.event.name.localeCompare(b.facts.event.name) || a.facts.event.key.localeCompare(b.facts.event.key)

  const live = scored
    .filter((m) => m.timing.kind === 'live')
    .sort((a, b) => (a.facts.event.endsOn ?? '').localeCompare(b.facts.event.endsOn ?? '') || byName(a, b))
  if (live[0]) return live[0].facts

  const upcoming = scored
    .filter((m): m is typeof m & { timing: { kind: 'before'; daysUntil: number } } => m.timing.kind === 'before')
    .sort((a, b) => a.timing.daysUntil - b.timing.daysUntil || byName(a, b))
  if (upcoming[0]) return upcoming[0].facts

  const unfinished = scored
    .filter(
      (m): m is typeof m & { timing: { kind: 'after'; daysSince: number } } =>
        m.timing.kind === 'after' && relationshipsNeedingAttention(m.facts).length > 0
    )
    .sort((a, b) => a.timing.daysSince - b.timing.daysSince || byName(a, b))
  if (unfinished[0]) return unfinished[0].facts

  const undated = scored.filter((m) => m.timing.kind === 'undated').sort(byName)
  if (undated[0]) return undated[0].facts

  return null
}

// ── Setup: three answers onto the existing profile and objective ──

/** What "Distributors" asks the engine to look for, as partnership interest. */
export const DISTRIBUTOR_TERMS = ['distributor', 'distribution'] as const

export type MissionSetupInput = {
  sell: string
  lookingFor: string
  suppliers: boolean
  distributors: boolean
  partners: boolean
}

export type MissionSetupBodies = {
  profile: Record<string, unknown>
  objective: Record<string, unknown>
}

const isDistributorTerm = (value: string) =>
  (DISTRIBUTOR_TERMS as readonly string[]).includes(value.trim().toLowerCase())

/** The answers the simple setup starts from, read from what ABC already holds. */
export function missionSetupDefaults(
  profile: CompanyIntentProfile | null,
  objective: EventObjective | null,
  productNames: string[] = []
): MissionSetupInput {
  const sell = profile?.whatWeSell.length
    ? profile.whatWeSell.join(', ')
    : productNames.length
      ? productNames.join(', ')
      : profile?.whatWeDo ?? ''
  const partnerFocus = objective?.partnerFocus ?? []
  return {
    sell,
    lookingFor: objective?.goals ?? profile?.whoWeWantToMeet ?? '',
    suppliers: (objective?.buyFocus.length ?? 0) > 0,
    distributors: partnerFocus.some(isDistributorTerm),
    partners: partnerFocus.some((term) => !isDistributorTerm(term)),
  }
}

/**
 * Map the three answers onto the profile and objective the engine already
 * reads — no second setup model.
 *
 *  - What you sell → `what_we_sell`, which drives the customer direction.
 *  - What you are looking for → the objective's goals, which the engine reads
 *    alongside who you want to meet.
 *  - Suppliers → what you need (`buy_focus`, and `what_we_buy` if empty).
 *  - Partners → partnership interest (`partner_focus`), from the same answer.
 *  - Distributors → partnership interest in distribution.
 *
 * Everything the simple form does not ask about — company name, capabilities,
 * industries, countries, notes — is carried over unchanged, so the form can
 * never wipe what the owner set in "Refine". Customers are always looked for:
 * "what do you sell" is exactly the question that finds them.
 */
export function missionSetupBodies(
  input: MissionSetupInput,
  eventKey: string,
  profile: CompanyIntentProfile | null,
  objective: EventObjective | null,
  fallbackCompanyName: string | null = null
): { ok: true; value: MissionSetupBodies } | { ok: false; error: string } {
  const sell = parseList(input.sell)
  const lookingFor = input.lookingFor.trim()
  const need = parseList(lookingFor)

  if (sell.length === 0 && !(input.suppliers && need.length > 0) && !profile?.whatWeDo && !(profile?.whatWeBuy.length)) {
    return { ok: false, error: 'Tell ABC what you sell — or choose Suppliers and say what you need.' }
  }

  const whatWeBuy = profile?.whatWeBuy.length ? profile.whatWeBuy : input.suppliers ? need : []

  const profileBody: Record<string, unknown> = {
    companyName: profile?.companyName ?? fallbackCompanyName,
    whatWeDo: profile?.whatWeDo ?? null,
    whatWeSell: sell.length > 0 ? sell : profile?.whatWeSell ?? [],
    whatWeBuy,
    whoWeWantToMeet: profile?.whoWeWantToMeet ?? null,
    targetIndustries: profile?.targetIndustries ?? [],
    targetCompanyTypes: profile?.targetCompanyTypes ?? [],
    capabilities: profile?.capabilities ?? [],
    technologies: profile?.technologies ?? [],
    materials: profile?.materials ?? [],
    certifications: profile?.certifications ?? [],
    geographies: profile?.geographies ?? [],
  }

  const existingPartners = (objective?.partnerFocus ?? []).filter((term) => !isDistributorTerm(term))
  const partnerFocus = [
    ...(input.partners ? (existingPartners.length > 0 ? existingPartners : need) : []),
    ...(input.distributors ? [...DISTRIBUTOR_TERMS] : []),
  ]
  const buyFocus = input.suppliers ? (objective?.buyFocus.length ? objective.buyFocus : need) : []

  const objectiveBody: Record<string, unknown> = {
    eventKey,
    goals: lookingFor || null,
    sellFocus: objective?.sellFocus ?? [],
    buyFocus,
    partnerFocus,
    priorityIndustries: objective?.priorityIndustries ?? [],
    priorityGeographies: objective?.priorityGeographies ?? [],
    notes: objective?.notes ?? null,
  }

  return { ok: true, value: { profile: profileBody, objective: objectiveBody } }
}
