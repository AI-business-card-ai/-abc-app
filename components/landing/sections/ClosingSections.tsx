import Link from 'next/link'
import {
  IconBuildingFactory2,
  IconBuildingSkyscraper,
  IconMicrophone2,
  IconUsers,
} from '@tabler/icons-react'
import Reveal from '@/components/landing/Reveal'
import Chapter from '@/components/landing/cinema/Chapter'
import CinematicHeadline from '@/components/landing/cinema/CinematicHeadline'

/**
 * The closing chapters: who this is for, the questions that stop people, and
 * the last call to action.
 *
 * Grouped because each is short and they are read as one run-out at the bottom
 * of the page. No social proof appears anywhere here: ABC has no customer
 * numbers, testimonials or logos it can truthfully show yet, and inventing
 * them is the fastest way to make a serious B2B product look like it is
 * pretending.
 */

/* ------------------------------------------------------------- audience */

const CONTEXTS = [
  {
    Icon: IconBuildingSkyscraper,
    title: 'Trade fairs and exhibitions',
    body: 'Three days, a hundred conversations, and a stack of cards that means nothing by the following Monday.',
  },
  {
    Icon: IconMicrophone2,
    title: 'Conferences and events',
    body: 'The people worth knowing are met in corridors and at dinners, not in the sessions.',
  },
  {
    Icon: IconUsers,
    title: 'Sales and business development',
    body: 'Where the difference between a lead and an opportunity is whether anyone followed up with something specific.',
  },
  {
    Icon: IconBuildingFactory2,
    title: 'Suppliers and manufacturers',
    body: 'Long relationships built over years of meeting the same people at the same fairs.',
  },
]

export function AudienceSection() {
  return (
    /*
      Dark now. The page's one light chapter is the closing call to action, so
      the lights come on once, at the end, rather than halfway down.
    */
    <Chapter className="pub-section" labelledBy="audience-title" glow={{ x: '50%', y: '60%' }}>
      <div className="pub-container">
        <div className="pub-head-center">
          <p className="pub-eyebrow">Who it is for</p>
          <CinematicHeadline id="audience-title" className="pub-h2">
            For people whose business happens in person.
          </CinematicHeadline>
          <p className="pub-lead">
            Founders, sales directors, business development and commercial teams — anyone whose
            pipeline starts with meeting someone and shaking their hand.
          </p>
        </div>

        <div className="pub-grid pub-grid--4 cine-facts">
          {CONTEXTS.map(({ Icon, title, body }, i) => (
            <Reveal key={title} className="pub-card" delay={i * 70}>
              <span className="pub-card-icon" aria-hidden="true">
                <Icon size={17} stroke={1.7} />
              </span>
              <h3 className="pub-h3">{title}</h3>
              <p className="pub-body">{body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </Chapter>
  )
}

/* ------------------------------------------------------------------ FAQ */

const FAQ = [
  {
    q: 'Is the ABC Card really free?',
    a: 'Yes. You create your card, publish it at a permanent link with its own QR code, and share it without paying and without entering a payment method. What costs money is the work ABC does for you: Smart Scans are bought in packs, and ABC Pro covers Smart Follow-up, sending from Gmail and CRM sync.',
  },
  {
    q: 'Do Smart Scan credits expire?',
    a: 'No. Credits are a one-time purchase and they stay on your account until you use them. Buy a pack before a fair in March, use half of it, and the rest is still there in November for the next one. That is the point of selling capture this way rather than as a monthly quota you lose.',
  },
  {
    q: 'Does the person I meet need the app?',
    a: 'No. Your card is a web page. They scan the QR or open the link, see your details, and can save you as a contact or send their own details back — all in the browser, with nothing to install and no account to create.',
  },
  {
    q: 'Does ABC send messages on my behalf?',
    a: 'Only when you press Send. ABC drafts the follow-up from the meeting you recorded and you review it. If you have connected Gmail, ABC sends that message from your own address; otherwise it opens WhatsApp, LinkedIn or your messages app with the text ready. Nothing goes out automatically.',
  },
  {
    q: 'Why would ABC ask for access to my Gmail?',
    a: 'Only so you can send follow-ups from your own address, and only if you choose to connect it — it is separate from signing in. ABC asks for permission to send email and nothing else: it does not read your inbox or your Google Contacts. You can disconnect Gmail at any time in Settings → Integrations.',
  },
  {
    q: 'Which CRMs does it export to?',
    a: 'HubSpot, Pipedrive and Salesforce, plus a CSV export you can take anywhere. Exporting is always something you trigger for a contact, to the one destination you choose — connecting more than one CRM does not mean ABC writes to both.',
  },
  {
    q: 'What happens to the contacts I scan?',
    a: 'They are yours. You are the controller of that data and ABC processes it on your instructions — we do not sell it, and we do not contact the people in it. You are responsible for having a lawful basis to store and contact them, which is covered in the privacy policy.',
  },
  {
    q: 'Can I use it with my team?',
    a: 'Everyone on your team can create their own ABC Card and run their own contacts, events, meetings and follow-ups. Shared team workspaces and lead ownership are not available yet — get in touch at support@abccard.io if that is how your team works an event.',
  },
]

export function FaqSection() {
  return (
    <Chapter className="pub-section" labelledBy="faq-title">
      <div className="pub-container">
        <div className="pub-head-center">
          <p className="pub-eyebrow">Questions</p>
          <CinematicHeadline id="faq-title" className="pub-h2">
            Before you start.
          </CinematicHeadline>
        </div>

        <Reveal delay={120}>
          {/*
            Native <details>. It is keyboard-operable, findable by the
            browser's own in-page search, and works with no JavaScript at all —
            three things a hand-rolled accordion would each have to re-earn.
          */}
          <div className="pub-faq">
            {FAQ.map(({ q, a }) => (
              <details className="pub-faq-item" key={q}>
                <summary className="pub-faq-q">
                  {q}
                  <span className="pub-faq-mark" aria-hidden="true" />
                </summary>
                <p className="pub-faq-a">{a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </Chapter>
  )
}

/* ------------------------------------------------------------ final CTA */

export function FinalCtaSection() {
  return (
    /*
      The one light chapter on the page: after a long dark composition, the
      close opens up — warm ivory, graphite type, the same headline light in
      its bronze variant, and a graphite primary instead of gold.
    */
    <Chapter className="pub-section cine-final" labelledBy="final-cta-title">
      <div className="pub-container">
        <div className="pub-head-center">
          <CinematicHeadline id="final-cta-title" className="pub-h2" tone="light">
            Never lose a valuable connection again.
          </CinematicHeadline>
          <p className="pub-lead">
            Start with your ABC Card — it is free. The next person you meet gets a card worth
            keeping, and a follow-up worth reading.
          </p>
          <div className="pub-actions pub-actions-center cine-rise">
            <Link href="/register" className="pub-btn cine-btn-graphite">
              Create your free ABC Card
            </Link>
            <Link href="/#pricing" className="pub-btn cine-btn-outline">
              See pricing
            </Link>
          </div>
          <p className="pub-body cine-rise cine-final-note">Free to create. No credit card required.</p>
        </div>
      </div>
    </Chapter>
  )
}
