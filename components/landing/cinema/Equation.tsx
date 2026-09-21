/**
 * A locked value equation, set as type: terms joined by "+", then what they
 * become.
 *
 *   Person + Conversation + Context + Next step → Ready for follow-up and CRM
 *
 * The funnel states two of these — what Smart Scan captures, and what reaches
 * the CRM — and they are the page's argument in one line each, so they get
 * one treatment rather than two improvised ones.
 *
 * Real text throughout, so it reads correctly aloud: the "+" is spoken as
 * "plus", and the arrow is swapped for the word "becomes" for screen readers,
 * where "right arrow" would mean nothing.
 */
export default function Equation({ terms, result }: { terms: string[]; result: string[] }) {
  return (
    <p className="cine-equation cine-rise">
      {terms.map((term, i) => (
        <span key={term} className="cine-eq-part">
          {i > 0 ? (
            <span className="cine-eq-op" aria-hidden="true">
              +
            </span>
          ) : null}
          {i > 0 ? <span className="cine-sr"> plus </span> : null}
          <span className="cine-eq-term">{term}</span>
        </span>
      ))}
      <span className="cine-eq-part">
        <span className="cine-eq-op cine-eq-arrow" aria-hidden="true">
          →
        </span>
        <span className="cine-sr"> becomes </span>
        {result.map((item, i) => (
          <span key={item} className="cine-eq-result">
            {i > 0 ? <span className="cine-sr">, </span> : null}
            {item}
          </span>
        ))}
      </span>
    </p>
  )
}
