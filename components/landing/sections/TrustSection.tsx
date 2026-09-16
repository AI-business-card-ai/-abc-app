import Link from 'next/link'
import { IconLock, IconMailForward, IconTrash, IconUserCheck } from '@tabler/icons-react'
import Reveal from '@/components/landing/Reveal'

/**
 * What ABC does with an account, a mailbox and a contact list.
 *
 * Written so that someone reviewing the Gmail connection can understand its
 * purpose from the public homepage, without a separate page built for them.
 * Every line restates something the release candidate does and the privacy
 * policy already says — nothing here goes further than either:
 *
 *  - Sign in with Google requests identity scopes only.
 *  - Gmail is a separate, optional connection with the gmail.send scope, used
 *    to send a follow-up the owner has reviewed. ABC does not read, list or
 *    change email and does not access Google Contacts through it
 *    (docs/store/google-oauth-verification.md).
 *  - Gmail disconnect is in Settings → Integrations and revokes the token.
 *  - Account deletion is in Settings and explained at /account-deletion.
 *  - "We never sell your data or your contacts' data" is Privacy §3.
 *
 * No absolutes beyond those. In particular nothing here claims data is never
 * retained: the deletion page is explicit that some records may be kept.
 */

const POINTS = [
  {
    Icon: IconUserCheck,
    title: 'Signing in is only signing in',
    /*
      Providers are not enumerated: Apple sign-in is rendered in the RC but its
      provider may not be switched on yet, so naming it would be a claim.
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

export default function TrustSection() {
  return (
    <section id="trust" className="pub-section pub-section--raised" aria-labelledby="trust-title">
      <div className="pub-container">
        <Reveal>
          <div className="pub-head-center">
            <p className="pub-eyebrow">Your data</p>
            <h2 className="pub-h2" id="trust-title">
              You stay in control of what ABC can touch.
            </h2>
          </div>
        </Reveal>

        <div className="pub-grid pub-grid--4">
          {POINTS.map(({ Icon, title, body }, i) => (
            <Reveal key={title} className="pub-card" delay={i * 60}>
              <span className="pub-card-icon" aria-hidden="true">
                <Icon size={17} stroke={1.7} />
              </span>
              <h3 className="pub-h3">{title}</h3>
              <p className="pub-body">{body}</p>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <p className="pub-trust-links">
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
        </Reveal>
      </div>
    </section>
  )
}
