import { Reveal } from '@/components/landing/champagne/Parts'

/**
 * Scene 2 — the gap, in four objects.
 *
 * The old page spent a full chapter and three paragraphs here. The point needs
 * one sentence and four things everybody recognises, so that is all it gets:
 * two by two on a phone, four across on a desktop, and never a viewport tall.
 */

const CARRIERS = [
  { title: 'Business card', note: 'A name and a logo.' },
  { title: 'Notes app', note: 'Half a sentence, no owner.' },
  { title: 'Your phone', note: 'A photo you never open again.' },
  { title: 'Memory', note: 'Gone by the third stand.' },
]

export default function ProblemScene() {
  return (
    <section className="lp-section lp-section--warm" id="problem" aria-labelledby="problem-title">
      <div className="lp-container">
        <Reveal>
          <p className="lp-eyebrow">The problem</p>
        </Reveal>

        <Reveal delay={60}>
          <h2 className="lp-h2" id="problem-title">
            The meeting happened.
            <br />
            <span className="lp-shine">Your CRM still knows nothing.</span>
          </h2>
          <div className="lp-rule" aria-hidden="true" />
        </Reveal>

        <Reveal delay={100}>
          <p className="lp-lead">
            A business card gives you a name. It doesn’t remember what you discussed, what they
            needed, or what should happen next.
          </p>
        </Reveal>

        <Reveal delay={140}>
          <div className="lp-problem-grid">
            {CARRIERS.map((item) => (
              <div className="lp-mini" key={item.title}>
                <p className="lp-mini-title">{item.title}</p>
                <p className="lp-mini-note">{item.note}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
