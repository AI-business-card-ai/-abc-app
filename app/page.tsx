import type { Metadata, Viewport } from 'next'
import LandingPage from '@/components/landing/LandingPage'
import { connectableCrmNames } from '@/lib/crm/availability'

/*
  The landing page's own metadata.

  The root layout's title — "ABC — Scan. Know. Connect." — is the app's own
  tagline, which the authenticated app also inherits; this route overrides it
  with the promise the landing makes.

  The page body is a client component (it checks for a session), and a client
  module cannot export metadata, so this file is a thin server wrapper.

  No og:image is set: there is no approved share image yet, and pointing at one
  that does not exist renders a broken preview everywhere the link is pasted.
*/
const TITLE = 'ABC Card — From handshake to follow-up in seconds'
/*
  No CRM is named here. Metadata is copied into link previews and search
  results, where it cannot follow which CRMs a deployment can connect; the
  hero names those, from configuration.
*/
const DESCRIPTION =
  'Capture a contact, remember the conversation, and create a meaningful follow-up. Everything you need to turn a meeting into a lasting connection. For salespeople, founders and exhibitors. Free to start.'

/*
  Same origin rule the release candidate already uses for links in email
  (lib/email.ts), so canonical and og:url follow the deployment rather than a
  domain hardcoded here. Without a base, the relative URLs below would resolve
  against localhost.
*/
const ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'https://abccard.io'

export const metadata: Metadata = {
  metadataBase: new URL(ORIGIN),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'ABC Card',
    title: TITLE,
    description: DESCRIPTION,
    url: '/',
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
  },
}

/*
  The landing is the dark public surface; the root layout's theme colour is
  the champagne workspace's. Overriding it here keeps a phone's browser bar
  near-black over a near-black page instead of a champagne strip above it.
*/
export const viewport: Viewport = {
  themeColor: '#0a0a0b',
}

export default function HomePage() {
  /*
    Read when the page is built — it is static — so a CRM configured later
    appears on the landing after the next deployment.
  */
  return <LandingPage crm={connectableCrmNames()} />
}
