import Link from 'next/link'
import { GoldFlow, Reveal } from '@/components/landing/champagne/Parts'

/**
 * Scene 1 — the promise, and the product that keeps it.
 *
 * Two columns on desktop, stacked on a phone, and deliberately not a full
 * screen on either: the old hero filled a viewport and a half before a visitor
 * saw a single piece of product, which is most of why the page felt long.
 *
 * The right-hand composition is the argument in one object — a person, what
 * was said, what happens next, and where it goes. It is static markup rather
 * than the real components, which need a session and a database row, but every
 * row on it is a field ABC actually stores.
 */

const PROMISE = [
  'Capture the person.',
  'Remember the context.',
  'Follow up while it matters.',
  'Move the relationship forward.',
]

export default function HeroScene() {
  return (
    <section className="lp-hero" id="hero">
      <GoldFlow />

      <div className="lp-container lp-hero-grid">
        <div className="lp-hero-copy">
          <Reveal>
            <p className="lp-eyebrow">Turn meetings into opportunities</p>
          </Reveal>

          <Reveal delay={60}>
            <h1 className="lp-h1">From handshake to CRM in seconds.</h1>
          </Reveal>

          <Reveal delay={110}>
            <ul className="lp-promise">
              {PROMISE.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={160}>
            <div className="lp-ctas">
              <Link href="/register" className="lp-btn lp-btn-primary">
                Get started
              </Link>
              <Link href="/#how-it-works" className="lp-btn lp-btn-ghost">
                See how it works
              </Link>
            </div>
            <p className="lp-micro">Free to start. No credit card required.</p>
          </Reveal>
        </div>

        <Reveal className="lp-stage" delay={120}>
          <div className="lp-device">
            <div className="lp-device-head">
              <span className="lp-avatar" aria-hidden="true">
                LM
              </span>
              <span>
                <span className="lp-device-name">Lena Moreau</span>
                <span className="lp-device-role">Head of Procurement · Verbund Technik</span>
              </span>
            </div>

            <div className="lp-chain">
              <div className="lp-chain-row">
                <span className="lp-chain-label">Met at</span>
                <span className="lp-chain-value">Hannover Messe · Hall 6, Stand C24</span>
              </div>
              <div className="lp-chain-row is-accent">
                <span className="lp-chain-label">What we discussed</span>
                <span className="lp-chain-value">
                  Replacing two suppliers before Q1. Needs 48-hour lead times.
                </span>
              </div>
              <div className="lp-chain-row">
                <span className="lp-chain-label">Next step</span>
                <span className="lp-chain-value">Send lead-time breakdown by Thursday</span>
              </div>
              <div className="lp-chain-row">
                <span className="lp-chain-label">Follow-up</span>
                <span className="lp-chain-value">Draft ready · opens in your email</span>
              </div>
            </div>

            <div className="lp-chain-foot">
              <span>Saved to your contacts</span>
              <span className="lp-pill">In HubSpot</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
