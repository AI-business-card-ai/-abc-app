import Chapter from '@/components/landing/cinema/Chapter'
import CinematicHeadline from '@/components/landing/cinema/CinematicHeadline'

/**
 * Scene 2 — the problem, stated as the visitor's own Monday morning.
 *
 * The three questions carry the scene: they are what a salesperson actually
 * asks a week after an event, and they are exactly what a business card cannot
 * answer. Set as large type on their own, they do the work a paragraph of
 * explanation used to do badly.
 *
 * The fragments above them — a card, a note, a phone, memory — are drawn in
 * type and hairlines rather than as a comic pile of clutter: the page stays
 * premium while showing that the context is scattered.
 */

/** Where the context of a meeting actually ends up. */
const FRAGMENTS = [
  { label: 'Business card', note: 'A name and a logo.' },
  { label: 'Notes app', note: 'Half a sentence, no context.' },
  { label: 'Your phone', note: 'A photo of a stand you cannot place.' },
  { label: 'Memory', note: 'Fading since the second day of the fair.' },
]

const QUESTIONS = ['Who was this?', 'What did we discuss?', 'What was the next step?']

export default function ProblemSection() {
  return (
    <Chapter
      id="problem"
      className="pub-section pub-section--raised"
      labelledBy="problem-title"
      glow={{ x: '50%', y: '42%' }}
    >
      <div className="pub-container">
        <div className="pub-head-center">
          <p className="pub-eyebrow">The gap</p>
          <CinematicHeadline id="problem-title" className="pub-h2">
            The meeting happened. Your CRM still knows nothing about it.
          </CinematicHeadline>
          <p className="pub-lead">
            A business card gives you a name. It doesn’t remember what you discussed, what they
            needed, what you promised — or what should happen next. After a busy event, that context
            gets scattered across cards, notes, phones and memory.
          </p>
        </div>

        <ul className="cine-fragments cine-rise" aria-label="Where meeting context ends up">
          {FRAGMENTS.map(({ label, note }) => (
            <li key={label}>
              <p className="cine-fragment-label">{label}</p>
              <p className="pub-body">{note}</p>
            </li>
          ))}
        </ul>

        <div className="cine-questions cine-rise">
          {QUESTIONS.map((question) => (
            <p key={question} className="cine-question">
              {question}
            </p>
          ))}
        </div>

        <p className="cine-statement cine-rise">ABC closes the gap between the conversation and your CRM.</p>
      </div>
    </Chapter>
  )
}
