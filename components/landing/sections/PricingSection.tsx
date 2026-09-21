import Link from 'next/link'
import { IconCheck, IconInfinity, IconScan } from '@tabler/icons-react'
import Reveal from '@/components/landing/Reveal'
import Chapter from '@/components/landing/cinema/Chapter'
import CinematicHeadline from '@/components/landing/cinema/CinematicHeadline'
import { PRICE_TBC, PRO_ACCESS, SCAN_PACKS, formatPrice } from '@/lib/landing/pricing'

/**
 * Scene 8a — what ABC costs, framed by what it saves.
 *
 * The architecture, in the order a buyer meets it: the free identity, the Pro
 * workflow, the intelligence tier that is coming, and — kept deliberately
 * apart from all three — the Smart Scan packs, which are usage credits rather
 * than a plan.
 *
 * Also rendered by /pricing, so this component is the single public statement
 * about money and the two surfaces can never disagree.
 *
 * What is deliberately missing, because nobody has decided it:
 *
 *  - Scan counts per pack. The prices are locked; the credit quantities come
 *    from unit economics that have not been calculated, and lib/billing/catalog
 *    treats a pack with no configured quantity as not configured at all.
 *  - Pro prices and the Event Pass duration. The access models are shown
 *    because the architecture is decided; the figures are not.
 *  - Purchase buttons for either, and any price for Event & Expo Intelligence.
 *    The one live action in this chapter is creating the free ABC.
 *
 * Pro is not a scan allowance and not unlimited scanning: credits are bought by
 * every account, Pro or not (lib/billing/catalog.ts).
 */

/** Verified ungated in the product — no plan check on any of these. */
const FREE_INCLUDES = [
  'Your ABC, with a permanent link and QR',
  'About, Looking for, your links and your work',
  'Save contact as a vCard, and sharing',
  'Two-way exchange — people send their details back',
  'Your contacts, meetings and events',
]

/**
 * Exactly the features gated behind Pro (lib/billing/pro-features.ts:
 * smart_follow_up, follow_up_sequence, gmail, crm). Meeting context, meeting
 * history and event workspaces are not gated, so they are not listed here.
 */
const PRO_INCLUDES = [
  'Smart Follow-up drafted from the meeting itself',
  'Scheduled follow-up sequences',
  'Send follow-ups from your own Gmail',
  'Sync to HubSpot, Salesforce and Pipedrive',
]

/** Planned, not sold. Mirrors the Event Intelligence chapter above. */
const INTELLIGENCE_INCLUDES = [
  'Find relevant customers, suppliers and partners',
  'Your event plan, with hall and stand',
  'Why each company may matter to you',
  'Meeting invitations and conversation angles',
  'Event-specific product material',
]

const VALUES = ['Less manual entry.', 'Faster follow-up.', 'Better CRM context.', 'More time for selling.']

