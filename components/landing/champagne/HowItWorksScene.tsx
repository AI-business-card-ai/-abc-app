import { Anchor, Reveal } from '@/components/landing/champagne/Parts'

/**
 * Scene 3 — what ABC captures, and what it becomes.
 *
 * Four steps, then one panel showing the result. The panel carries a domain
 * rule the product is built on and the marketing has to respect:
 *
 *   **PERSON ≠ ENCOUNTER.** Lena is one person. The two meetings underneath her
 *   are two encounters on that one record. Scanning her card at the next fair
 *   adds a row to the list; it never creates a second Lena.
 *
 * Laid out that way on purpose — a visitor reads the hierarchy before they read
 * the words, and a mockup showing two cards for one person would promise a
 * duplicate-ridden database.
 */

const STEPS = [
  { n: '1', title: 'Scan', note: 'Scan the card.' },
  { n: '2', title: 'Context', note: 'Remember what you discussed.' },
  { n: '3', title: 'Next step', note: 'Keep what should happen next.' },
  { n: '4', title: 'CRM', note: 'Move the relationship forward.' },
]

export default function HowItWorksScene() {
  return (
    <section className="lp-section" id="product" aria-labelledby="product-title">
      <Anchor id="how-it-works" />
      <div className="lp-container">
        <Reveal>
          <p className="lp-eyebrow">How it works</p>
        </Reveal>

        <Reveal delay={60}>
          <h2 className="lp-h2" id="product-title">
            Capture <span className="lp-shine">more than a business card.</span>
          </h2>
          <div className="lp-rule" aria-hidden="true" />
        </Reveal>

        <Reveal delay={100}>
          <div className="lp-steps">
            {STEPS.map((step) => (
              <div className="lp-step" key={step.n}>
                <span className="lp-step-num" aria-hidden="true">
                  {step.n}
                </span>
                <span>
                  <span className="lp-step-title">{step.title}</span>
                  <span className="lp-step-note">{step.note}</span>
                </span>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={140}>
          <div className="lp-capture">
            <div className="lp-scan" aria-hidden="true">
              <span className="lp-scan-corner tl" />
              <span className="lp-scan-corner tr" />
              <span className="lp-scan-corner bl" />
              <span className="lp-scan-corner br" />
              <div className="lp-scan-card">
                <div className="lp-scan-line is-gold" />
                <div className="lp-scan-line" />
                <div className="lp-scan-line is-short" />
              </div>
            </div>

            <div className="lp-person">
              <div className="lp-person-head">
                <span className="lp-avatar" aria-hidden="true">
                  LM
                </span>
                <span>
                  <span className="lp-device-name">Lena Moreau</span>
                  <span className="lp-device-role">Verbund Technik · one contact</span>
                </span>
              </div>

              <div className="lp-meetings">
                <div className="lp-meeting">
                  <p className="lp-meeting-when">Hannover Messe · April</p>
                  <p className="lp-meeting-what">
                    Replacing two suppliers before Q1. Next: lead-time breakdown by Thursday.
                  </p>
                </div>
                <div className="lp-meeting">
                  <p className="lp-meeting-when">Formnext · November</p>
                  <p className="lp-meeting-what">
                    Trial order signed off. Next: introduce their production lead.
                  </p>
                </div>
              </div>

              <p className="lp-micro">
                Two meetings, one contact — a second scan adds the meeting, never a second Lena.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
