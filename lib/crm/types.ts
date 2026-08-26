/**
 * The shape of a CRM export, without any provider in it.
 *
 * ABC knows about people, the meetings it had with them, and what it promised
 * next. HubSpot knows about contacts, companies, engagements and tasks. These
 * types are the seam: everything above them speaks ABC's language, everything
 * below translates. Pipedrive and Salesforce arrive later as new adapters
 * implementing the same operation, not as new branches through the app.
 */

import type { CrmProvider } from '@/lib/crm/connections'

export type { CrmProvider }

/** What ABC knows about the person, read from the database at export time. */
export type ExportContact = {
  id: string
  firstName: string | null
  lastName: string | null
  fullName: string | null
  email: string | null
  phone: string | null
  jobTitle: string | null
  companyName: string | null
  /** Used to derive a company domain, when it is trustworthy enough. */
  website: string | null
}

/** The one meeting being exported. Never a blend of several. */
export type ExportEncounter = {
  id: string
  metAt: string
  event: string | null
  discussed: string | null
  nextAction: string | null
  followUpAt: string | null
}

/**
 * How one step of the export went.
 *
 * `skipped` is a real outcome and not a failure — a contact with no follow-up
 * date should produce no task, and saying "skipped" is more honest than
 * inventing one or reporting success for work not done.
 */
export type StepState = 'synced' | 'created' | 'reused' | 'skipped' | 'failed' | 'not_started'

export type ExportStep = {
  state: StepState
  /** Safe for the browser: the provider's own id, never a token. */
  remoteId?: string | null
  /** A sentence a person can act on. Never a provider error dump. */
  message?: string
}

export type ExportResult = {
  provider: CrmProvider
  ok: boolean
  contact: ExportStep
  company: ExportStep
  association: ExportStep
  meeting: ExportStep
  task: ExportStep
  /** The connection needs authorizing again — a reconnect, not a retry. */
  needsReconnect?: boolean
  /** Rate limited or a provider outage: the same push will work later. */
  retryable?: boolean
}

export function step(state: StepState, extra: Partial<ExportStep> = {}): ExportStep {
  return { state, ...extra }
}

export const notStarted: ExportStep = { state: 'not_started' }

/**
 * Email domains that belong to a person, not to their employer.
 *
 * Deriving a company from an address at one of these would file everyone with
 * a Gmail account under a single company called Gmail — so a personal domain is
 * treated as no domain at all, and the company is matched by nothing rather
 * than by something wrong.
 */
const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'yahoo.co.uk', 'icloud.com', 'me.com', 'mac.com', 'aol.com',
  'proton.me', 'protonmail.com', 'gmx.com', 'gmx.net', 'web.de', 'seznam.cz',
  'centrum.cz', 'email.cz', 'zoho.com', 'yandex.com', 'mail.com', 'fastmail.com',
])

/**
 * A company domain, or null.
 *
 * Only ever taken from the company's own website. An email address is
 * deliberately not a source: `john@acme.com` looks like a safe inference right
 * up until the address is `john@gmail.com`, and a rule with an exception list
 * that long is a rule that will be wrong eventually.
 */
export function companyDomainFrom(website: string | null): string | null {
  const raw = (website || '').trim()
  if (!raw) return null

  let host: string
  try {
    host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname
  } catch {
    return null
  }

  host = host.toLowerCase().replace(/^www\./, '')
  if (!host.includes('.') || PERSONAL_DOMAINS.has(host)) return null

  return host
}
