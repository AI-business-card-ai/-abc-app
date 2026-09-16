import Link from 'next/link'
import { IconCheck, IconInfinity, IconScan } from '@tabler/icons-react'
import Reveal from '@/components/landing/Reveal'
import {
  PRICE_TBC,
  PRO_ACCESS,
  SCAN_PACKS,
  formatPrice,
} from '@/lib/landing/pricing'

/**
 * The commercial architecture: identity is free, capture is prepaid, the
 * workflow is a subscription.
 *
 * Four beats down the page rather than a row of equal cards, because they are
 * not comparable things. The card is not a cheaper tier of Pro — it is a
 * different product with a different cost basis, which is the whole reason the
 * pricing works this way. Six matched boxes would flatten that into "pick a
 * size" and lose the argument.
 *
 * What is deliberately missing:
 *
 *  - Scan counts. The pack prices are locked; how many Smart Scans each buys
 *    depends on unit economics nobody has calculated. Rather than print a
 *    plausible number, the packs sell on the terms that are true today —
 *    one-time, and the credits never expire.
 *  - Pro prices. Same reason. The access models are shown because the
 *    architecture is decided; the figures are not.
 *  - Purchase buttons for either. Stripe is subscription-only and there is no
 *    credit ledger, so a Buy button here would lead nowhere. The one live CTA
 *    on this section is the free card, which genuinely works.
 *
 * Every value comes from lib/landing/pricing.ts so settling a number later is
 * a data edit rather than a rebuild.
 */

/** Verified ungated in the product — no plan check on any of these. */
const FREE_INCLUDES = [
  'Permanent public link and QR',
  'About, Looking for and your links',
  'Showcase gallery',
  'Save contact as a vCard, and sharing',
  'Two-way exchange — people send details back',
]

/**
 * Exactly the features the release candidate gates behind Pro
 * (lib/billing/pro-features.ts: smart_follow_up, follow_up_sequence, gmail, crm).
 * Meeting context, meeting history and event workspaces are not gated, so they
 * are not listed here — calling them paid would be false and would put free
 * users off features they already have.
 */
const PRO_INCLUDES = [
  'Smart Follow-up drafted from the meeting itself',
  'Scheduled follow-up sequences',
  'Send follow-ups from your own Gmail',
  'Sync to HubSpot, Salesforce and Pipedrive',
]

export default function PricingSection() {
  return (
    <section id="pricing" className="pub-section">
      <div className="pub-container">
        <Reveal>
          <div className="pub-head-center">
            <p className="pub-eyebrow">Pricing</p>
            <h2 className="pub-h2">Your card is free. Pay when ABC does the work.</h2>
            <p className="pub-lead">
              Being findable costs us nothing, so it costs you nothing. Reading a business card costs
              real processing, so you buy scans when you need them. The follow-up and CRM workflow is
              ABC Pro — for one event, a month or a year.
            </p>
          </div>
        </Reveal>

        {/* ---------- 1. Free ---------- */}
        <Reveal>
          <div className="pub-tier-band">
            <div className="pub-tier-band-head">
              <p className="pub-plan-name">ABC Card</p>
              <p className="pub-tier-band-price">Free</p>
              <p className="pub-plan-note">
                Your professional identity, for as long as you want it. No payment method.
              </p>
              <div className="pub-tier-band-action">
                <Link href="/register" className="pub-btn pub-btn-gold">
                  Create your card — free
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

        {/* ---------- 2. Smart Scan packs ---------- */}
        <Reveal>
          <div className="pub-packs">
            <div className="pub-packs-copy">
              <p className="pub-plan-name">Smart Scan</p>
              <p className="pub-plan-title">Buy capture when you need it.</p>
              <p className="pub-plan-note">
                Each Smart Scan turns a card into a contact and a meeting, with or without Pro. Buy
                scans in packs instead of paying for a subscription you only need twice a year.
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

        {/* ---------- 3. Pro ---------- */}
        <Reveal>
          <div className="pub-pro">
            <div className="pub-pro-head">
              <p className="pub-plan-name">ABC Pro</p>
              <p className="pub-plan-title">Smart Scan captures the meeting. ABC Pro moves it forward.</p>
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
              {PRICE_TBC}. Pro is the workflow, not a scan allowance — Smart Scans stay separate, and
              every scanned contact gets the full Pro workflow when you have it.
            </p>
          </div>
        </Reveal>

      </div>
    </section>
  )
}
