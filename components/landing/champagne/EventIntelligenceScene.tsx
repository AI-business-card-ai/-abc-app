import { Anchor, Reveal } from '@/components/landing/champagne/Parts'

/**
 * Scene 5 — one event, one workflow.
 *
 * The canonical name of the family is **Event & Expo Intelligence**. "Expo
 * Mission" is not a product and does not appear here; if it ships it will be a
 * feature inside this, and naming it on the landing would promise a second
 * thing to buy.
 *
 * Before / During / After is marketing storytelling about the lifecycle. It is
 * not navigation, and nothing in the product is organised into phases.
 *
 * The honesty rule this scene exists to hold: DURING and AFTER are shipped and
 * say so; BEFORE is not built, is labelled COMING SOON, and is never priced,
 * never linked to checkout, and never written in the present tense.
 */

const SIGNALS = [
  'Customers',
  'Suppliers',
  'Partners',
  'Company',
  'Hall & stand',
  'Why meet',
  'Conversation angle',
]

export default function EventIntelligenceScene() {
  return (
    <section className="lp-section" id="event-intelligence" aria-labelledby="event-intelligence-title">
      <Anchor id="events" />
      <div className="lp-container">
        <Reveal>
          <p className="lp-eyebrow">Event &amp; Expo Intelligence</p>
        </Reveal>

        <Reveal delay={60}>
          <h2 className="lp-h2" id="event-intelligence-title">
            One event. One relationship workflow.
          </h2>
        </Reveal>

        <div className="lp-phases">
          <Reveal delay={100}>
            <div className="lp-phase lp-phase--next">
              <p className="lp-phase-when">Before</p>
              <p className="lp-phase-title">Find the right people.</p>
              <p className="lp-phase-note">
                Know who is worth meeting before you enter the hall.
              </p>
              <span className="lp-status lp-status--soon">Coming soon</span>
            </div>
          </Reveal>

          <Reveal delay={140}>
            <div className="lp-phase">
              <p className="lp-phase-when">During</p>
              <p className="lp-phase-title">Capture the person and the context.</p>
              <p className="lp-phase-note">
                Scan the card, keep what was said, and leave with the next step recorded.
              </p>
              <span className="lp-status lp-status--now">Available now</span>
            </div>
          </Reveal>

          <Reveal delay={180}>
            <div className="lp-phase">
              <p className="lp-phase-when">After</p>
              <p className="lp-phase-title">Follow up and move to your CRM.</p>
              <p className="lp-phase-note">
                Continue the conversation while it is fresh, then hand it to HubSpot, Pipedrive or
                Salesforce.
              </p>
              <span className="lp-status lp-status--now">Available now</span>
            </div>
          </Reveal>
        </div>

        <Reveal delay={200}>
          <p className="lp-micro">
            What Event &amp; Expo Intelligence is being built to answer — not available yet:
          </p>
          <div className="lp-signals">
            {SIGNALS.map((signal) => (
              <span className="lp-signal" key={signal}>
                {signal}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
