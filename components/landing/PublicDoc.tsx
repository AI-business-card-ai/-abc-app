import Link from 'next/link'
import PublicHeader from '@/components/landing/PublicHeader'
import PublicFooter from '@/components/landing/PublicFooter'

export type DocClause = { h: string; t: string }

/**
 * The shell for long-form public documents — privacy and terms.
 *
 * These pages previously drew their own header (a pink-to-cyan "ABC" that
 * matched nothing else by the time the app moved to gold), their own
 * near-black, and their own type sizes, then ended in a bare link to the other
 * one. A visitor who tapped "Privacy" from the footer arrived somewhere that
 * looked like a different company's site.
 *
 * The clause text is passed in and rendered verbatim. Nothing in here edits,
 * summarises or reflows the wording: this is a presentation shell for a legal
 * document, and the words are the owner's and their counsel's.
 */
export default function PublicDoc({
  title,
  effective,
  clauses,
  otherHref,
  otherLabel,
}: {
  title: string
  effective: string
  clauses: DocClause[]
  otherHref: string
  otherLabel: string
}) {
  return (
    <div className="pub-root">
      <PublicHeader />

      <main className="pub-section">
        <div className="pub-container">
          <article className="pub-doc">
            <h1 className="pub-doc-title">{title}</h1>
            <p className="pub-doc-meta">Effective date: {effective}</p>

            <div className="pub-doc-body">
              {clauses.map(({ h, t }) => (
                <section className="pub-doc-section" key={h}>
                  <h2>{h}</h2>
                  <p>{t}</p>
                </section>
              ))}
            </div>

            <div className="pub-doc-foot">
              <Link href={otherHref} className="pub-link">
                {otherLabel} →
              </Link>
              <a href="mailto:support@abccard.io" className="pub-link">
                support@abccard.io
              </a>
            </div>
          </article>
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}
