import Chapter from '@/components/landing/cinema/Chapter'
import CinematicHeadline from '@/components/landing/cinema/CinematicHeadline'

/**
 * Scene 6b — ABC Event & Expo Intelligence. The one thing on this page that is
 * not built.
 *
 * It is being developed separately (event-intelligence-v1) and is not part of
 * this release, so every reference to it on this page is marked coming soon:
 * the eyebrow, the badge above the headline, the preview panel's own label and
 * the pricing chapter. There is no purchase path anywhere, and no date.
 *
 * Kept short on purpose: it is a teaser for something unreleased, and it follows
 * a section where planning an event is shown as available today. The lead says
 * so in its first sentence, so nobody confuses the plan they can make now with
 * the intelligence that is coming.
 *
 * Two rules the preview follows, because this is the section most likely to
 * become an accidental promise:
 *
 *  - It describes what the product is intended to do ("is being built to",
 *    "planned"), never what it does.
 *  - Where a preview shows information, it separates what would be a source
 *    fact — an exhibitor list entry, a hall and stand — from what would be
 *    ABC's own reading of it. No match percentages appear anywhere: a number
 *    like that is a claim about accuracy nobody can make yet.
 *
 * Nothing here names the tooling it will be built on.
 *
 * MEDIA SLOT — `event-intelligence`.
 */

const INPUTS = ['What you do', 'What you sell', 'What you need', 'Who you want to meet', 'Which event you are attending']

export default function EventIntelligenceSection() {
  return (
    <Chapter
      id="event-intelligence"
      className="pub-section pub-section--raised cine-section--continued cine-future"
      labelledBy="event-intelligence-title"
      glow={{ x: '50%', y: '40%' }}
    >
      <div className="pub-container">
        <div className="pub-head-center">
          <p className="pub-eyebrow">ABC Event &amp; Expo Intelligence</p>
          <p className="cine-soon-badge">Coming soon</p>
          <CinematicHeadline id="event-intelligence-title" className="pub-h2">
            Know who is worth meeting before you enter the hall.
          </CinematicHeadline>
          {/*
            The truthful shape of the product: the exhibitor data comes in —
            from the event's own list — and ABC reads it against what you do.
            It does not arrive already knowing who exhibits where.
          */}
          <p className="pub-lead">
            You can plan an event in ABC today. Event &amp; Expo Intelligence is being built to help
            fill that plan in: bring in the event’s exhibitor list, tell ABC what you do, what you
            sell and what you need, and see which customers, suppliers and partners may be worth
            meeting.
          </p>
        </div>

        <div className="cine-ei">
          <div className="cine-ei-inputs cine-rise">
            <p className="cine-ei-label">You tell ABC</p>
            <ul>
              {INPUTS.map((input) => (
                <li key={input}>{input}</li>
              ))}
            </ul>

            <p className="cine-ei-label cine-ei-label--out">ABC helps you find</p>
            <ul className="cine-ei-outputs">
              <li>Customers</li>
              <li>Suppliers</li>
              <li>Partners</li>
            </ul>
          </div>

          {/*
            A preview, drawn as a preview: dashed, quiet, and labelled. What the
            exhibitor list says and what ABC makes of it are kept in separate
            blocks — the distinction the real product keeps between a source fact
            and its own analysis. No match percentage: a number like that is a
            claim about accuracy nobody can make yet.
          */}
          <div className="cine-ei-preview cine-rise" aria-label="Preview of a planned capability">
            <p className="cine-ei-preview-tag">Planned · not available yet</p>

            <p className="cine-ei-company">XYZ Robotics</p>
            <p className="cine-ei-kind">Potential partner</p>

            <dl className="cine-ei-facts">
              <div>
                <dt>Source facts · hall &amp; stand</dt>
                <dd>Exhibitor list · Hall 6 · Stand B42</dd>
              </div>
            </dl>

            <p className="cine-ei-group">ABC analysis</p>
            <dl className="cine-ei-facts cine-ei-analysis">
              <div>
                <dt>Why meet them</dt>
                <dd>They may be looking for a distribution partner for a range like yours in DACH.</dd>
              </div>
              <div>
                <dt>Conversation angle</dt>
                <dd>Distribution for 2027, before their next buying cycle.</dd>
              </div>
            </dl>
            <p className="cine-ei-action">Suggested: request a meeting at Stand B42</p>
          </div>
        </div>

        <p className="cine-statement cine-rise">Find the right company. Start the right conversation.</p>
      </div>
    </Chapter>
  )
}
