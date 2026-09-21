import { IconBuildingStore, IconFileText, IconMailForward, IconTargetArrow } from '@tabler/icons-react'
import Chapter from '@/components/landing/cinema/Chapter'
import CinematicHeadline from '@/components/landing/cinema/CinematicHeadline'

/**
 * Scene 6b — ABC Event & Expo Intelligence. The one thing on this page that is
 * not built.
 *
 * It is being developed separately (event-intelligence-v1) and is not part of
 * this release, so every reference to it on this page is marked coming soon:
 * the eyebrow, the badge above the headline, the preview panel's own label and
 * the pricing chapter. There is no purchase path anywhere.
 *
 * Two rules the preview follows, because this is the section most likely to
 * become an accidental promise:
 *
 *  - It describes what the product is intended to do ("can help you find",
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

const OUTPUTS = [
  {
    Icon: IconBuildingStore,
    title: 'Who is exhibiting',
    /*
      Provenance, said out loud. ABC does not hold a directory of every fair on
      earth and must not imply it does: the exhibitor list is something the
      event publishes and you bring in, and what ABC adds is the reading of it.
    */
    body: 'The event’s exhibitor list, brought into ABC with hall and stand.',
  },
  {
    Icon: IconTargetArrow,
    title: 'Who may be worth meeting',
    body: 'Potential customers, suppliers and partners — with the reason each one may matter to you.',
  },
  {
    Icon: IconFileText,
    title: 'What to show them',
    /*
      The planned material layer — videos, brochures, technical sheets — named
      here as intent. The shipping Showcase stores images only, so none of this
      may migrate to the "Your ABC" chapter until it exists.
    */
    body: 'The product to bring to that conversation — with short videos, brochures and technical material chosen for it.',
  },
  {
    Icon: IconMailForward,
    title: 'How to start',
    body: 'A meeting invitation and a conversation angle, ready before you arrive.',
  },
]

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
            from the event's own list — and ABC turns it into targets and a
            plan. It does not arrive already knowing who exhibits where.
          */}
          <p className="pub-lead">
            Bring in the event’s exhibitor list and tell ABC what you do, what you sell and what you
            need. Event &amp; Expo Intelligence is being built to turn that list into relevant
            customers, suppliers and partners — and an Event Plan for the day.
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
                <dt>What you may offer</dt>
                <dd>Your 2027 component range.</dd>
              </div>
              <div>
                <dt>What you may need</dt>
                <dd>An integration partner already present in the region.</dd>
              </div>
              <div>
                <dt>Conversation angle</dt>
                <dd>Distribution for 2027, before their next buying cycle.</dd>
              </div>
            </dl>
            <p className="cine-ei-action">Suggested: request a meeting at Stand B42</p>
          </div>
        </div>

        <ul className="cine-grid-quiet cine-rise">
          {OUTPUTS.map(({ Icon, title, body }) => (
            <li key={title}>
              <span className="pub-card-icon" aria-hidden="true">
                <Icon size={17} stroke={1.7} />
              </span>
              <h3 className="pub-h3">{title}</h3>
              <p className="pub-body">{body}</p>
            </li>
          ))}
        </ul>

        <p className="cine-statement cine-rise">
          Find the right company. Show the right product. Start the right conversation.
        </p>
        <p className="cine-callout cine-rise cine-centered">
          Walk into the event with a plan — not just a ticket.
        </p>
      </div>
    </Chapter>
  )
}
