import Link from 'next/link'
import { GoldFlow, Reveal } from '@/components/landing/champagne/Parts'
import { CURRENCY, PRICE_TBC, SCAN_PACKS } from '@/lib/landing/pricing'

/**
 * The compact pricing strip, and the close.
 *
 * Pricing is three cards rather than the old full catalogue chapter: the
 * header, the footer and the `/pricing` link guard all expect a `#pricing`
 * anchor to exist on this page, and a visitor who wants the detail has a page
 * for it.
 *
 * Every figure comes from `lib/landing/pricing.ts`, which is the one place
 * money is allowed to live. Pack prices are locked; Pro is not, so it renders
 * `PRICE_TBC` rather than a plausible guess. Nothing here is a checkout.
 */

const PACK_PRICES = SCAN_PACKS.map((pack) => `${CURRENCY}${pack.price}`).join(' · ')

export function PricingStrip() {
  return (
    <section className="lp-section lp-section--tight" id="pricing" aria-labelledby="pricing-title">
      <div className="lp-container">
        <Reveal>
          <p className="lp-eyebrow">Pricing</p>
        </Reveal>

        <Reveal delay={60}>
          <h2 className="lp-h2" id="pricing-title">
            Start free. Pay for what you scan.
          </h2>
        </Reveal>

        <div className="lp-prices">
          <Reveal delay={100}>
            <div className="lp-price">
              <p className="lp-price-name">ABC Free</p>
              <p className="lp-price-figure">Free</p>
              <p className="lp-price-note">
                Your digital card, your contacts and your meetings. No card required.
              </p>
            </div>
          </Reveal>

          <Reveal delay={130}>
            <div className="lp-price">
              <p className="lp-price-name">Smart Scan Packs</p>
              <p className="lp-price-figure">{PACK_PRICES}</p>
              <p className="lp-price-note">
                One-time packs. Credits never expire. Buy one when an event needs it.
              </p>
            </div>
          </Reveal>

          <Reveal delay={160}>
            <div className="lp-price">
              <p className="lp-price-name">ABC Pro</p>
              <p className="lp-price-figure">{PRICE_TBC}</p>
              <p className="lp-price-note">
                Event Pass, monthly or annual. Event &amp; Expo Intelligence is coming soon and is
                not on sale yet.
              </p>
            </div>
          </Reveal>
        </div>

        <Reveal delay={190}>
          <p className="lp-micro">
            <Link href="/pricing" className="lp-gold-text">
              See how pricing works
            </Link>
          </p>
        </Reveal>
      </div>
    </section>
  )
}

const PROMISE = [
  'Capture the person.',
  'Remember the context.',
  'Follow up while it matters.',
  'Move the relationship forward.',
]

export function FinalCtaScene() {
  return (
    <section className="lp-section lp-final" id="final-cta" aria-labelledby="final-cta-title">
      <GoldFlow variant="closing" />
      <div className="lp-container lp-final-inner">
        <Reveal>
          <h2 className="lp-h2" id="final-cta-title">
            Your next handshake could become your next opportunity.
          </h2>
        </Reveal>

        <Reveal delay={80}>
          <ul className="lp-promise">
            {PROMISE.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={130}>
          <div className="lp-ctas">
            <Link href="/register" className="lp-btn lp-btn-primary">
              Get started
            </Link>
            <Link href="/pricing" className="lp-btn lp-btn-ghost">
              See pricing
            </Link>
          </div>
          <p className="lp-micro">Free to start. No credit card required.</p>
        </Reveal>
      </div>
    </section>
  )
}