export default function PricingSection() {
  return (
    <Chapter
      id="pricing"
      className="pub-section cine-pricing"
      labelledBy="pricing-title"
      glow={{ x: '50%', y: '40%' }}
    >
      <div className="pub-container">
        <div className="pub-head-center">
          <p className="pub-eyebrow">Pricing</p>
          <CinematicHeadline id="pricing-title" className="pub-h2">
            Save hours. Spend less than one lunch at the fair.
          </CinematicHeadline>
          <ul className="cine-values cine-values--inline">
            {VALUES.map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>
        </div>

        {/* ---------- 1. Free ---------- */}
        <Reveal>
          <div className="pub-tier-band">
            <div className="pub-tier-band-head">
              <p className="pub-plan-name">ABC Free</p>
              <p className="pub-tier-band-price">Free</p>
              <p className="pub-plan-note">
                Your professional identity, and the foundation for every new relationship. No
                payment method.
              </p>
              <div className="pub-tier-band-action">
                <Link href="/register" className="pub-btn pub-btn-gold">
                  Start free
                </Link>
                <p className="pub-body" style={{ marginTop: 12 }}>
                  No credit card required.
                </p>
              </div>
            </div>
            <ul className="pub-plan-list pub-tier-band-list">
              {FREE_INCLUDES.map((item) => (
                <li key={item}>
                  <IconCheck size={16} stroke={2.2} aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        {/* ---------- 2. Pro ---------- */}
        <Reveal delay={80}>
          <div className="pub-pro">
            <div className="pub-pro-head">
              <p className="pub-plan-name">ABC Pro</p>
              <p className="pub-plan-title">
                For professionals, founders and sales teams who turn meetings into business.
              </p>
              <p className="pub-plan-note">
                One product. Three ways to buy it, because someone who works two fairs a year should
                not be paying for twelve months of software.
              </p>
            </div>

            <ul className="pub-plan-list pub-pro-list">
              {PRO_INCLUDES.map((item) => (
                <li key={item}>
                  <IconCheck size={16} stroke={2.2} aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>

            <div className="pub-pro-access" role="list" aria-label="ABC Pro access models">
              {PRO_ACCESS.map(({ id, name, cadence, price }) => (
                <div className="pub-access" role="listitem" key={id}>
                  <p className="pub-access-name">{name}</p>
                  <p className="pub-access-cadence">{cadence}</p>
                  <p className="pub-access-price">{formatPrice(price)}</p>
                </div>
              ))}
            </div>

            <p className="pub-pro-note">
              {PRICE_TBC}. Pro is the workflow, not a scan allowance — Smart Scans stay separate,
              and every scanned contact gets the full Pro workflow when you have it.
            </p>
          </div>
        </Reveal>

        {/* ---------- 3. Event & Expo Intelligence — not for sale yet ---------- */}
        <Reveal delay={160}>
          <div className="pub-pro cine-tier-future">
            <div className="pub-pro-head">
              <p className="pub-plan-name">ABC Event &amp; Expo Intelligence</p>
              <p className="cine-soon-badge">Coming soon</p>
              <p className="pub-plan-title">Everything in Pro — plus intelligence before the meeting.</p>
              <p className="pub-plan-note">
                In development, and not available to buy. It is listed here so the direction is
                clear: ABC is being built for the whole event, not only the part after the
                handshake.
              </p>
            </div>

            <ul className="pub-plan-list pub-pro-list">
              {INTELLIGENCE_INCLUDES.map((item) => (
                <li key={item}>
                  <IconCheck size={16} stroke={2.2} aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        {/* ---------- 4. Smart Scan packs — usage, not a plan ---------- */}
        <Reveal delay={200}>
          <div className="pub-packs">
            <div className="pub-packs-copy">
              <p className="pub-plan-name">Smart Scan packs</p>
              <p className="pub-plan-title">Buy capture when you need it.</p>
              <p className="pub-plan-note">
                Not a plan — credits. Each Smart Scan turns a card into a contact and a meeting,
                with or without Pro, so you buy scans for the events you actually work.
              </p>
              <ul className="pub-packs-terms">
                <li>
                  <IconScan size={15} stroke={1.8} aria-hidden="true" />
                  One-time purchase
                </li>
                <li>
                  <IconInfinity size={15} stroke={1.8} aria-hidden="true" />
                  Credits never expire
                </li>
              </ul>
            </div>

            <div className="pub-packs-prices" role="list" aria-label="Smart Scan pack prices">
              {SCAN_PACKS.map(({ price, scans }) => (
                <div className="pub-pack" role="listitem" key={price}>
                  <p className="pub-pack-price">{formatPrice(price)}</p>
                  {/* Rendered only once a count is actually approved. */}
                  {scans === null ? null : <p className="pub-pack-scans">{scans} Smart Scans</p>}
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <p className="cine-statement cine-rise">Your time costs more than ABC.</p>
      </div>
    </Chapter>
  )
}
