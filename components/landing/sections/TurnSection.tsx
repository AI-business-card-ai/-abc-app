import Reveal from '@/components/landing/Reveal'

/**
 * The pivot, and the most important sentence on the page after the headline.
 *
 * Everything above it is the free card. Everything below it is the work ABC
 * does afterwards. A visitor who stops reading here should still leave knowing
 * the card was the doorway and not the building.
 *
 * It used to be a line of type bracketed by two horizontal rules, which read as
 * two hard dividers with a gap between them — the page stopping, then starting
 * again. It now runs a single thread down through the section instead: it
 * enters from the card above, pauses on a node beside the sentence, and
 * continues out of the bottom into Smart Scan. Same restraint, but the geometry
 * carries the handoff rather than announcing a break in it.
 *
 * The supporting line was three clauses about what happens over three weeks.
 * At this size, next to a sentence that short, explanation is the wrong
 * register — the moment wants to breathe.
 */
export default function TurnSection() {
  return (
    <section className="pub-turn-section" aria-label="From your card to what happens next">
      <div className="pub-container">
        <div className="pub-turn">
          {/* The line the eye follows out of the card chapter and into capture. */}
          <span className="pub-turn-thread pub-turn-thread--in" aria-hidden="true" />

          <Reveal>
            <p className="pub-turn-line">Your card is just the beginning.</p>
            <p className="pub-turn-sub">
              Your card gets you introduced. ABC handles what happens next.
            </p>
          </Reveal>

          <span className="pub-turn-thread pub-turn-thread--out" aria-hidden="true">
            <span className="pub-turn-node" />
          </span>
        </div>
      </div>
    </section>
  )
}
