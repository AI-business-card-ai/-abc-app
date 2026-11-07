import Link from 'next/link'
import { IconLock, IconMailForward, IconTrash, IconUserCheck } from '@tabler/icons-react'
import Chapter from '@/components/landing/cinema/Chapter'
import CinematicHeadline from '@/components/landing/cinema/CinematicHeadline'
import PanelGroup, { type Panel } from '@/components/landing/cinema/PanelGroup'
import { CRM_PROVIDERS } from '@/lib/crm/providers'
import type { LandingIntegrations } from '@/lib/landing/integrations'

/**
 * Scene 7b — the systems ABC joins, and what it can touch.
 *
 * Two jobs in one chapter. Commercially it answers the objection a sales
 * manager raises next: nothing has to be replaced, ABC adds the layer that
 * happens before the CRM. And it is where someone reviewing the Gmail
 * connection can understand its purpose from the public homepage, without a
 * separate page built for reviewers.
 *
 * The integrations are the ones that exist in code — HubSpot, Pipedrive and
 * Salesforce (lib/crm/providers), the CSV export, and Gmail (gmail.send) — each
 * with what this deployment can actually do with it (lib/landing/integrations).
 * A logo row is a promise, so a connection that would be refused here is shown
 * as not available yet rather than as a working one. Apple and Google Wallet
 * passes depend on issuer configuration that is not confirmed live, so they are
 * not shown at all.
 *
 * Every control restates something the release does and the privacy policy
 * already says:
 *
 *  - Sign in with Google requests identity scopes only.
 *  - Gmail is a separate, optional connection with the gmail.send scope, used
 *    to send a follow-up the owner has reviewed. ABC does not read, list or
 *    change email and does not access Google Contacts through it.
 *  - Gmail and CRM disconnect in Settings → Integrations, which revokes.
 *  - Account deletion is in Settings and explained at /account-deletion.
 *  - "We never sell your data or your contacts' data" is Privacy §3.
 *
 * No absolutes beyond those. In particular nothing claims data is never
 * retained: the deletion page is explicit that some records may be kept.
 */

/*
  "Not available yet" is said in the row itself rather than by leaving the name
  out, so a missing name is never read as a missing feature, nor a listed one as
  a working connection.
*/
function integrationRows({ crm, gmail }: LandingIntegrations) {
  return [
    ...CRM_PROVIDERS.map(({ name }) =>
      crm.includes(name)
        ? { name, note: 'Direct CRM sync', on: true }
        : { name, note: 'Not available yet', on: false }
    ),
    { name: 'CSV', note: 'Export for any CRM', on: true },
    gmail
      ? { name: 'Gmail', note: 'Send follow-ups', on: true }
      : { name: 'Gmail', note: 'Not available yet', on: false },
  ]
}

const POINTS = [
  {
    Icon: IconUserCheck,
    title: 'Signing in is only signing in',
    /*
      Providers are not enumerated: Apple sign-in is rendered but its provider
      may not be switched on yet, so naming it would be a claim.
    */
    body: 'However you sign in, it only identifies you. Signing in with Google gives ABC your identity — not access to your mailbox.',
  },
  {
    Icon: IconMailForward,
    title: 'Gmail is optional, and send-only',
    body: 'Gmail is a separate connection, part of ABC Pro. Once connected, ABC uses it only to send the follow-up you reviewed, from your own address. It does not read your inbox or your Google Contacts.',
  },
  {
    Icon: IconLock,
    title: 'Disconnect whenever you like',
    body: 'Remove Gmail or a CRM from Settings → Integrations at any time. Your contacts are yours: we never sell your data or your contacts’ data.',
  },
  {
    Icon: IconTrash,
    title: 'Delete your account yourself',
    body: 'Delete your account from Settings, straight away. The account deletion page explains exactly what is removed.',
  },
]

const PANELS: Panel[] = POINTS.map(({ Icon, title, body }) => ({
  key: title,
  title,
  lead: (
    <span className="cine-step-icon">
      <Icon size={18} stroke={1.7} />
    </span>
  ),
  body: <p className="pub-body">{body}</p>,
}))

export default function TrustSection({ integrations }: { integrations: LandingIntegrations }) {
  return (
    <Chapter
      id="integrations"
      className="pub-section pub-section--raised"
      labelledBy="integrations-title"
      glow={{ x: '50%', y: '52%' }}
    >
      <div className="pub-container">
        <div className="pub-head-center">
          <p className="pub-eyebrow">Integrations &amp; trust</p>
          <CinematicHeadline id="integrations-title" className="pub-h2">
            Keep your workflow. Add ABC to the part that happens before it.
          </CinematicHeadline>
          <p className="pub-lead">
            Your team keeps the CRM it already uses and the mailbox it already sends from. ABC adds
            the layer neither of them covers: the real-world meeting.
          </p>
        </div>

        <ul className="cine-integrations cine-rise" aria-label="Integrations, and what each can do here">
          {integrationRows(integrations).map(({ name, note, on }) => (
            <li key={name} className={on ? undefined : 'is-off'}>
              <span className="cine-integration-name">{name}</span>
              <span className="cine-integration-note">{note}</span>
            </li>
          ))}
        </ul>

        <PanelGroup panels={PANELS} className="cine-trust" label="How ABC handles your account and data" />

        <p className="pub-trust-links cine-rise">
          <Link href="/privacy" className="pub-link">
            Privacy Policy
          </Link>
          <Link href="/terms" className="pub-link">
            Terms of Service
          </Link>
          <Link href="/account-deletion" className="pub-link">
            Account deletion
          </Link>
          <a href="mailto:support@abccard.io" className="pub-link">
            support@abccard.io
          </a>
        </p>

      </div>
    </Chapter>
  )
}
