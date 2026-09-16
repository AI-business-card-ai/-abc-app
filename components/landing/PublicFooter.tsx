import Link from 'next/link'

/**
 * The public footer, shared by every marketing surface.
 *
 * Only routes that exist are listed. The previous footer was a centred row of
 * three links under the strapline "Scan. Know. Connect." — a description of a
 * scanner, which is the half of the product the site is trying to stop being
 * filed under.
 *
 * The year is fixed rather than `new Date().getFullYear()`: a server component
 * rendering a live year is the classic way to get a hydration mismatch the
 * moment a page is statically rendered in one year and served in the next, and
 * a copyright date is not worth a client boundary.
 */
export default function PublicFooter() {
  return (
    <footer className="pub-footer">
      <div className="pub-container">
        <div className="pub-footer-top">
          <div>
            <Link href="/" className="pub-wordmark" aria-label="ABC Card — home">
              ABC<span>.</span>
            </Link>
            <p className="pub-footer-pitch">
              From handshake to follow-up to CRM. ABC turns the people you meet into
              relationships your business can act on.
            </p>
          </div>

          <div className="pub-footer-col">
            <h2>Product</h2>
            <ul>
              <li>
                <Link href="/#card">The ABC Card</Link>
              </li>
              <li>
                <Link href="/#remember">How it works</Link>
              </li>
              <li>
                <Link href="/#pricing">Pricing</Link>
              </li>
            </ul>
          </div>

          <div className="pub-footer-col">
            <h2>Company</h2>
            <ul>
              <li>
                <Link href="/privacy">Privacy</Link>
              </li>
              <li>
                <Link href="/terms">Terms</Link>
              </li>
              <li>
                <Link href="/account-deletion">Account deletion</Link>
              </li>
              <li>
                <a href="mailto:support@abccard.io">support@abccard.io</a>
              </li>
              <li>
                <Link href="/login">Sign in</Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="pub-footer-bottom">
          <p style={{ margin: 0 }}>© 2026 abccard.io</p>
          <p style={{ margin: 0 }}>Built for people who do business in person.</p>
        </div>
      </div>
    </footer>
  )
}
