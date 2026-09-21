import Link from 'next/link'

/**
 * The public footer, shared by every marketing surface.
 *
 * Only routes that exist are listed, and only one address: support@abccard.io
 * is the single published contact in this repository, so business enquiries are
 * pointed at it rather than at an invented sales alias. No social icons — ABC
 * has no configured public accounts, and empty icons advertise absence.
 *
 * The year is fixed rather than `new Date().getFullYear()`: a server component
 * rendering a live year is the classic way to get a hydration mismatch the
 * moment a page is statically rendered in one year and served in the next.
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
            <p className="pub-footer-pitch">From handshake to CRM in seconds.</p>
            <p className="pub-footer-flow" aria-hidden="true">
              Meet <span>→</span> Scan <span>→</span> Remember <span>→</span> Follow up <span>→</span> CRM
            </p>
          </div>

          <div className="pub-footer-col">
            <h2>Product</h2>
            <ul>
              <li>
                <Link href="/#product">Smart Scan</Link>
              </li>
              <li>
                <Link href="/#follow-up">Smart Follow-up</Link>
              </li>
              <li>
                <Link href="/#events">Event Workspace</Link>
              </li>
              <li>
                <Link href="/#crm">CRM integrations</Link>
              </li>
              <li>
                <Link href="/#event-intelligence">
                  Event &amp; Expo Intelligence <span className="pub-footer-soon">Coming soon</span>
                </Link>
              </li>
            </ul>
          </div>

          <div className="pub-footer-col">
            <h2>Explore</h2>
            <ul>
              <li>
                <Link href="/#pricing">Pricing</Link>
              </li>
              <li>
                <Link href="/login">Log in</Link>
              </li>
              <li>
                <Link href="/register">Get started</Link>
              </li>
              <li>
                <a href="mailto:support@abccard.io">Support</a>
              </li>
            </ul>
          </div>

          <div className="pub-footer-col">
            <h2>Legal</h2>
            <ul>
              <li>
                <Link href="/privacy">Privacy Policy</Link>
              </li>
              <li>
                <Link href="/terms">Terms of Service</Link>
              </li>
              <li>
                <Link href="/account-deletion">Account deletion</Link>
              </li>
              <li>
                <a href="mailto:support@abccard.io">support@abccard.io</a>
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
