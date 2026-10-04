import Link from 'next/link'

/**
 * The bar every public page wears.
 *
 * Four destinations, chosen to match the funnel rather than the feature list:
 * what ABC does with a meeting (Product), the lifecycle around an event (How it
 * works), the thing coming next (Event & Expo Intelligence) and what it costs.
 * Linking every chapter would turn a sales story into a table of contents.
 *
 * The section links are anchors into the landing page, so they are absolute
 * (`/#product`) rather than bare hashes — from /pricing or /terms they have to
 * navigate home first, and a bare `#product` there would silently do nothing.
 *
 * `menu` adds a disclosure for the narrow widths where the nav is hidden. It is
 * opt-in because only the landing styles it: the other public pages keep the
 * behaviour they shipped with, where a marketing header below 900px offers the
 * two things a visitor actually needs — sign in, and start. It is a `<details>`
 * rather than a state hook, so the header stays a server component and the menu
 * works before any JavaScript arrives.
 */
export default function PublicHeader({ menu = false }: { menu?: boolean }) {
  const links = (
    <>
      <Link href="/#product">Product</Link>
      <Link href="/#how-it-works">How it works</Link>
      <Link href="/#event-intelligence">Event &amp; Expo Intelligence</Link>
      <Link href="/#pricing">Pricing</Link>
    </>
  )

  return (
    <header className="pub-header">
      <div className="pub-container pub-header-inner">
        <Link href="/" className="pub-wordmark" aria-label="ABC Card — home">
          ABC<span>.</span>
        </Link>

        <nav className="pub-nav" aria-label="Product">
          {links}
        </nav>

        <div className="pub-header-actions">
          <Link href="/login" className="pub-signin">
            Log in
          </Link>
          <Link href="/register" className="pub-btn pub-btn-surface pub-btn-sm">
            Get started
          </Link>

          {menu ? (
            <details className="lp-menu">
              <summary aria-label="Menu">
                <span className="lp-menu-bars" aria-hidden="true" />
              </summary>
              <nav className="lp-menu-panel" aria-label="Sections">
                {links}
              </nav>
            </details>
          ) : null}
        </div>
      </div>
    </header>
  )
}
