import Link from 'next/link'

/**
 * The bar every public page wears.
 *
 * Previously each surface drew its own: the landing had a pink-to-cyan
 * gradient wordmark, pricing had "ABC" with a cyan full stop, and the legal
 * pages had a third variant. Three headers meant three answers to "what is
 * this product called", and crossing between them read as leaving the site.
 *
 * The section links are anchors into the landing page, so they are absolute
 * (`/#capture`) rather than bare hashes — from /pricing or /terms they have to
 * navigate home first, and a bare `#capture` there would silently do nothing.
 *
 * Deliberately not a client component and deliberately without a mobile
 * drawer: below 900px the nav collapses to the two things a visitor actually
 * needs from a marketing header — sign in, and start. A hamburger hiding four
 * anchor links would be more machinery than the page has content.
 */
export default function PublicHeader() {
  return (
    <header className="pub-header">
      <div className="pub-container pub-header-inner">
        <Link href="/" className="pub-wordmark" aria-label="ABC Card — home">
          ABC<span>.</span>
        </Link>

        <nav className="pub-nav" aria-label="Product">
          <Link href="/#card">The card</Link>
          <Link href="/#remember">How it works</Link>
          <Link href="/#pricing">Pricing</Link>
        </nav>

        <div className="pub-header-actions">
          <Link href="/login" className="pub-signin">
            Sign in
          </Link>
          <Link href="/register" className="pub-btn pub-btn-surface pub-btn-sm">
            Create your free card
          </Link>
        </div>
      </div>
    </header>
  )
}
