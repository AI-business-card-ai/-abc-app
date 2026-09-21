import Link from 'next/link'
import { IconLock, IconMailForward, IconTrash, IconUserCheck } from '@tabler/icons-react'
import Chapter from '@/components/landing/cinema/Chapter'
import CinematicHeadline from '@/components/landing/cinema/CinematicHeadline'
import PanelGroup, { type Panel } from '@/components/landing/cinema/PanelGroup'

/**
 * Scene 7b — the systems ABC joins, and what it can touch.
 *
 * Two jobs in one chapter. Commercially it answers the objection a sales
 * manager raises next: nothing has to be replaced, ABC adds the layer that
 * happens before the CRM. And it is where someone reviewing the Gmail
 * connection can understand its purpose from the public homepage, without a
 * separate page built for reviewers.
 *
 * The four integrations are the ones that exist: HubSpot, Salesforce and
 * Pipedrive (lib/crm/providers) and Gmail (gmail.send). Apple and Google
 * Wallet passes are implemented but depend on issuer configuration that is not
 * confirmed live, so they are not shown here — a logo row is a promise.
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

const INTEGRATIONS = [
  { name: 'HubSpot', note: 'CRM sync' },
  { name: 'Salesforce', note: 'CRM sync' },
  { name: 'Pipedrive', note: 'CRM sync' },
  { name: 'Gmail', note: 'Send follow-ups' },
]

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
    body: 'Connect Gmail separately if you want to send follow-ups from your own address. ABC uses it only to send the message you reviewed. It does not read your inbox or your Google Contacts.',
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

export default function TrustSection() {
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

        <ul className="cine-integrations cine-rise" aria-label="Systems ABC works with">
          {INTEGRATIONS.map(({ name, note }) => (
            <li key={name}>
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

        <p className="cine-statement cine-rise">
          ABC doesn’t replace your CRM. It turns real conversations into CRM-ready context in
          seconds.
        </p>
      </div>
    </Chapter>
  )
}
