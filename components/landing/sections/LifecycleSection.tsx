import Chapter from '@/components/landing/cinema/Chapter'
import CinematicHeadline from '@/components/landing/cinema/CinematicHeadline'
import PanelGroup, { type Panel } from '@/components/landing/cinema/PanelGroup'

/**
 * Scene 6a — the zoom-out: one event, one relationship workflow.
 *
 * The visitor has just seen the working product. This is where the page shows
 * the whole lifecycle around it, and it has one job beyond that: to make
 * unmistakable which parts exist today and which part does not.
 *
 * All three phases are marked "Available now", in the phase itself rather than
 * in small print underneath: Before is planning the event, which ships
 * (app/events/new — objectives, companies to visit, people to meet, meetings
 * to arrange). What does not exist yet, Event & Expo Intelligence, sits inside
 * Before as its own block, flagged "Coming next" and drawn quieter with a
 * dashed edge. Anyone skimming this section must come away knowing they can
 * plan an event today and cannot yet buy the intelligence.
 *
 * It is the page's third and last panel group, and it carries the thread that
 * the next chapter picks up.
 */

const PHASES: Panel[] = [
  {
    key: 'before',
    title: 'Who should I meet?',
    lead: (
      <>
        <span className="cine-step-num">Before</span>
        <span className="cine-phase-flag">Available now</span>
      </>
    ),
    body: (
      <>
        <p className="pub-body">
          Plan the event in ABC: your objectives, the companies to visit, the people to meet and
          the meetings to arrange.
        </p>
        <div className="cine-phase-next">
          <span className="cine-phase-flag cine-phase-flag--next">Coming next</span>
          <p className="cine-phase-product">ABC Event &amp; Expo Intelligence</p>
          <p className="pub-body">
            Being built to find the companies worth your time before you walk into the hall.
          </p>
        </div>
      </>
    ),
  },
  {
    key: 'during',
    title: 'Who did I meet — and why does it matter?',
    lead: (
      <>
        <span className="cine-step-num">During</span>
        <span className="cine-phase-flag">Available now</span>
      </>
    ),
    body: (
      <p className="pub-body">
        Capture the person, the conversation, the context and the next step — in the few seconds
        after you shake hands.
      </p>
    ),
  },
  {
    key: 'after',
    title: 'What happens next?',
    lead: (
      <>
        <span className="cine-step-num">After</span>
        <span className="cine-phase-flag">Available now</span>
      </>
    ),
    body: (
      <p className="pub-body">
        Follow up while the meeting is still fresh, and move the relationship into your CRM.
      </p>
    ),
  },
]

export default function LifecycleSection() {
  return (
    <Chapter
      id="how-it-works"
      className="pub-section pub-section--raised"
      labelledBy="lifecycle-title"
      glow={{ x: '50%', y: '60%' }}
    >
      <div className="pub-container">
        <div className="pub-head-center">
          <p className="pub-eyebrow">The whole event</p>
          <CinematicHeadline id="lifecycle-title" className="pub-h2">
            One event. One relationship workflow.
          </CinematicHeadline>
        </div>

        <PanelGroup
          panels={PHASES}
          className="cine-phases"
          label="Before, during and after an event"
          initial={1}
        />

        <p className="cine-statement cine-rise">
          Before. During. After. ABC keeps the relationship moving.
        </p>
        <p className="cine-question cine-rise cine-centered">
          What if ABC could also find who is worth meeting?
        </p>
      </div>
    </Chapter>
  )
}
