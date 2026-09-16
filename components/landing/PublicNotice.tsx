import Link from 'next/link'
import type { ReactNode } from 'react'
import PublicHeader from '@/components/landing/PublicHeader'

type Action = { href: string; label: string; variant?: 'gold' | 'surface' }

/**
 * A single centred message with somewhere to go next.
 *
 * Used by the two pages Stripe returns to. They were the last stretch of the
 * paid flow still wearing the old brand: pink-to-cyan buttons, `#0f0f0f`
 * instead of the app's near-black, and `font-family: system-ui` overriding
 * Inter — so the moment a customer finished paying, the product changed
 * appearance underneath them.
 *
 * No footer here on purpose. These are transitions, not destinations, and a
 * four-column sitemap under "Payment successful" invites someone who has just
 * paid to go and read the privacy policy instead of using what they bought.
 */
export default function PublicNotice({
  eyebrow,
  title,
  children,
  actions,
}: {
  eyebrow?: string
  title: string
  children?: ReactNode
  actions: Action[]
}) {
  return (
    <div className="pub-root">
      <PublicHeader />

      <main className="pub-notice-wrap">
        <div className="pub-container">
          <div className="pub-notice">
            {eyebrow ? <p className="pub-eyebrow pub-notice-eyebrow">{eyebrow}</p> : null}
            <h1 className="pub-notice-title">{title}</h1>
            {children}
            <div className="pub-notice-actions">
              {actions.map(({ href, label, variant = 'surface' }) => (
                <Link
                  key={href}
                  href={href}
                  className={`pub-btn pub-btn-${variant}`}
                  style={{ width: '100%' }}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
