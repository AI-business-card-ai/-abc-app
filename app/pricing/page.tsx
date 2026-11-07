import type { Metadata } from 'next'
import PublicFooter from '@/components/landing/PublicFooter'
import PublicHeader from '@/components/landing/PublicHeader'
import PricingSection from '@/components/landing/sections/PricingSection'
import { landingIntegrations } from '@/lib/landing/integrations'

/**
 * Pricing — what ABC sells today, and nothing it does not.
 *
 * This page used to sell the legacy Starter, Growth, Pro and Team monthly USD
 * subscriptions, with lifetime scan caps and features the product does not
 * have ("Priority enrichment", "Shared contacts", "Team pipeline"). Those plans
 * are retired: the checkout route that created them now refuses
 * (app/api/stripe/checkout), and this page is no longer a way to buy them.
 *
 * It now shows the same pricing chapter as the landing page, so the two can
 * never disagree: the free card; Smart Scan Packs at their locked prices, marked
 * not on sale yet, one-time,
 * credits never expiring, with no scan count until one is decided; ABC Pro as
 * Event Pass, Monthly and Annual, with "Pricing coming soon" until prices are
 * set. Every value comes from lib/landing/pricing.ts. It offers no purchase —
 * the only live action is creating the free card. An ABC Pro product that is
 * configured in Stripe is bought from Settings → Plan & Billing.
 *
 * The store apps never reach this page: middleware sends /pricing to Plan &
 * Billing (lib/billing/commerce.ts).
 */

const TITLE = 'Pricing — ABC Card'
const DESCRIPTION =
  'Your ABC Card is free. Smart Scan Packs and ABC Pro are coming soon: packs as one-time purchases whose credits never expire, Pro as an Event Pass, monthly or annual access.'

/* Relative URLs resolve against the root layout's metadataBase, the canonical origin. */
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/pricing' },
  openGraph: { type: 'website', siteName: 'ABC Card', title: TITLE, description: DESCRIPTION, url: '/pricing' },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION },
}

export default function PricingPage() {
  return (
    <div className="pub-root cine">
      {/* Without JavaScript nothing would ever mark a chapter as seen (same rule as the landing page). */}
      <noscript>
        <style>
          {
            '.cine .cine-chapter :is(.pub-eyebrow,.cine-h,.pub-lead,.cine-rise,.cine-item,.cine-media){opacity:1!important;transform:none!important}'
          }
        </style>
      </noscript>
      <PublicHeader />

      <main>
        {/* Static, like the landing: what can be connected is read at build time. */}
        <PricingSection integrations={landingIntegrations()} />
      </main>

      <PublicFooter />
    </div>
  )
}
