import type { Metadata } from 'next'
import LandingPage from '@/components/landing/LandingPage'

/*
  The landing page's own metadata.

  The root layout's title — "ABC — Scan. Know. Connect." — and its description
  promising "a sent message in 10 seconds" describe an earlier product and an
  unmeasured claim. They stay on the root layout, which the authenticated app
  also inherits; this route overrides them with what ABC is now.

  The page body is a client component (it checks for a session), and a client
  module cannot export metadata, so this file is a thin server wrapper.

  No og:image is set: there is no approved share image yet, and pointing at one
  that does not exist renders a broken preview everywhere the link is pasted.
*/
const TITLE = 'ABC Card — From handshake to CRM in seconds'
const DESCRIPTION =
  'Scan a business card and ABC keeps the person, the meeting, what you discussed and the next step — then drafts the follow-up and syncs the relationship to HubSpot, Salesforce or Pipedrive. Your ABC Card is free.'

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

export default function HomePage() {
  return <LandingPage />
}
