import { IconBuildingStore, IconListCheck, IconTargetArrow } from '@tabler/icons-react'
import Reveal from '@/components/landing/Reveal'

/**
 * Event intelligence — the one thing on this page that is not built.
 *
 * This block previously held three cards under "in development": before, during
 * and after the event. Two of them had since shipped — event workspaces and
 * meeting history are both in the release candidate — so they were telling a
 * visitor that working features did not exist yet. They now live in their own
 * chapters, and only the genuinely future step remains here: knowing who is
 * worth meeting before you arrive.
 *
 * Kept deliberately quiet: no mockup, no screenshot, dashed rather than solid
 * cards, and "coming next" in the eyebrow rather than in small print. Nothing
 * here names the tooling it will be built on.
 */

const NEXT = [
  {
    Icon: IconBuildingStore,
    title: 'Who is exhibiting',
    body: 'The companies at the event, with their hall and stand.',
  },
  {
    Icon: IconTargetArrow,
    title: 'Who is worth your time',
    body: 'Likely customers, suppliers and partners — and why each one matches what you do.',
  },
  {
    Icon: IconListCheck,
    title: 'A plan for the day',
    body: 'A shortlist and a reason to talk to each of them, ready before you arrive.',
  },
]

export default function ComingNextSection() {
  return (
    <section className="pub-section pub-section--tight pub-section--raised" aria-labelledby="next-title">
      <div className="pub-container">
        <Reveal>
          <div className="pub-head-center">
            <p className="pub-eyebrow">Coming next · Event Intelligence</p>
            <h2 className="pub-h2" id="next-title">
              Before the event: know who is worth meeting.
            </h2>
            <p className="pub-lead">
              Not available yet. ABC already keeps what happens once you meet someone; this is the step
              before it.
            </p>
          </div>
        </Reveal>

        <div className="pub-grid pub-grid--3 pub-next">
          {NEXT.map(({ Icon, title, body }, i) => (
            <Reveal key={title} className="pub-card pub-next-card" delay={i * 60}>
              <span className="pub-card-icon" aria-hidden="true">
                <Icon size={17} stroke={1.7} />
              </span>
              <h3 className="pub-h3">{title}</h3>
              <p className="pub-body">{body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
