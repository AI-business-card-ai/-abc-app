import Link from 'next/link'

/**
 * The bar every public page wears.
 *
 * Four destinations, chosen to match the funnel rather than the feature list:
 * what ABC does with a meeting (Product), the lifecycle around an event (How it
 * works), the thing coming next (Event Intelligence) and what it costs. Linking
 * every chapter would turn a sales story into a table of contents.
 *
 * The section links are anchors into the landing page, so they are absolute
 * (`/#product`) rather than bare hashes — from /pricing or /terms they have to
 * navigate home first, and a bare `#product` there would silently do nothing.
 *
 * Deliberately not a client component and deliberately without a mobile
 * drawer: below 900px the nav collapses to the two things a visitor actually
 * needs from a marketing header — sign in, and start.
 */
export default function PublicHeader() {
  return (
    <header className="pub-header">
      <div className="pub-container pub-header-inner">
        <Link href="/" className="pub-wordmark" aria-label="ABC Card — home">
          ABC<span>.</span>
        </Link>

        <nav className="pub-nav" aria-label="Product">
          <Link href="/#product">Product</Link>
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/#event-intelligence">Event Intelligence</Link>
          <Link href="/#pricing">Pricing</Link>
        </nav>

        <div className="pub-header-actions">
          <Link href="/login" className="pub-signin">
            Log in
          </Link>
          <Link href="/register" className="pub-btn pub-btn-surface pub-btn-sm">
            Get started
          </Link>
        </div>
      </div>
    </header>
  )
}
